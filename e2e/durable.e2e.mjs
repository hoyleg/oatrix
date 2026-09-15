/** Actual process deaths and live HTTP, not just a boolean "provider is offline". */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import { DurableJournal } from '../src/durable-journal.mjs';
import { industrialGenesis, recipeHash } from '../src/industrial-genesis.mjs';
import { command, fixtureKey, publicKey } from '../src/identity.mjs';
import { PortableSigner } from '../src/local-signer.mjs';
import { hash } from '../src/canonical.mjs';
import { hostProcess, request } from './durable-client.mjs';
function storage(t) {
  const root = mkdtempSync(join(tmpdir(), 'oatrix-durable-e2e-')), directory = join(root, 'ledger'), genesis = industrialGenesis();
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const j = DurableJournal.initialize(directory, genesis), initial = j.checkpoint(); j.close();
  return { root, directory, genesis, initial };
}
async function state(h, index = 0) { const r = await request(h.urls[index], '/api/state'); assert.equal(r.status, 200, JSON.stringify(r.data)); return r.data; }
async function act(h, p, action, args, index = 0, key = fixtureKey(p)) {
  const before = await state(h, index), envelope = command(before.state, p, action, args, key);
  const r = await request(h.urls[index], '/api/commands', envelope); assert.equal(r.status, 200, JSON.stringify(r.data)); return { envelope, record: r.data };
}
const options = { timeout: 30_000 };

test('acknowledged commands survive a whole-process hard kill; lookup and replay prevent double payment', options, async t => {
  const s = storage(t), first = await hostProcess(t, s.directory);
  assert.equal((await request(first.urls[0], '/api/health')).data.mode, 'single-writer-sqlite-lab');
  const { envelope, record } = await act(first, 'alice', 'transfer', { to: 'bob', amount: 17 });
  const before = await state(first), cp = (await request(first.urls[1], '/api/checkpoint')).data;
  const pin = join(s.root, 'pin.json'); writeFileSync(pin, JSON.stringify(cp)); await first.stop(true);
  const next = await hostProcess(t, s.directory, { checkpoint: pin }); assert.deepEqual(await state(next), before);
  const found = await request(next.urls[1], '/api/receipt?commandHash=' + hash(envelope)); assert.equal(found.status, 200); assert.deepEqual(found.data.record, record);
  const duplicate = await request(next.urls[0], '/api/commands', envelope); assert.equal(duplicate.status, 400); assert.equal(duplicate.data.error, 'BAD_NONCE');
  assert.deepEqual(await state(next, 1), before); await next.stop();
});

for (const phase of ['before-commit', 'after-commit']) test('hard termination ' + phase + ' resolves an unknown acknowledgement by exact command lookup', options, async t => {
  const s = storage(t), marker = join(s.root, 'phase.json'), first = await hostProcess(t, s.directory, { phase, marker });
  const before = await state(first), signer = new PortableSigner({ principal: 'alice', world: before.state.world, privateKey: fixtureKey('alice'), audiences: first.urls });
  const envelope = signer.signIntent(before, { action: 'transfer', args: { to: 'bob', amount: 9 }, expectedHead: before.head, expiresIn: 20 });
  await assert.rejects(request(first.urls[0], '/api/commands', envelope)); await first.exit;
  assert.equal(JSON.parse(readFileSync(marker)).phase, phase);
  const next = await hostProcess(t, s.directory); const lookup = (await request(next.urls[0], '/api/receipt?commandHash=' + hash(envelope))).data.record;
  const after = await state(next);
  if (phase === 'before-commit') {
    assert.equal(lookup, null); assert.deepEqual(after, before);
    assert.equal((await request(next.urls[1], '/api/commands', envelope)).status, 200);
  } else {
    assert.equal(lookup.envelope.signature, envelope.signature); assert.equal(after.state.balances.bob, before.state.balances.bob + 9);
    assert.equal((await request(next.urls[1], '/api/commands', envelope)).status, 400);
  }
  assert.equal((await state(next)).state.balances.bob, before.state.balances.bob + 9); await next.stop();
});

test('work in progress, manufactured machine title and sale survive process boundaries without advancing time offline', options, async t => {
  const s = storage(t), first = await hostProcess(t, s.directory);
  for (let i = 0; i < 6; i++) {
    const b = await state(first);
    await act(first, 'alice', 'startJob', { id: 'raw_' + i, recipe: recipeHash(b.state, i < 4 ? 'mine_ore' : 'mine_wood'), machine: 'alice_extractor', provider: 'host_a', termsHash: hash(b.state.executionProviders.host_a) });
    await act(first, 'founder', 'advance', { ticks: 1 });
  }
  const b = await state(first); await act(first, 'alice', 'startJob', { id: 'forge', recipe: recipeHash(b.state, 'forge'), machine: 'alice_workbench', provider: 'host_a', termsHash: hash(b.state.executionProviders.host_a) });
  await first.stop(true); const next = await hostProcess(t, s.directory);
  const resumed = await state(next); assert.equal(resumed.state.tick, b.state.tick); assert.equal(resumed.state.jobs.forge.status, 'running');
  await act(next, 'founder', 'advance', { ticks: 2 });
  await act(next, 'alice', 'offer', { id: 'sale', asset: 'forge', price: 100, until: 100 });
  const offer = (await state(next)).state.offers.sale; await act(next, 'bob', 'buy', { offer: 'sale', termsHash: hash(offer) }, 1);
  const sold = await state(next); await next.stop(true); const final = await hostProcess(t, s.directory);
  assert.deepEqual(await state(final), sold); assert.equal(sold.state.assets.forge.owner, 'bob'); await final.stop();
});

test('root rotation survives restart while sessions expire and old keys cannot resume authority', options, async t => {
  const s = storage(t), first = await hostProcess(t, s.directory), key = fixtureKey('new_durable_root');
  const signer = new PortableSigner({ principal: 'alice', world: s.genesis.world, privateKey: fixtureKey('alice'), audiences: first.urls });
  const c = (await request(first.urls[0], '/api/challenges', { principal: 'alice' })).data;
  const token = (await request(first.urls[0], '/api/sessions', { challenge: c, signature: signer.signLogin(c) })).data.token;
  await act(first, 'alice', 'rotateKey', { publicKey: publicKey(key) }); const before = await state(first); await first.stop(true);
  const next = await hostProcess(t, s.directory), e = command(before.state, 'alice', 'transfer', { to: 'bob', amount: 1 }, key);
  const staleSession = await request(next.urls[0], '/api/commands', e, token); assert.equal(staleSession.data.error, 'SESSION_INVALID');
  const wrong = command(before.state, 'alice', 'transfer', { to: 'bob', amount: 1 }, fixtureKey('alice'));
  assert.equal((await request(next.urls[0], '/api/commands', wrong)).data.error, 'BAD_SIGNATURE');
  assert.equal((await request(next.urls[1], '/api/commands', e)).status, 200); await next.stop();
});

test('two actual processes cannot acknowledge competing writes from stale local state', options, async t => {
  const s = storage(t), a = await hostProcess(t, s.directory), b = await hostProcess(t, s.directory), original = await state(a);
  const e1 = command(original.state, 'alice', 'transfer', { to: 'bob', amount: 2 }, fixtureKey('alice'));
  const e2 = command(original.state, 'bob', 'transfer', { to: 'alice', amount: 3 }, fixtureKey('bob'));
  const replies = await Promise.all([request(a.urls[0], '/api/commands', e1), request(b.urls[0], '/api/commands', e2)]);
  assert.deepEqual(replies.map(r => r.status).sort(), [200, 503]); assert.equal(replies.find(r => r.status === 503).data.error, 'LEDGER_STALE');
  await a.stop(); await b.stop(); const next = await hostProcess(t, s.directory); const cp = (await request(next.urls[0], '/api/checkpoint')).data;
  assert.equal(cp.sequence, 1); await next.stop();
});

test('CLI export and restore require explicit new paths and reject an older history against a newer checkpoint', options, async t => {
  const s = storage(t), ledgerCLI = new URL('../scripts/ledger.mjs', import.meta.url);
  const cli = args => spawnSync(process.execPath, [fileURLToPath(ledgerCLI), ...args], { encoding: 'utf8', timeout: 10_000 });
  const h = await hostProcess(t, s.directory); await act(h, 'alice', 'transfer', { to: 'bob', amount: 1 }); await h.stop();
  const dump = join(s.root, 'journal.json'), pin = join(s.root, 'pin.json');
  for (const args of [['export', s.directory, dump], ['checkpoint', s.directory, pin]]) { const r = cli(args); assert.equal(r.status, 0, r.stderr); }
  assert.equal(cli(['export', s.directory, dump]).status, 1);
  const restored = join(s.root, 'restored'); assert.equal(cli(['restore', restored, dump, pin]).status, 0);
  const again = await hostProcess(t, s.directory); await act(again, 'alice', 'transfer', { to: 'bob', amount: 2 }); await again.stop();
  const newer = join(s.root, 'newer-pin.json'); assert.equal(cli(['checkpoint', s.directory, newer]).status, 0);
  const bad = join(s.root, 'bad'); const result = cli(['restore', bad, dump, newer]); assert.equal(result.status, 1); assert.match(result.stderr, /CHECKPOINT_MISMATCH/); assert.equal(existsSync(bad), false);
  const recovered = await hostProcess(t, restored); assert.equal((await state(recovered)).state.balances.bob, 10001); await recovered.stop();
});

test('persistent server entry point refuses a missing ledger, boots an initialized one, and shuts down cleanly', options, async t => {
  const s = storage(t), entry = new URL('../scripts/serve-durable.mjs', import.meta.url);
  const missing = join(s.root, 'absent'); const failure = spawnSync(process.execPath, [fileURLToPath(entry), missing], { encoding: 'utf8', timeout: 10_000 });
  assert.equal(failure.status, 1); assert.match(failure.stderr, /LEDGER_MISSING/); assert.equal(existsSync(missing), false);
  const child = spawn(process.execPath, [fileURLToPath(entry), s.directory], { env: { ...process.env, PORT: '0' }, stdio: ['ignore', 'pipe', 'pipe'] });
  let output = '', ended = false; const exit = once(child, 'exit').then(x => { ended = true; return x; });
  child.stdout.on('data', x => { output += x; }); child.stderr.on('data', x => { output += x; });
  t.after(async () => { if (!ended) { child.kill('SIGKILL'); await exit; } });
  const urls = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => done(new Error('Startup timeout: ' + output)), 15_000);
    const onData = () => { const found = [...output.matchAll(/Host \d: (http:\/\/127\.0\.0\.1:\d+)/g)].map(m => m[1]); if (found.length === 2) done(null, found); };
    const onExit = () => done(new Error('Early exit: ' + output));
    function done(error, value) { clearTimeout(timer); child.stdout.off('data', onData); child.off('exit', onExit); error ? reject(error) : resolve(value); }
    child.stdout.on('data', onData); child.once('exit', onExit); onData();
  });
  assert.deepEqual((await request(urls[0], '/api/checkpoint')).data, s.initial);
  assert.equal((await request(urls[1], '/api/receipt?commandHash=' + 'f'.repeat(64))).data.record, null);
  assert.equal((await request(urls[0], '/api/receipt?commandHash=nope')).status, 400);
  child.kill('SIGTERM'); await exit;
});
