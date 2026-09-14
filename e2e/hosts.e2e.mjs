/** Black-box process/HTTP checks: no direct Journal, reducer or gateway access. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { fork, spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { hash } from '../src/canonical.mjs';
import { command, fixtureKey, publicKey, signPayload } from '../src/identity.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
async function request(url, path, body, token) {
  const res = await fetch(url + path, { signal: AbortSignal.timeout(5_000), ...(body === undefined ? {} : {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: JSON.stringify(body)
  }) });
  return { status: res.status, data: await res.json() };
}
async function snapshot(url) { const r = await request(url, '/api/state'); assert.equal(r.status, 200); return r.data; }
async function login(url, p = 'alice', key = fixtureKey(p)) {
  const c = await request(url, '/api/challenges', { principal: p }); assert.equal(c.status, 200);
  assert.equal(c.data.audience, url);
  const r = await request(url, '/api/sessions', { challenge: c.data, signature: signPayload('OATRIX-LOGIN-1', c.data, key) });
  assert.equal(r.status, 200); return r.data.token;
}
async function act(url, principal, action, args, { token, key = fixtureKey(principal), controller = 'root' } = {}) {
  const { state } = await snapshot(url);
  const r = await request(url, '/api/commands', command(state, principal, action, args, key, { controller }), token);
  assert.equal(r.status, 200, JSON.stringify(r.data)); return r.data;
}
async function start(url, id, name, machine, principal = 'alice', controller = 'root', key = fixtureKey(principal)) {
  const { state } = await snapshot(url), entries = Object.entries(state.recipes).filter(([, e]) => e.definition.id === name);
  assert.equal(entries.length, 1);
  return act(url, principal, 'startJob', { id, recipe: entries[0][0], machine, provider: 'host_a', termsHash: hash(state.executionProviders.host_a) }, { controller, key });
}
function supervise(t, child) {
  let output = '', exited = false;
  child.stdout.on('data', x => { output = (output + x).slice(-65_536); });
  child.stderr.on('data', x => { output = (output + x).slice(-65_536); });
  const exit = new Promise(resolve => child.once('exit', (code, signal) => { exited = true; resolve({ code, signal }); }));
  // Attach before waiting for readiness so a failed startup cannot orphan a server.
  const close = async () => {
    if (!exited) {
      if (child.connected) child.send({ type: 'shutdown' }); else child.kill('SIGTERM');
      const timer = setTimeout(() => { if (!exited) child.kill('SIGKILL'); }, 2_000);
      await exit; clearTimeout(timer);
    }
  };
  t.after(close);
  const waitFor = (subscribe, predicate) => new Promise((resolve, reject) => {
    const timer = setTimeout(() => done(new Error('Child readiness timeout: ' + output)), 10_000);
    const onExit = () => done(new Error('Child exited early: ' + output));
    const onError = e => done(e);
    const onData = value => { const found = predicate(value); if (found) done(null, found); };
    const unsubscribe = subscribe(onData);
    function done(error, value) { clearTimeout(timer); unsubscribe(); child.off('exit', onExit); child.off('error', onError); error ? reject(error) : resolve(value); }
    child.once('exit', onExit); child.once('error', onError);
  });
  const message = type => waitFor(fn => { child.on('message', fn); return () => child.off('message', fn); }, value => value?.type === type && value);
  return { child, close, exit, message, waitFor, output: () => output };
}
async function labProcess(t) {
  const child = fork(new URL('./host-process.mjs', import.meta.url), [], { cwd: root, silent: true, execArgv: [] });
  const p = supervise(t, child), ready = await p.message('ready');
  return { ...p, urls: ready.urls, async stopHost(index) { const reply = p.message('stopped'); child.send({ type: 'stopHost', index }); assert.equal((await reply).index, index); } };
}

test('actual npm-start entry point boots on ephemeral ports and serves both hosts and the new experiment', { timeout: 20_000 }, async t => {
  const child = spawn(process.execPath, ['scripts/serve.mjs'], { cwd: root, env: { ...process.env, PORT: '0' }, stdio: ['ignore', 'pipe', 'pipe'] });
  const p = supervise(t, child);
  const urls = await p.waitFor(fn => { child.stdout.on('data', fn); return () => child.stdout.off('data', fn); }, () => {
    const matches = [...p.output().matchAll(/Host [12]: (http:\/\/127\.0\.0\.1:\d+)/g)].map(m => m[1]); return matches.length === 2 && matches;
  });
  assert.notEqual(urls[0], urls[1]);
  for (const url of urls) {
    const html = await fetch(url, { signal: AbortSignal.timeout(5_000) }); assert.equal(html.status, 200); assert.match(await html.text(), /OATRIX/);
    const report = await request(url, '/report.json'); assert.equal(report.status, 200);
    assert.equal(report.data.experiments.length, 7); assert.ok(report.data.experiments.some(e => e.id === 'machinery'));
    assert.equal((await snapshot(url)).state.world, 'oatrix-lab-v2');
  }
  assert.deepEqual(await snapshot(urls[0]), await snapshot(urls[1]));
});

test('portable identity, host-bound sessions, signed rejection and retry survive loss of one host', { timeout: 20_000 }, async t => {
  const l = await labProcess(t), [a, b] = l.urls;
  const tokenA = await login(a), tokenB = await login(b), before = await snapshot(a);
  const envelope = command(before.state, 'alice', 'transfer', { to: 'bob', amount: 25 }, fixtureKey('alice'));
  const wrongSession = await request(b, '/api/commands', envelope, tokenA);
  assert.equal(wrongSession.data.error, 'SESSION_INVALID');
  const changed = structuredClone(envelope); changed.body.args.amount = 26;
  assert.equal((await request(a, '/api/commands', changed, tokenA)).data.error, 'BAD_SIGNATURE');
  assert.deepEqual(await snapshot(a), before);
  assert.equal((await request(a, '/api/commands', envelope, tokenA)).status, 200);
  await l.stopHost(0);
  await assert.rejects(() => fetch(a + '/api/health', { signal: AbortSignal.timeout(1_000) }));
  // Client did not trust/retain the first response: retry the exact signed command on B.
  assert.equal((await request(b, '/api/commands', envelope, tokenB)).data.error, 'BAD_NONCE');
  assert.equal((await snapshot(b)).state.balances.bob, before.state.balances.bob + 25);
  await act(b, 'alice', 'transfer', { to: 'bob', amount: 1 }, { token: tokenB });
  assert.equal((await snapshot(b)).state.balances.bob, before.state.balances.bob + 26);
});

test('HTTP-only workflow constructs a forge, manufactures, sells and dismantles a product', { timeout: 20_000 }, async t => {
  const l = await labProcess(t), [a, b] = l.urls;
  let seq = 0;
  const tick = n => act(b, 'founder', 'advance', { ticks: n });
  for (const raw of ['ore', 'ore', 'ore', 'ore', 'wood', 'wood']) { await start(a, 'raw_' + seq++, 'mine_' + raw, 'alice_extractor'); await tick(1); }
  await start(a, 'forge', 'forge', 'alice_workbench'); await tick(2);
  assert.equal((await snapshot(b)).state.assets.forge.machineClass, 'forge');
  for (const raw of ['ore', 'ore', 'wood']) { await start(a, 'raw_' + seq++, 'mine_' + raw, 'alice_extractor'); await tick(1); }
  await start(a, 'sword', 'sword', 'forge');
  const running = await snapshot(a);
  const busySale = command(running.state, 'alice', 'offer', { id: 'busy', asset: 'forge', price: 1, until: 100 }, fixtureKey('alice'));
  assert.equal((await request(b, '/api/commands', busySale)).data.error, 'ASSET_BUSY');
  assert.deepEqual(await snapshot(a), running);
  await tick(3);
  await act(a, 'alice', 'offer', { id: 'sale', asset: 'sword', price: 1_000, until: 100 });
  const beforeSale = await snapshot(b);
  await act(b, 'bob', 'buy', { offer: 'sale', termsHash: hash(beforeSale.state.offers.sale) });
  const sold = await snapshot(a);
  assert.equal(sold.state.assets.sword.owner, 'bob'); assert.equal(sold.state.balances.alice - beforeSale.state.balances.alice, 980);
  assert.equal(sold.state.balances.treasury - beforeSale.state.balances.treasury, 20);
  await act(b, 'bob', 'dismantle', { asset: 'sword' });
  const final = await snapshot(a);
  assert.deepEqual(final.state.inventory.bob, { ore: 2, wood: 1 }); assert.deepEqual(final.state.balances, sold.state.balances);
  assert.equal(final.state.supply, 120_000); assert.equal(final.state.assets.sword, undefined);
  assert.deepEqual(final, await snapshot(b));
  const events = await request(b, '/api/events'); assert.equal(events.data.events.at(-1).hash, final.head);
});

test('simultaneous controllers racing through different hosts cannot reserve one machine twice', { timeout: 20_000 }, async t => {
  const l = await labProcess(t), [a, b] = l.urls;
  for (const id of ['worker_a', 'worker_b']) await act(a, 'alice', 'delegate', { id, publicKey: publicKey(fixtureKey(id)), actions: ['startJob'], budget: 5, until: 50 });
  const { state } = await snapshot(a), recipe = Object.entries(state.recipes).find(([, r]) => r.definition.id === 'mine_ore')[0];
  const commands = ['worker_a', 'worker_b'].map((id, i) => command(state, 'alice', 'startJob', { id: 'race_' + i, recipe, machine: 'alice_extractor', provider: 'host_a', termsHash: hash(state.executionProviders.host_a) }, fixtureKey(id), { controller: id }));
  const results = await Promise.all(commands.map((e, i) => request(l.urls[i], '/api/commands', e)));
  assert.deepEqual(results.map(r => r.status).sort(), [200, 400]); assert.equal(results.find(r => r.status === 400).data.error, 'CAPACITY_BUSY');
  const s = (await snapshot(b)).state;
  assert.equal(Object.keys(s.jobs).length, 1); assert.equal(s.balances.alice, 9_999); assert.equal(s.reserve.ore, 989);
  assert.equal(Object.values(s.identities.alice.delegates).reduce((n, d) => n + d.budget, 0), 9);
});

test('key rotation invalidates both host sessions and revoked-worker commands over HTTP', { timeout: 20_000 }, async t => {
  const l = await labProcess(t), [a, b] = l.urls;
  const tokenA = await login(a), tokenB = await login(b);
  await act(a, 'alice', 'delegate', { id: 'worker', publicKey: publicKey(fixtureKey('worker')), actions: ['transfer'], budget: 10, until: 50 });
  const { state } = await snapshot(a), old = command(state, 'alice', 'transfer', { to: 'bob', amount: 1 }, fixtureKey('worker'), { controller: 'worker' });
  const newKey = fixtureKey('alice_new'); await act(b, 'alice', 'rotateKey', { publicKey: publicKey(newKey) });
  for (const [url, token] of [[a, tokenA], [b, tokenB]]) assert.equal((await request(url, '/api/commands', old, token)).data.error, 'SESSION_INVALID');
  assert.equal((await request(b, '/api/commands', old)).data.error, 'NOT_FOUND');
  const fresh = await login(b, 'alice', newKey);
  await act(b, 'alice', 'transfer', { to: 'bob', amount: 1 }, { token: fresh, key: newKey });
  assert.equal((await snapshot(a)).state.balances.bob, 10_001);
});

test('whole-process restart demonstrably resets this in-memory lab rather than implying durability', { timeout: 20_000 }, async t => {
  const first = await labProcess(t), genesis = await snapshot(first.urls[0]);
  await act(first.urls[0], 'alice', 'transfer', { to: 'bob', amount: 10 });
  assert.notEqual((await snapshot(first.urls[0])).head, genesis.head); await first.close();
  const second = await labProcess(t); assert.deepEqual(await snapshot(second.urls[0]), genesis);
});
