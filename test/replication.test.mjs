import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { DurableJournal } from '../src/durable-journal.mjs';
import { Journal } from '../src/journal.mjs';
import { industrialGenesis, workMandateGenesis } from '../src/industrial-genesis.mjs';
import { command, fixtureKey, publicKey } from '../src/identity.mjs';
import { PortableSigner } from '../src/local-signer.mjs';
import { clone, hash, canonical } from '../src/canonical.mjs';
import { exportPage, replayPage, catchUp, checkpointOf, replicaView, validateSource, REPLICATION_LIMITS } from '../src/replication.mjs';
import { startHost } from '../src/http.mjs';

function rig(t, genesis = industrialGenesis(), limits = {}) {
  const root = mkdtempSync(join(tmpdir(), 'oatrix-replica-test-')), dir = join(root, 'follower');
  const j = DurableJournal.initialize(dir, genesis, limits), source = new Journal(genesis), handles = [j], servers = [];
  t.after(async () => { for (const s of servers.reverse()) await s.close(); for (const h of handles.reverse()) h.close(); rmSync(root, { recursive: true, force: true }); });
  const act = (p = 'alice', amount = 1) => source.submit(command(source.state, p, 'transfer', { to: p === 'bob' ? 'alice' : 'bob', amount }, fixtureKey(p)));
  const append = () => j.importRecords(source.events.slice(j.events.length), j.checkpoint(), checkpointOf(source));
  const host = async (view = source, options = {}) => { const s = await startHost(view, options); servers.push(s); return s; };
  const raw = async handler => {
    const server = createServer(handler); await new Promise(r => server.listen(0, '127.0.0.1', r));
    servers.push({ close: () => { server.closeAllConnections(); return new Promise(r => server.close(r)); } });
    return `http://127.0.0.1:${server.address().port}`;
  };
  return { root, dir, j, source, handles, act, append, host, raw };
}
function unchanged(r, fn, pattern) {
  const before = r.j.export(), bytes = readFileSync(join(r.dir, 'world.sqlite'));
  assert.throws(fn, pattern); assert.deepEqual(r.j.export(), before); assert.deepEqual(readFileSync(join(r.dir, 'world.sqlite')), bytes);
}

test('replication paginates exact records and pins an older target while source keeps advancing', t => {
  const r = rig(t); for (let i = 0; i < 5; i++) r.act(); const target = checkpointOf(r.source); r.act();
  const stage = new Journal(industrialGenesis()); let from = checkpointOf(stage), pages = 0;
  while (from.sequence < target.sequence) { const p = exportPage(r.source, { from, target, limit: 2 }); from = replayPage(stage, p, from, target, 2); pages++; }
  assert.equal(pages, 3); assert.deepEqual(from, target); assert.equal(stage.state.balances.bob, 10_005); assert.equal(r.source.events.length, 6);
});
test('atomic suffix import preserves exact histories, receipts, money and target after reopen', t => {
  const r = rig(t); for (let i = 0; i < 4; i++) r.act(); const cp = r.append();
  assert.deepEqual(r.j.export(), r.source.export()); assert.deepEqual(r.j.lookup(hash(r.source.events[1].envelope)), r.source.events[1]);
  r.j.close(); const reopened = new DurableJournal(r.dir, cp.genesisHash, { minimumCheckpoint: cp }); r.handles.push(reopened);
  assert.deepEqual(reopened.export(), r.source.export());
});
for (const [name, mutate, error] of [
  ['bad signature', records => { records[1].envelope.signature = 'A'.repeat(86); }, /BAD_SIGNATURE/],
  ['wrong recorded effect', records => { records[1].stateHash = 'f'.repeat(64); }, /JOURNAL_MISMATCH/],
  ['reordered entries', records => records.reverse(), /BAD_NONCE/],
  ['repeated entry', records => { records[1] = records[0]; }, /BAD_NONCE/],
  ['extra authority', records => { records[1].godMode = true; }, /JOURNAL_MISMATCH/]
]) test('the entire suffix rejects ' + name + ' without partially persisting its valid first record', t => {
  const r = rig(t); r.act(); r.act(); const records = clone(r.source.events); mutate(records);
  unchanged(r, () => r.j.importRecords(records, r.j.checkpoint(), checkpointOf(r.source)), error);
});
test('a valid but differently ordered fork cannot satisfy the independently pinned target', t => {
  const r = rig(t); r.act(); r.act('bob', 2); const alternate = new Journal(industrialGenesis());
  alternate.submit(command(alternate.state, 'bob', 'transfer', { to: 'alice', amount: 2 }, fixtureKey('bob')));
  alternate.submit(command(alternate.state, 'alice', 'transfer', { to: 'bob', amount: 1 }, fixtureKey('alice')));
  assert.deepEqual(alternate.state.balances, r.source.state.balances);
  unchanged(r, () => r.j.importRecords(alternate.events, r.j.checkpoint(), checkpointOf(r.source)), /CHECKPOINT_MISMATCH/);
});
test('missing and future entries, foreign genesis, stale base and rollback never reset the replica', t => {
  const r = rig(t); r.act(); const base = r.j.checkpoint(), target = checkpointOf(r.source);
  unchanged(r, () => r.j.importRecords([], base, target), /REPLICA_RECORD_COUNT/);
  unchanged(r, () => r.j.importRecords(r.source.events, base, { ...target, genesisHash: 'a'.repeat(64) }), /UNTRUSTED_GENESIS/);
  r.append(); unchanged(r, () => r.j.importRecords([], r.j.checkpoint(), base), /REPLICA_ROLLBACK/);
  unchanged(r, () => r.j.importRecords(r.source.events, base, target), /REPLICA_BASE_CHANGED/);
  assert.deepEqual(r.j.importRecords([], target, target), target);
});
test('event and byte limits stop whole suffix admission without evicting previous state', t => {
  const r = rig(t, industrialGenesis(), { maxEvents: 1 }); r.act(); r.act();
  unchanged(r, () => r.append(), /LEDGER_EVENT_LIMIT/);
  const g = industrialGenesis(), s = rig(t, g, { maxBytes: Buffer.byteLength(canonical(g)) + 50 }); s.act();
  unchanged(s, () => s.append(), /LEDGER_BYTE_LIMIT/);
});
test('mixed envelope versions, key rotation and scoped permissions retain their signatures and semantics', t => {
  const r = rig(t, workMandateGenesis()); r.act();
  const snap = { head: r.source.head, state: r.source.state }, key = fixtureKey('replica_new_root');
  const signer = new PortableSigner({ principal: 'alice', world: snap.state.world, privateKey: fixtureKey('alice'), audiences: ['http://127.0.0.1:8787'] });
  r.source.submit(signer.signIntent(snap, { action: 'rotateKey', args: { publicKey: publicKey(key) }, expectedHead: snap.head, expiresIn: 10 }));
  r.append(); assert.deepEqual(r.j.export(), r.source.export());
  const stale = command(r.j.state, 'alice', 'transfer', { to: 'bob', amount: 1 }, fixtureKey('alice'));
  unchanged(r, () => r.j.submit(stale), /BAD_SIGNATURE/);
});
test('schema remains unchanged and failed commit poisons the replica until independently reopened', t => {
  const r = rig(t); r.act(); const reader = new DatabaseSync(join(r.dir, 'world.sqlite'));
  try {
    reader.exec('BEGIN'); reader.prepare('SELECT * FROM world').get();
    assert.throws(() => r.append(), e => e.code === 'LEDGER_IO_UNCERTAIN');
    assert.throws(() => r.j.checkpoint(), /LEDGER_CLOSED/);
  } finally { reader.exec('ROLLBACK'); reader.close(); }
  const restored = new DurableJournal(r.dir, hash(industrialGenesis())); r.handles.push(restored);
  assert.equal(restored.events.length, 0); restored.importRecords(r.source.events, restored.checkpoint(), checkpointOf(r.source));
  assert.deepEqual(restored.export(), r.source.export());
});
test('read-only replica facade blocks root and gateway writes, while queries and login still work', async t => {
  const r = rig(t); r.act(); r.append(); const h = await r.host(replicaView(r.j), { replication: true });
  const e = command(r.j.state, 'alice', 'transfer', { to: 'bob', amount: 1 }, fixtureKey('alice'));
  const response = await fetch(h.url + '/api/commands', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(e) });
  assert.equal(response.status, 403); assert.equal((await response.json()).error, 'REPLICA_READ_ONLY');
  assert.throws(() => h.gateway.relay(e), /REPLICA_READ_ONLY/);
  const c = await (await fetch(h.url + '/api/challenges', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"principal":"alice"}' })).json();
  assert.equal(c.principal, 'alice'); assert.deepEqual(await (await fetch(h.url + '/api/state')).json(), { head: r.j.head, state: r.j.state });
});
test('real HTTP multi-page catch-up installs once and repeated target is a no-op without a network request', async t => {
  const r = rig(t); for (let i = 0; i < 9; i++) r.act(); const h = await r.host(r.source, { replication: true }), target = checkpointOf(r.source);
  const result = await catchUp(r.j, { source: h.url, target, pageSize: 2 });
  assert.equal(result.pages, 5); assert.equal(result.records, 9); assert.deepEqual(r.j.export(), r.source.export());
  const same = await catchUp(r.j, { source: 'http://127.0.0.1:1', target }); assert.equal(same.pages, 0); assert.equal(same.records, 0);
});
test('replication is opt-in and query fields, duplicate keys and bounds reject explicitly', async t => {
  const r = rig(t), off = await r.host(); assert.equal((await fetch(off.url + '/api/replication')).status, 404);
  const h = await r.host(r.source, { replication: true }), base = r.j.checkpoint(); r.act(); const target = checkpointOf(r.source);
  const q = new URLSearchParams({ genesis: base.genesisHash, after: '0', head: base.head, target: '1', targetHead: target.head, limit: '1' });
  for (const suffix of ['', '&limit=1', '&evil=1']) {
    const res = await fetch(h.url + '/api/replication?' + (suffix ? q + suffix : ''));
    assert.equal(res.status, 400);
  }
  q.set('limit', '33'); assert.equal((await fetch(h.url + '/api/replication?' + q)).status, 400);
  q.set('limit', '1'); q.set('after', '1e0'); assert.equal((await fetch(h.url + '/api/replication?' + q)).status, 400);
});
for (const [name, mutate, error] of [
  ['false target', p => { p.target.head = 'a'.repeat(64); }, /REPLICA_PAGE_BINDING/],
  ['false cursor', p => { p.next.sequence++; }, /REPLICA_NEXT/],
  ['empty page', p => { p.records = []; }, /REPLICA_NO_PROGRESS/],
  ['invalid final signature', p => { p.records[0].envelope.signature = 'A'.repeat(86); }, /BAD_SIGNATURE/]
]) test('bad later HTTP page: ' + name + ' leaves the previously accepted replica intact', async t => {
  const r = rig(t); r.act(); r.act(); const target = checkpointOf(r.source), initial = r.j.export();
  const source = await r.raw((req, res) => {
    const q = new URL(req.url, 'http://127.0.0.1').searchParams, from = { v: 1, genesisHash: target.genesisHash, sequence: Number(q.get('after')), head: q.get('head') };
    const p = exportPage(r.source, { from, target, limit: 1 }); if (from.sequence > 0) mutate(p);
    res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(p));
  });
  await assert.rejects(catchUp(r.j, { source, target, pageSize: 1 }), error); assert.deepEqual(r.j.export(), initial);
});
test('source redirects are not followed to another host', async t => {
  const r = rig(t); r.act(); let reached = false;
  const destination = await r.raw((req, res) => { reached = true; res.end('{}'); });
  const source = await r.raw((req, res) => { res.writeHead(302, { Location: destination }); res.end(); });
  await assert.rejects(catchUp(r.j, { source, target: checkpointOf(r.source) })); assert.equal(reached, false); assert.equal(r.j.events.length, 0);
});
test('oversized streamed payload, bad content type, invalid JSON and deadline cannot mutate replica', async t => {
  const r = rig(t); r.act();
  for (const handler of [
    (req, res) => { res.writeHead(200, { 'Content-Type': 'application/json' }); res.write(' '.repeat(REPLICATION_LIMITS.pageBytes)); res.end('extra'); },
    (req, res) => { res.writeHead(200, { 'Content-Type': 'text/html' }); res.end('{}'); },
    (req, res) => { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end('{broken'); },
    (req, res) => { res.writeHead(200, { 'Content-Type': 'application/json' }); res.write('{'); }
  ]) { const source = await r.raw(handler); await assert.rejects(catchUp(r.j, { source, target: checkpointOf(r.source), timeoutMs: 150 })); assert.equal(r.j.events.length, 0); }
});
test('a concurrent local command while fetching forces reapproval rather than silent rebase', async t => {
  const r = rig(t); r.act(); const base = r.j.checkpoint(), target = checkpointOf(r.source);
  const source = await r.raw((req, res) => {
    const p = exportPage(r.source, { from: base, target, limit: 1 });
    r.j.submit(command(r.j.state, 'bob', 'transfer', { to: 'alice', amount: 2 }, fixtureKey('bob')));
    res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(p));
  });
  await assert.rejects(catchUp(r.j, { source, target }), /REPLICA_BASE_CHANGED/); assert.equal(r.j.events.length, 1); assert.equal(r.j.state.balances.alice, 10002);
});
test('source URLs cannot add credentials, paths, ambiguous loopback names or plain external HTTP', () => {
  for (const s of ['http://example.com', 'http://localhost:10', 'https://alice:secret@example.com', 'https://example.com/path', 'https://example.com/', 'file:///tmp/a', 'https://example.com#x']) assert.throws(() => validateSource(s), /REPLICA_SOURCE/);
  for (const s of ['http://127.0.0.1:1234', 'http://[::1]:10', 'https://example.com']) assert.equal(validateSource(s), s);
});
test('source unavailable or behind requested checkpoint cannot roll back local history', async t => {
  const r = rig(t); r.act(); r.append(); const before = r.j.export(), h = await r.host(new Journal(industrialGenesis()), { replication: true });
  r.act(); await assert.rejects(catchUp(r.j, { source: h.url, target: checkpointOf(r.source) }), /REPLICA_HTTP_STATUS/); assert.deepEqual(r.j.export(), before);
});
