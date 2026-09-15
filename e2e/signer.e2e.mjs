/** P0.4 black-box signer checks against two HTTP hosts in a real child process (one shared writer). */
import test from 'node:test';
import assert from 'node:assert/strict';
import { fork } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import { fixtureKey, publicKey } from '../src/identity.mjs';
import { PortableSigner, restorePortableSigner } from '../src/local-signer.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
async function request(url, path, body, token) {
  const res = await fetch(url + path, { signal: AbortSignal.timeout(5_000), ...(body === undefined ? {} : {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: JSON.stringify(body)
  }) });
  return { status: res.status, data: await res.json() };
}
async function lab(t) {
  const child = fork(new URL('./host-process.mjs', import.meta.url), [], { cwd: root, silent: true, execArgv: [] });
  let output = '', exited = false; child.stdout.on('data', x => { output = (output + x).slice(-20_000); }); child.stderr.on('data', x => { output = (output + x).slice(-20_000); });
  const exit = once(child, 'exit').then(() => { exited = true; });
  t.after(async () => { if (!exited) { if (child.connected) child.send({ type: 'shutdown' }); else child.kill('SIGTERM'); const timer = setTimeout(() => child.kill('SIGKILL'), 2_000); try { await exit; } finally { clearTimeout(timer); } } });
  const ready = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => done(new Error('Readiness timeout: ' + output)), 10_000);
    const onExit = () => done(new Error('Early exit: ' + output)), onError = e => done(e), onMessage = m => { if (m?.type === 'ready') done(null, m); };
    function done(error, value) { clearTimeout(timer); child.off('message', onMessage); child.off('exit', onExit); child.off('error', onError); error ? reject(error) : resolve(value); }
    child.on('message', onMessage); child.once('exit', onExit); child.once('error', onError);
  });
  return { urls: ready.urls };
}
async function snapshot(url) { const r = await request(url, '/api/state'); assert.equal(r.status, 200); return r.data; }
async function login(url, signer) {
  const c = await request(url, '/api/challenges', { principal: signer.principal }); assert.equal(c.status, 200);
  const r = await request(url, '/api/sessions', { challenge: c.data, signature: signer.signLogin(c.data) }); assert.equal(r.status, 200, JSON.stringify(r.data)); return r.data.token;
}

test('one host-neutral signer authenticates independently through two competing hosts', { timeout: 20_000 }, async t => {
  const l = await lab(t), signer = new PortableSigner({ principal: 'alice', world: 'oatrix-lab-v2', privateKey: fixtureKey('alice'), audiences: l.urls });
  const [a, b] = l.urls, tokenA = await login(a, signer), tokenB = await login(b, signer);
  assert.notEqual(tokenA, tokenB);
  const before = await snapshot(a);
  const envelope = signer.signIntent(before, { action: 'transfer', args: { to: 'bob', amount: 17 }, expectedHead: before.head, expiresIn: 20 });
  assert.equal((await request(b, '/api/commands', envelope, tokenB)).status, 200);
  assert.equal((await snapshot(a)).state.balances.bob, before.state.balances.bob + 17);
  assert.equal(JSON.stringify({ envelope, tokenA, tokenB }).includes('PRIVATE KEY'), false);
});

test('gateway mutation cannot substitute destination/action/principal after signing', { timeout: 20_000 }, async t => {
  const l = await lab(t), signer = new PortableSigner({ principal: 'alice', world: 'oatrix-lab-v2', privateKey: fixtureKey('alice'), audiences: l.urls });
  const token = await login(l.urls[0], signer), before = await snapshot(l.urls[0]);
  const signed = signer.signIntent(before, { action: 'transfer', args: { to: 'bob', amount: 9 }, expectedHead: before.head, expiresIn: 20 });
  for (const mutate of [
    e => { e.body.args.to = 'founder'; }, e => { e.body.args.amount = 900; }, e => { e.body.action = 'buy'; }, e => { e.body.principal = 'bob'; }
  ]) {
    const changed = structuredClone(signed); mutate(changed); const r = await request(l.urls[0], '/api/commands', changed, token);
    assert.equal(r.status, 400); assert.ok(['BAD_SIGNATURE', 'SESSION_PRINCIPAL', 'BAD_FIELDS'].includes(r.data.error), r.data.error);
  }
  assert.deepEqual(await snapshot(l.urls[0]), before);
});

test('a login approval is specific to the host that issued the challenge', { timeout: 20_000 }, async t => {
  const l = await lab(t), signer = new PortableSigner({ principal: 'alice', world: 'oatrix-lab-v2', privateKey: fixtureKey('alice'), audiences: l.urls });
  const c = await request(l.urls[0], '/api/challenges', { principal: 'alice' }), signature = signer.signLogin(c.data);
  const other = await request(l.urls[1], '/api/sessions', { challenge: c.data, signature });
  assert.equal(other.status, 400); assert.equal(other.data.error, 'CHALLENGE_INVALID');
  assert.throws(() => signer.signLogin({ ...c.data, audience: 'https://evil.example' }), /AUDIENCE_NOT_ALLOWED/);
});

test('offline sealed-key recovery can move to another host; old vault becomes stale after rotation', { timeout: 20_000 }, async t => {
  const l = await lab(t), original = new PortableSigner({ principal: 'alice', world: 'oatrix-lab-v2', privateKey: fixtureKey('alice'), audiences: l.urls });
  const vault = original.seal('correct horse battery staple'), recovered = restorePortableSigner(vault, 'correct horse battery staple', { audiences: [l.urls[1]] });
  const token = await login(l.urls[1], recovered), before = await snapshot(l.urls[1]);
  const nextKey = fixtureKey('alice_p04_rotated');
  const rotation = recovered.signIntent(before, { action: 'rotateKey', args: { publicKey: publicKey(nextKey) }, expectedHead: before.head, expiresIn: 20 });
  assert.equal((await request(l.urls[1], '/api/commands', rotation, token)).status, 200);
  const after = await snapshot(l.urls[1]);
  assert.throws(() => recovered.signIntent(after, { action: 'transfer', args: { to: 'bob', amount: 1 }, expectedHead: after.head, expiresIn: 20 }), /SIGNER_NOT_CURRENT/);
  const replacement = new PortableSigner({ principal: 'alice', world: 'oatrix-lab-v2', privateKey: nextKey, audiences: l.urls });
  const newToken = await login(l.urls[0], replacement), fresh = await snapshot(l.urls[0]);
  assert.equal((await request(l.urls[0], '/api/commands', replacement.signIntent(fresh, { action: 'transfer', args: { to: 'bob', amount: 1 }, expectedHead: fresh.head, expiresIn: 20 }), newToken)).status, 200);
});

test('pinned approval rejects unrelated cross-host state change and requires fresh approval', { timeout: 20_000 }, async t => {
  const l = await lab(t), [a, b] = l.urls;
  const alice = new PortableSigner({ principal: 'alice', world: 'oatrix-lab-v2', privateKey: fixtureKey('alice'), audiences: l.urls });
  const bob = new PortableSigner({ principal: 'bob', world: 'oatrix-lab-v2', privateKey: fixtureKey('bob'), audiences: l.urls });
  const before = await snapshot(a), approval = alice.signIntent(before, { action: 'transfer', args: { to: 'bob', amount: 9 }, expectedHead: before.head, expiresIn: 20 });
  const other = bob.signIntent(before, { action: 'transfer', args: { to: 'founder', amount: 1 }, expectedHead: before.head, expiresIn: 20 });
  assert.equal((await request(b, '/api/commands', other)).status, 200);
  const current = await snapshot(a), stale = await request(a, '/api/commands', approval);
  assert.equal(stale.status, 400); assert.equal(stale.data.error, 'HEAD_CHANGED'); assert.deepEqual(await snapshot(b), current);
  const token = await login(a, alice); const retry = await request(a, '/api/commands', approval, token);
  assert.equal(retry.status, 400); assert.equal(retry.data.error, 'HEAD_CHANGED');
  const fresh = alice.signIntent(current, { action: 'transfer', args: { to: 'bob', amount: 9 }, expectedHead: current.head, expiresIn: 20 });
  assert.equal((await request(b, '/api/commands', fresh)).status, 200); assert.equal((await snapshot(a)).state.balances.bob, 10008);
  assert.equal((await request(a, '/api/commands', fresh)).data.error, 'HEAD_CHANGED');
});
test('two hosts cannot both accept independently signed approvals for one exact predecessor', { timeout: 20_000 }, async t => {
  const l = await lab(t), before = await snapshot(l.urls[0]);
  const approvals = ['alice', 'bob'].map(principal => new PortableSigner({ principal, world: before.state.world, privateKey: fixtureKey(principal), audiences: l.urls })
    .signIntent(before, { action: 'transfer', args: { to: 'founder', amount: 1 }, expectedHead: before.head, expiresIn: 20 }));
  const r = await Promise.all(l.urls.map((url, i) => request(url, '/api/commands', approvals[i])));
  assert.deepEqual(r.map(x => x.status).sort(), [200, 400]); assert.equal(r.find(x => x.status === 400).data.error, 'HEAD_CHANGED');
  const after = await snapshot(l.urls[0]); assert.deepEqual(after, await snapshot(l.urls[1])); assert.equal(after.state.balances.founder, before.state.balances.founder + 1);
});
