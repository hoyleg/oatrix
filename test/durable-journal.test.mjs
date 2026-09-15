/** Durable storage does not change the authoritative reference rules. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync, writeFileSync, copyFileSync, linkSync, symlinkSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { DurableJournal, requireSqliteTransactionAPI } from '../src/durable-journal.mjs';
import { Journal } from '../src/journal.mjs';
import { industrialGenesis, workMandateGenesis, recipeHash } from '../src/industrial-genesis.mjs';
import { command, fixtureKey, publicKey } from '../src/identity.mjs';
import { PortableSigner } from '../src/local-signer.mjs';
import { canonical, hash } from '../src/canonical.mjs';
function rig(t, options = {}) {
  const root = mkdtempSync(join(tmpdir(), 'oatrix-durable-test-')), dir = join(root, 'ledger');
  const genesis = options.genesis ?? industrialGenesis(), instances = [];
  t.after(() => { for (const j of instances) j.close(); rmSync(root, { recursive: true, force: true }); });
  const track = j => { instances.push(j); return j; };
  const j = track(DurableJournal.initialize(dir, genesis, options.limits));
  const reopen = opts => track(new DurableJournal(dir, hash(genesis), opts));
  const act = (action, args, principal = 'alice', target = j, key = fixtureKey(principal)) => target.submit(command(target.state, principal, action, args, key));
  return { root, dir, genesis, j, reopen, act, track, file: join(dir, 'world.sqlite') };
}
function rejectUnchanged(j, code, action) {
  const before = j.export(); assert.throws(action, e => e.code === code, code); assert.deepEqual(j.export(), before);
}
function mutate(file, fn) {
  const db = new DatabaseSync(file); try { fn(db); } finally { db.close(); }
}

test('explicit initialization persists genesis and refuses existing paths or implicit startup reset', t => {
  const l = rig(t); assert.deepEqual(l.j.state, l.genesis); assert.equal(l.j.mode, 'single-writer-sqlite-lab');
  const before = readFileSync(l.file);
  assert.throws(() => DurableJournal.initialize(l.dir, l.genesis), /LEDGER_EXISTS/);
  assert.throws(() => new DurableJournal(join(l.root, 'missing'), hash(l.genesis)), e => e.code === 'LEDGER_MISSING');
  assert.equal(existsSync(join(l.root, 'missing')), false); assert.deepEqual(readFileSync(l.file), before);
});

test('each persisted record is identical to the in-memory journal, including mixed signed envelopes', t => {
  const l = rig(t), reference = new Journal(l.genesis);
  const signer = new PortableSigner({ principal: 'alice', world: l.genesis.world, privateKey: fixtureKey('alice'), audiences: ['http://127.0.0.1:8787'] });
  for (let i = 0; i < 8; i++) {
    const envelope = i % 2 ? command(reference.state, 'bob', 'transfer', { to: 'alice', amount: 1 }, fixtureKey('bob')) :
      signer.signIntent({ head: reference.head, state: reference.state }, { expectedHead: reference.head, action: 'transfer', args: { to: 'bob', amount: 3 }, expiresIn: 20 });
    assert.deepEqual(l.j.submit(envelope), reference.submit(envelope));
  }
  const pin = l.j.checkpoint(); l.j.close(); const recovered = l.reopen({ minimumCheckpoint: pin });
  assert.deepEqual(recovered.export(), reference.export()); assert.deepEqual(recovered.state, reference.state);
});

test('invalid signatures, insufficient funds, and stale approvals leave SQL and counters unchanged', t => {
  const l = rig(t), signer = new PortableSigner({ principal: 'alice', world: l.genesis.world, privateKey: fixtureKey('alice'), audiences: ['http://127.0.0.1:8787'] });
  const e = signer.signIntent({ head: l.j.head, state: l.j.state }, { action: 'transfer', args: { to: 'bob', amount: 1 }, expectedHead: l.j.head, expiresIn: 20 });
  l.act('transfer', { to: 'alice', amount: 1 }, 'bob');
  rejectUnchanged(l.j, 'HEAD_CHANGED', () => l.j.submit(e));
  const wrong = command(l.j.state, 'alice', 'transfer', { to: 'bob', amount: 1 }, fixtureKey('bob'));
  rejectUnchanged(l.j, 'BAD_SIGNATURE', () => l.j.submit(wrong));
  rejectUnchanged(l.j, 'INSUFFICIENT_FUNDS', () => l.act('transfer', { to: 'bob', amount: 100_000 }));
  const before = l.j.export(); l.j.close(); assert.deepEqual(l.reopen().export(), before);
});

test('manufacturing jobs, ownership, sale and levy survive close and reopen', t => {
  const l = rig(t);
  for (let i = 0; i < 6; i++) {
    l.act('startJob', { id: 'raw_' + i, recipe: recipeHash(l.j.state, i < 4 ? 'mine_ore' : 'mine_wood'), machine: 'alice_extractor', provider: 'host_a', termsHash: hash(l.j.state.executionProviders.host_a) });
    l.act('advance', { ticks: 1 }, 'founder');
  }
  l.act('startJob', { id: 'forge', recipe: recipeHash(l.j.state, 'forge'), machine: 'alice_workbench', provider: 'host_a', termsHash: hash(l.j.state.executionProviders.host_a) });
  l.j.close(); const after = l.reopen(); assert.equal(after.state.jobs.forge.status, 'running');
  l.act('advance', { ticks: 3 }, 'founder', after);
  l.act('offer', { id: 'sale', asset: 'forge', price: 100, until: 100 }, 'alice', after);
  l.act('buy', { offer: 'sale', termsHash: hash(after.state.offers.sale) }, 'bob', after);
  const snapshot = after.export(); after.close(); const final = l.reopen();
  assert.equal(final.state.assets.forge.owner, 'bob'); assert.equal(final.state.assets.forge.kind, 'machine'); assert.deepEqual(final.export(), snapshot);
});

test('root rotation and revocation persist; restored old signatures do not regain authority', t => {
  const l = rig(t, { genesis: workMandateGenesis() }), worker = fixtureKey('durable_worker');
  l.act('delegateWork', { id: 'worker', publicKey: publicKey(worker), budget: 10, until: 100,
    scope: { recipes: [recipeHash(l.j.state, 'mine_ore')], machines: ['alice_extractor'], providers: [{ id: 'host_a', termsHash: hash(l.j.state.executionProviders.host_a) }],
      inputs: { ore: 0, wood: 0 }, extraction: { ore: 1, wood: 0 }, jobs: 1 } });
  const pending = command(l.j.state, 'alice', 'startJob', { id: 'bad', recipe: recipeHash(l.j.state, 'mine_ore'), machine: 'alice_extractor', provider: 'host_a', termsHash: hash(l.j.state.executionProviders.host_a) }, worker, { controller: 'worker' });
  const nextKey = fixtureKey('durable_rotated'); l.act('rotateKey', { publicKey: publicKey(nextKey) });
  l.j.close(); const after = l.reopen(); assert.deepEqual(after.state.identities.alice.delegates, {});
  rejectUnchanged(after, 'NOT_FOUND', () => after.submit(pending));
  rejectUnchanged(after, 'BAD_SIGNATURE', () => l.act('transfer', { to: 'bob', amount: 1 }, 'alice', after));
  l.act('transfer', { to: 'bob', amount: 1 }, 'alice', after, nextKey);
});

test('exact command lookup survives restart and cannot mutate stored records or replay payment', t => {
  const l = rig(t), e = command(l.j.state, 'alice', 'transfer', { to: 'bob', amount: 7 }, fixtureKey('alice'));
  const record = l.j.submit(e), id = hash(e); l.j.close(); const next = l.reopen();
  const found = next.lookup(id); assert.deepEqual(found, record); found.event.principal = 'bob'; assert.deepEqual(next.lookup(id), record);
  assert.equal(next.lookup('f'.repeat(64)), null); rejectUnchanged(next, 'BAD_NONCE', () => next.submit(e));
});

test('minimum checkpoint accepts descendants but rejects rollback or a different valid fork', t => {
  const l = rig(t); l.act('transfer', { to: 'bob', amount: 1 }); const earlier = l.j.export(), pin = l.j.checkpoint();
  l.act('transfer', { to: 'bob', amount: 2 }); const latest = l.j.checkpoint(); l.j.close();
  const valid = l.reopen({ minimumCheckpoint: pin }); assert.deepEqual(valid.checkpoint(), latest); valid.close();
  const saved = join(l.root, 'older'); const old = l.track(DurableJournal.restore(saved, earlier, pin)); old.close();
  assert.throws(() => new DurableJournal(saved, hash(l.genesis), { minimumCheckpoint: latest }), e => e.code === 'CHECKPOINT_MISMATCH');
  const fork = new Journal(l.genesis); fork.submit(command(fork.state, 'alice', 'transfer', { to: 'bob', amount: 4 }, fixtureKey('alice')));
  const forkPin = { v: 1, genesisHash: fork.genesisHash, sequence: 1, head: fork.head };
  assert.throws(() => l.reopen({ minimumCheckpoint: forkPin }), e => e.code === 'CHECKPOINT_MISMATCH');
  assert.throws(() => l.reopen({ minimumCheckpoint: { ...pin, sequence: 0 } }), e => e.code === 'CHECKPOINT_MISMATCH');
});

test('a second connection fails stale instead of overwriting and can explicitly catch up', t => {
  const l = rig(t), second = l.reopen(); const e = command(second.state, 'bob', 'transfer', { to: 'alice', amount: 1 }, fixtureKey('bob'));
  l.act('transfer', { to: 'bob', amount: 2 });
  assert.throws(() => second.head, e => e.code === 'LEDGER_STALE'); assert.throws(() => second.submit(e), e => e.code === 'LEDGER_STALE');
  second.refresh(); assert.deepEqual(second.export(), l.j.export()); second.submit(e);
  assert.throws(() => l.j.state, e => e.code === 'LEDGER_STALE'); l.j.refresh(); assert.deepEqual(second.export(), l.j.export());
});

test('refresh refuses a fork below the connection’s already retained checkpoint', t => {
  const l = rig(t); l.act('transfer', { to: 'bob', amount: 1 });
  const other = new Journal(l.genesis); const e = other.submit(command(other.state, 'alice', 'transfer', { to: 'bob', amount: 2 }, fixtureKey('alice')));
  mutate(l.file, db => { db.prepare('UPDATE events SET command_hash=?, record=?').run(hash(e.envelope), canonical(e));
    db.prepare('UPDATE world SET head=?, logical_bytes=?').run(e.hash, Buffer.byteLength(canonical(l.genesis)) + Buffer.byteLength(canonical(e))); });
  assert.throws(() => l.j.refresh(), e => e.code === 'CHECKPOINT_MISMATCH');
});

test('event budget refuses new work without removing history and still permits receipt lookup', t => {
  const l = rig(t, { limits: { maxEvents: 1 } }); const record = l.act('transfer', { to: 'bob', amount: 1 });
  rejectUnchanged(l.j, 'LEDGER_EVENT_LIMIT', () => l.act('transfer', { to: 'bob', amount: 1 }));
  l.j.close(); const after = l.reopen(); assert.deepEqual(after.lookup(hash(record.envelope)), record);
  rejectUnchanged(after, 'LEDGER_EVENT_LIMIT', () => l.act('transfer', { to: 'bob', amount: 1 }, 'alice', after));
});

test('logical byte budget rejects before commit rather than evicting earlier receipts', t => {
  const genesis = industrialGenesis(), maxBytes = Buffer.byteLength(canonical(genesis)) + 20;
  const l = rig(t, { genesis, limits: { maxBytes } });
  rejectUnchanged(l.j, 'LEDGER_BYTE_LIMIT', () => l.act('transfer', { to: 'bob', amount: 1 }));
  assert.equal(l.reopen().events.length, 0);
});

for (const [name, update] of [
  ['metadata head', db => db.prepare('UPDATE world SET head=?').run('f'.repeat(64))],
  ['record body', db => db.exec("UPDATE events SET record='{}', command_hash='aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'")],
  ['genesis identity', db => db.prepare('UPDATE world SET genesis_hash=?').run('f'.repeat(64))],
  ['schema trigger', db => db.exec('CREATE TRIGGER counterfeit AFTER INSERT ON events BEGIN UPDATE world SET sequence=999; END')],
  ['internal-looking trigger', db => db.exec('CREATE TRIGGER sqliteXevader AFTER INSERT ON events BEGIN UPDATE world SET sequence=999; END')],
  ['format version', db => db.exec('PRAGMA user_version=2')]
]) test('reopen rejects corrupted ' + name + ' without resetting the database', t => {
  const l = rig(t); l.act('transfer', { to: 'bob', amount: 1 }); l.j.close(); mutate(l.file, update); const broken = readFileSync(l.file);
  assert.throws(() => l.reopen()); assert.deepEqual(readFileSync(l.file), broken);
});

test('truncated physical database is not silently replaced with fresh genesis', t => {
  const l = rig(t); l.j.close(); writeFileSync(l.file, Buffer.from('not a database'));
  assert.throws(() => l.reopen()); assert.equal(readFileSync(l.file).toString(), 'not a database');
});

test('SQLite write contention is explicit and rejected work can be resubmitted after lock release', t => {
  const l = rig(t), other = new DatabaseSync(l.file);
  try {
    other.exec('BEGIN IMMEDIATE');
    rejectUnchanged(l.j, 'LEDGER_BUSY', () => l.act('transfer', { to: 'bob', amount: 1 }));
    other.exec('ROLLBACK'); l.act('transfer', { to: 'bob', amount: 1 });
  } finally { other.close(); } // Close before rig's directory-cleanup hook (required on Windows).
});

test('a failed COMMIT poisons the handle; reopening and lookup resolve the outcome', t => {
  const l = rig(t), reader = new DatabaseSync(l.file);
  try {
    const e = command(l.j.state, 'alice', 'transfer', { to: 'bob', amount: 1 }, fixtureKey('alice'));
    reader.exec('BEGIN'); reader.prepare('SELECT head FROM world').get();
    assert.throws(() => l.j.submit(e), e => e.code === 'LEDGER_IO_UNCERTAIN'); assert.throws(() => l.j.state, /LEDGER_CLOSED/);
    reader.exec('ROLLBACK'); const after = l.reopen(); assert.equal(after.lookup(hash(e)), null);
    after.submit(e); assert.equal(after.state.balances.bob, l.genesis.balances.bob + 1);
  } finally { reader.close(); } // Test-owned connection must not outlive directory cleanup.
});

test('portable logical export restores to a new directory only, with an exact independent checkpoint', t => {
  const l = rig(t); l.act('transfer', { to: 'bob', amount: 3 }); const bundle = l.j.export(), pin = l.j.checkpoint();
  const destination = join(l.root, 'recovered'); const after = l.track(DurableJournal.restore(destination, bundle, pin));
  assert.deepEqual(after.export(), bundle); assert.deepEqual(after.checkpoint(), pin);
  assert.throws(() => DurableJournal.restore(destination, bundle, pin), /LEDGER_EXISTS/);
  const wrong = join(l.root, 'bad'); assert.throws(() => DurableJournal.restore(wrong, bundle, { ...pin, head: 'f'.repeat(64) }), e => e.code === 'CHECKPOINT_MISMATCH');
  assert.equal(existsSync(wrong), false);
});

test('database links and unknown directory entries fail closed', t => {
  const l = rig(t); l.j.close(); writeFileSync(join(l.dir, 'unexpected'), 'x');
  assert.throws(() => l.reopen(), /LEDGER_DIRECTORY_DIRTY/); rmSync(join(l.dir, 'unexpected'));
  const linked = join(l.root, 'linked'); linkSync(l.file, linked); assert.throws(() => l.reopen(), /LEDGER_FILE/); rmSync(linked);
  const original = join(l.root, 'original.sqlite'); copyFileSync(l.file, original); rmSync(l.file);
  try { symlinkSync(original, l.file); } catch (error) {
    if (process.platform === 'win32' && ['EPERM', 'EACCES'].includes(error.code)) { t.diagnostic('Windows account cannot create symlinks; non-symlink cases above did execute.'); return; }
    throw error;
  }
  assert.throws(() => l.reopen(), /LEDGER_FILE/);
});

test('closed journal refuses use and limit/initial checkpoint inputs are validated', t => {
  const l = rig(t); l.j.close(); assert.throws(() => l.j.state, /LEDGER_CLOSED/);
  assert.throws(() => DurableJournal.initialize(join(l.root, 'invalid'), l.genesis, { maxEvents: 0 }), /BAD_INTEGER/);
  assert.throws(() => new DurableJournal(l.dir, 'f'.repeat(64)), /UNTRUSTED_GENESIS/);
});

test('missing SQLite transaction-state API is rejected by the pre-file capability check', () => {
  for (const missing of [null, {}, { isTransaction: undefined }, { isTransaction: () => false }])
    assert.throws(() => requireSqliteTransactionAPI(missing), e => e.code === 'NODE_SQLITE_VERSION');
  const supported = new DatabaseSync(':memory:');
  try { requireSqliteTransactionAPI(supported); supported.exec('BEGIN'); requireSqliteTransactionAPI(supported); supported.exec('ROLLBACK'); }
  finally { supported.close(); }
});
