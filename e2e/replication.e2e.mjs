/** Three independent processes/files, explicit trust anchors; not quorum/leader election. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import { DurableJournal } from '../src/durable-journal.mjs';
import { industrialGenesis, recipeHash } from '../src/industrial-genesis.mjs';
import { command, fixtureKey } from '../src/identity.mjs';
import { hash } from '../src/canonical.mjs';
import { replicaProcess } from './replica-client.mjs';
import { request } from './durable-client.mjs';
function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'oatrix-replica-e2e-')), cleanup = [], context = { after: fn => cleanup.push(fn) };
  t.after(async () => { for (const fn of cleanup.reverse()) await fn(); rmSync(root, { recursive: true, force: true }); });
  const dirs = Object.fromEntries(['source', 'a', 'b'].map(n => { const dir = join(root, n), j = DurableJournal.initialize(dir, industrialGenesis()); j.close(); return [n, dir]; }));
  return { root, dirs, start: (n, role = n === 'source' ? 'source' : 'replica', options) => replicaProcess(context, dirs[n], role, options) };
}
async function snapshot(p) { const r = await request(p.url, '/api/state'); assert.equal(r.status, 200, JSON.stringify(r.data)); return r.data; }
async function checkpoint(p) { const r = await request(p.url, '/api/checkpoint'); assert.equal(r.status, 200); return r.data; }
async function act(p, principal, action, args) {
  const before = await snapshot(p), e = command(before.state, principal, action, args, fixtureKey(principal)), r = await request(p.url, '/api/commands', e);
  assert.equal(r.status, 200, JSON.stringify(r.data)); return e;
}
const options = { timeout: 30_000 };
test('three independent nodes catch up, retain receipts and serve history after the original source is killed', options, async t => {
  const f = fixture(t), source = await f.start('source'), a = await f.start('a'), b = await f.start('b');
  assert.equal(new Set([source.pid, a.pid, b.pid]).size, 3);
  let last; for (let i = 0; i < 5; i++) last = await act(source, 'alice', 'transfer', { to: 'bob', amount: i + 1 });
  const target = await checkpoint(source), expected = await snapshot(source), pinA = await a.sync({ source: source.url, target, pageSize: 2 });
  assert.equal(pinA.error, undefined); assert.equal(pinA.result.pages, 3); assert.deepEqual(await snapshot(a), expected);
  await source.stop(true);
  const pinB = await b.sync({ source: a.url, target, pageSize: 2 }); assert.equal(pinB.error, undefined); assert.deepEqual(await snapshot(b), expected);
  const receipt = (await request(b.url, '/api/receipt?commandHash=' + hash(last))).data.record; assert.deepEqual(receipt.envelope, last);
  const rejected = await request(b.url, '/api/commands', command(expected.state, 'bob', 'transfer', { to: 'alice', amount: 1 }, fixtureKey('bob')));
  assert.equal(rejected.status, 403); assert.equal(rejected.data.error, 'REPLICA_READ_ONLY');
  await a.stop(true); const restored = await f.start('a'); assert.deepEqual(await snapshot(restored), expected);
  assert.equal((await restored.sync({ source: b.url, target })).result.records, 0);
});
test('offline replica catches up to production and asset sale without recreating machine capacity', options, async t => {
  const f = fixture(t), source = await f.start('source'), a = await f.start('a');
  await act(source, 'alice', 'offer', { id: 'bench_sale', asset: 'alice_workbench', price: 10, until: 100 });
  const first = await checkpoint(source); assert.equal((await a.sync({ source: source.url, target: first })).error, undefined); await a.stop(true);
  await act(source, 'bob', 'buy', { offer: 'bench_sale', termsHash: hash((await snapshot(source)).state.offers.bench_sale) });
  const s = (await snapshot(source)).state;
  await act(source, 'bob', 'startJob', { id: 'raw_job', recipe: recipeHash(s, 'mine_ore'), machine: 'bob_extractor', provider: 'host_a', termsHash: hash(s.executionProviders.host_a) });
  await act(source, 'founder', 'advance', { ticks: 1 });
  const resumed = await f.start('a'), cp = await checkpoint(source); assert.equal((await resumed.sync({ source: source.url, target: cp })).error, undefined);
  const state = await snapshot(resumed); assert.deepEqual(state, await snapshot(source)); assert.equal(state.state.assets.alice_workbench.owner, 'bob'); assert.equal(state.state.inventory.bob.ore, 1);
  assert.equal((await resumed.sync({ source: source.url, target: first })).error, 'REPLICA_ROLLBACK'); assert.deepEqual(await snapshot(resumed), state);
});
for (const phase of ['replica-before-commit', 'replica-after-commit']) test('whole-sync hard kill at ' + phase + ' leaves either old or complete new history, never a prefix', options, async t => {
  const f = fixture(t), source = await f.start('source'), marker = join(f.root, 'phase.json');
  for (let i = 0; i < 4; i++) await act(source, 'alice', 'transfer', { to: 'bob', amount: 1 });
  const target = await checkpoint(source), a = await f.start('a', 'replica', { crash: phase, marker });
  await assert.rejects(a.sync({ source: source.url, target, pageSize: 1 })); await a.exit;
  assert.equal(JSON.parse(readFileSync(marker)).phase, phase);
  const next = await f.start('a'), actual = await checkpoint(next);
  assert.equal(actual.sequence, phase === 'replica-before-commit' ? 0 : 4);
  const retry = await next.sync({ source: source.url, target, pageSize: 1 }); assert.equal(retry.error, undefined);
  assert.deepEqual(await snapshot(next), await snapshot(source)); assert.equal((await snapshot(next)).state.balances.bob, 10004);
});
test('a different valid source history cannot replace an accepted prefix or acquire writer authority', options, async t => {
  const f = fixture(t), source = await f.start('source'), other = await f.start('b', 'source'), a = await f.start('a');
  await act(source, 'alice', 'transfer', { to: 'bob', amount: 1 }); const cp = await checkpoint(source);
  assert.equal((await a.sync({ source: source.url, target: cp })).error, undefined); const before = await snapshot(a);
  await act(other, 'alice', 'transfer', { to: 'bob', amount: 2 }); await act(other, 'bob', 'transfer', { to: 'alice', amount: 1 });
  assert.equal((await a.sync({ source: other.url, target: await checkpoint(other) })).error, 'REPLICA_HTTP_STATUS');
  assert.deepEqual(await snapshot(a), before);
});
test('a separate CLI sync process updates a running read-only replica only after durable verified installation', options, async t => {
  const f = fixture(t), source = await f.start('source'), a = await f.start('a');
  await act(source, 'alice', 'transfer', { to: 'bob', amount: 3 }); const target = await checkpoint(source), pin = join(f.root, 'target.json'); writeFileSync(pin, JSON.stringify(target));
  const child = spawn(process.execPath, [fileURLToPath(new URL('../scripts/replica.mjs', import.meta.url)), 'sync', f.dirs.a, source.url, pin], { stdio: ['ignore', 'pipe', 'pipe'] });
  let output = ''; child.stdout.on('data', b => { output += b; }); child.stderr.on('data', b => { output += b; });
  const timer = setTimeout(() => child.kill('SIGKILL'), 15_000); let code; try { [code] = await once(child, 'exit'); } finally { clearTimeout(timer); }
  assert.equal(code, 0, output); assert.deepEqual(await snapshot(a), await snapshot(source));
});
