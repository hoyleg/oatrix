/** Opt-in bounded SQLite journal, Node >=22.16. Local disk, not consensus.
 * SQLite owns atomic commit and crash recovery. The existing Journal owns rules.
 * Acknowledgement follows COMMIT; an uncertain commit poisons this instance.
 * The OS/directory owner and SQLite VFS are trusted. No remote SQL is exposed.
 */
import { DatabaseSync } from 'node:sqlite';
import { chmodSync, closeSync, existsSync, lstatSync, mkdirSync, openSync, readdirSync, realpathSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { channel } from 'node:diagnostics_channel';
import { Journal } from './journal.mjs';
import { canonical, clone, demand, digest, fields, hash, integer, RuleError } from './canonical.mjs';

export function requireSqliteTransactionAPI(db) {
  demand(db && typeof db.isTransaction === 'boolean', 'NODE_SQLITE_VERSION',
    'Durable mode requires Node 22.16+ with the SQLite transaction-state API.');
}
const sqliteProbe = new DatabaseSync(':memory:', { allowExtension: false });
try { requireSqliteTransactionAPI(sqliteProbe); }
finally { sqliteProbe.close(); }

export const LEDGER_LIMITS = Object.freeze({ events: 10_000, logicalBytes: 16_777_216, genesisBytes: 1_048_576, recordBytes: 65_536, databaseBytes: 67_108_864 });
const FILE = 'world.sqlite', APP_ID = 0x4f415458;
const phase = channel('oatrix.ledger.phase'); // Local diagnostics/fault tests; metadata only, no HTTP control.
const WORLD_SQL = 'CREATE TABLE world (id INTEGER PRIMARY KEY CHECK(id = 1), genesis TEXT NOT NULL, genesis_hash TEXT NOT NULL, head TEXT NOT NULL, sequence INTEGER NOT NULL, logical_bytes INTEGER NOT NULL, max_events INTEGER NOT NULL, max_bytes INTEGER NOT NULL) STRICT';
const EVENTS_SQL = 'CREATE TABLE events (sequence INTEGER PRIMARY KEY, command_hash TEXT NOT NULL UNIQUE, record TEXT NOT NULL) STRICT';
function settings({ maxEvents = 1_000, maxBytes = 8_388_608 } = {}) {
  integer(maxEvents, 1, LEDGER_LIMITS.events); integer(maxBytes, 1, LEDGER_LIMITS.logicalBytes);
  return { maxEvents, maxBytes };
}
function directoryPath(directory) {
  demand(typeof directory === 'string' && directory.length > 0, 'LEDGER_DIRECTORY');
  const path = resolve(directory);
  demand(existsSync(path), 'LEDGER_MISSING', 'Ledger directory is missing. Initialisation is explicit; no automatic reset.');
  const info = lstatSync(path);
  demand(info.isDirectory() && !info.isSymbolicLink(), 'LEDGER_DIRECTORY');
  const root = realpathSync(path), allowed = new Set([FILE, FILE + '-journal']);
  for (const name of readdirSync(root)) {
    demand(allowed.has(name), 'LEDGER_DIRECTORY_DIRTY');
    const s = lstatSync(join(root, name), { bigint: true });
    demand(s.isFile() && !s.isSymbolicLink() && s.nlink === 1n, 'LEDGER_FILE');
    demand(s.size <= BigInt(LEDGER_LIMITS.databaseBytes), 'LEDGER_FILE_LIMIT');
  }
  demand(existsSync(join(root, FILE)), 'LEDGER_MISSING');
  return root;
}
function parseBounded(text, limit) {
  demand(typeof text === 'string' && Buffer.byteLength(text) <= limit, 'LEDGER_RECORD_LIMIT');
  let value; try { value = JSON.parse(text); } catch { demand(false, 'LEDGER_JSON'); }
  demand(canonical(value) === text, 'LEDGER_ENCODING');
  return value;
}
function configure(db) {
  db.exec('PRAGMA trusted_schema=OFF; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=1000; PRAGMA synchronous=EXTRA; PRAGMA cache_size=-4096;');
  demand(db.prepare('PRAGMA journal_mode').get().journal_mode === 'delete', 'LEDGER_JOURNAL_MODE');
  demand(db.prepare('PRAGMA synchronous').get().synchronous === 3, 'LEDGER_SYNC');
  const pageSize = db.prepare('PRAGMA page_size').get().page_size;
  db.exec(`PRAGMA max_page_count=${Math.floor(LEDGER_LIMITS.databaseBytes / pageSize)}`);
}
function schema(db) {
  demand(db.prepare('PRAGMA application_id').get().application_id === APP_ID && db.prepare('PRAGMA user_version').get().user_version === 1, 'LEDGER_FORMAT');
  const actual = db.prepare("SELECT name, type, sql FROM sqlite_schema ORDER BY name").all();
  demand(actual.length === 3 && actual[0].name === 'events' && actual[0].type === 'table' && actual[0].sql === EVENTS_SQL &&
    actual[1].name === 'sqlite_autoindex_events_1' && actual[1].type === 'index' && actual[1].sql === null &&
    actual[2].name === 'world' && actual[2].type === 'table' && actual[2].sql === WORLD_SQL, 'LEDGER_SCHEMA');
}
function checkpoint(value, genesisHash) {
  fields(value, ['v', 'genesisHash', 'sequence', 'head']);
  demand(value.v === 1 && value.genesisHash === genesisHash, 'UNTRUSTED_GENESIS');
  integer(value.sequence, 0, LEDGER_LIMITS.events); digest(value.head);
}
function rollback(db) { try { if (db.isTransaction) db.exec('ROLLBACK'); } catch { /* caller poisons handle when appropriate */ } }

export class DurableJournal {
  #db; #journal; #row; #directory; #closed = false; #poisoned = false; #commands;
  constructor(directory, trustedGenesisHash, { minimumCheckpoint = null } = {}) {
    digest(trustedGenesisHash); this.#directory = directoryPath(directory);
    this.#db = new DatabaseSync(join(this.#directory, FILE), { allowExtension: false });
    try {
      configure(this.#db); this.#db.exec('BEGIN');
      const loaded = this.#load(trustedGenesisHash, minimumCheckpoint);
      this.#db.exec('COMMIT'); this.#install(loaded);
    } catch (error) { rollback(this.#db); this.#db.close(); this.#closed = true; throw error; }
  }
  /** Refuse ANY existing destination; startup never initializes a missing ledger. */
  static initialize(directory, genesis, limits = {}) {
    return DurableJournal.#create(directory, new Journal(genesis), limits);
  }
  static restore(directory, bundle, trustedCheckpoint, limits = {}) {
    fields(bundle, ['v', 'genesis', 'events', 'head']);
    const config = settings(limits);
    demand(Array.isArray(bundle.events) && bundle.events.length <= config.maxEvents, 'LEDGER_EVENT_LIMIT');
    demand(Buffer.byteLength(canonical(bundle)) <= config.maxBytes + 2 * config.maxEvents + 1024, 'LEDGER_BYTE_LIMIT');
    checkpoint(trustedCheckpoint, hash(bundle.genesis));
    demand(trustedCheckpoint.sequence === bundle.events.length, 'CHECKPOINT_MISMATCH');
    const verified = Journal.restore(bundle, trustedCheckpoint.genesisHash, trustedCheckpoint.head);
    return DurableJournal.#create(directory, verified, config);
  }
  static #create(directory, journal, limits) {
    const config = settings(limits), bundle = journal.export(), encoded = canonical(bundle.genesis);
    const records = bundle.events.map(record => ({ record, text: canonical(record) }));
    const logicalBytes = Buffer.byteLength(encoded) + records.reduce((n, r) => n + Buffer.byteLength(r.text), 0);
    demand(Buffer.byteLength(encoded) <= LEDGER_LIMITS.genesisBytes, 'LEDGER_GENESIS_LIMIT');
    demand(records.length <= config.maxEvents && records.every(r => Buffer.byteLength(r.text) <= LEDGER_LIMITS.recordBytes), 'LEDGER_EVENT_LIMIT');
    demand(logicalBytes <= config.maxBytes, 'LEDGER_BYTE_LIMIT');
    demand(typeof directory === 'string' && directory.length > 0, 'LEDGER_DIRECTORY');
    const root = resolve(directory);
    try { mkdirSync(root, { mode: 0o700 }); }
    catch (error) { if (error.code === 'EEXIST') demand(false, 'LEDGER_EXISTS'); throw error; }
    // A failed initialisation deliberately leaves evidence, never deletes a user's directory.
    const file = join(root, FILE), fd = openSync(file, 'wx', 0o600); closeSync(fd);
    const db = new DatabaseSync(file, { allowExtension: false });
    try {
      db.exec(`PRAGMA journal_mode=DELETE; PRAGMA synchronous=EXTRA; PRAGMA application_id=${APP_ID}; PRAGMA user_version=1; PRAGMA trusted_schema=OFF;`);
      const pageSize = db.prepare('PRAGMA page_size').get().page_size;
      db.exec(`PRAGMA max_page_count=${Math.floor(LEDGER_LIMITS.databaseBytes / pageSize)}; BEGIN IMMEDIATE; ${WORLD_SQL}; ${EVENTS_SQL};`);
      db.prepare('INSERT INTO world VALUES (1, ?, ?, ?, ?, ?, ?, ?)').run(encoded, journal.genesisHash, journal.head, records.length, logicalBytes, config.maxEvents, config.maxBytes);
      const insert = db.prepare('INSERT INTO events VALUES (?, ?, ?)');
      for (const r of records) insert.run(r.record.sequence, hash(r.record.envelope), r.text);
      db.exec('COMMIT');
    } catch (error) { rollback(db); throw error; }
    finally { db.close(); }
    if (process.platform !== 'win32') chmodSync(file, 0o600);
    return new DurableJournal(root, journal.genesisHash);
  }
  #load(genesisHash, minimum) {
    schema(this.#db);
    demand(this.#db.prepare('PRAGMA quick_check(1)').get().quick_check === 'ok', 'LEDGER_INTEGRITY');
    const rows = this.#db.prepare('SELECT * FROM world').all(); demand(rows.length === 1 && rows[0].id === 1, 'LEDGER_METADATA');
    const row = rows[0]; digest(row.genesis_hash); digest(row.head); demand(row.genesis_hash === genesisHash, 'UNTRUSTED_GENESIS');
    settings({ maxEvents: row.max_events, maxBytes: row.max_bytes }); integer(row.sequence, 0, row.max_events); integer(row.logical_bytes, 1, row.max_bytes);
    const genesis = parseBounded(row.genesis, LEDGER_LIMITS.genesisBytes); demand(hash(genesis) === genesisHash, 'UNTRUSTED_GENESIS');
    const count = this.#db.prepare('SELECT count(*) AS n, coalesce(sum(length(CAST(record AS BLOB))),0) AS bytes FROM events').get();
    demand(count.n === row.sequence && count.bytes + Buffer.byteLength(row.genesis) === row.logical_bytes, 'LEDGER_METADATA');
    const replay = new Journal(genesis), commands = new Map();
    if (minimum !== null) checkpoint(minimum, genesisHash);
    let anchorMatched = minimum === null || (minimum.sequence === 0 && minimum.head === replay.head);
    for (const stored of this.#db.prepare('SELECT sequence, command_hash, record FROM events ORDER BY sequence').iterate()) {
      const record = parseBounded(stored.record, LEDGER_LIMITS.recordBytes); digest(stored.command_hash);
      demand(stored.sequence === record.sequence && stored.command_hash === hash(record.envelope), 'LEDGER_RECORD');
      const accepted = replay.submit(record.envelope);
      demand(canonical(accepted) === stored.record, 'JOURNAL_MISMATCH'); commands.set(stored.command_hash, accepted);
      if (minimum !== null && stored.sequence === minimum.sequence) anchorMatched = accepted.hash === minimum.head;
    }
    demand(replay.head === row.head, 'CHECKPOINT_MISMATCH');
    demand(anchorMatched, 'CHECKPOINT_MISMATCH', 'The independently retained checkpoint is not a prefix of this journal.');
    return { row, journal: replay, commands };
  }
  #install({ row, journal, commands }) { this.#row = row; this.#journal = journal; this.#commands = commands; }
  #check() {
    demand(!this.#closed && !this.#poisoned, 'LEDGER_CLOSED');
    // Another legitimate connection must not make our cached view silently stale.
    const tip = this.#db.prepare('SELECT head, sequence, logical_bytes FROM world WHERE id=1').get();
    demand(tip && tip.head === this.#row.head && tip.sequence === this.#row.sequence && tip.logical_bytes === this.#row.logical_bytes,
      'LEDGER_STALE', 'Another writer changed the journal; refresh or reopen before continuing.');
  }
  get state() { this.#check(); return this.#journal.state; }
  get head() { this.#check(); return this.#journal.head; }
  get events() { this.#check(); return this.#journal.events; }
  get genesisHash() { return this.#journal.genesisHash; }
  get mode() { return 'single-writer-sqlite-lab'; }
  checkpoint() { this.#check(); return { v: 1, genesisHash: this.genesisHash, sequence: this.#row.sequence, head: this.#journal.head }; }
  lookup(commandHash) { this.#check(); digest(commandHash); return clone(this.#commands.get(commandHash) ?? null); }
  export() { this.#check(); return this.#journal.export(); }
  refresh(minimumCheckpoint = null) {
    demand(!this.#closed && !this.#poisoned, 'LEDGER_CLOSED');
    const retained = { v: 1, genesisHash: this.genesisHash, sequence: this.#row.sequence, head: this.#journal.head };
    this.#db.exec('BEGIN');
    try {
      const loaded = this.#load(this.genesisHash, retained);
      if (minimumCheckpoint !== null) {
        checkpoint(minimumCheckpoint, this.genesisHash);
        const at = minimumCheckpoint.sequence === 0 ? loaded.journal.genesisHash : loaded.journal.events[minimumCheckpoint.sequence - 1]?.hash;
        demand(at === minimumCheckpoint.head, 'CHECKPOINT_MISMATCH');
      }
      this.#db.exec('COMMIT'); this.#install(loaded);
    }
    catch (error) { rollback(this.#db); throw error; }
    return this.checkpoint();
  }
  submit(envelope) {
    this.#check();
    // Serialize competing processes before checking the authoritative predecessor.
    try { this.#db.exec('BEGIN IMMEDIATE'); }
    catch (error) { if ((error.errcode & 255) === 5 || (error.errcode & 255) === 6) throw new RuleError('LEDGER_BUSY'); throw error; }
    let committing = false;
    try {
      this.#check(); demand(this.#row.sequence < this.#row.max_events, 'LEDGER_EVENT_LIMIT');
      // Deliberately bounded reference implementation: replay the candidate, don't
      // mutate the accepted in-memory state and hope a later disk commit succeeds.
      const next = Journal.restore(this.#journal.export(), this.genesisHash, this.#journal.head);
      const entry = next.submit(envelope), encoded = canonical(entry), size = Buffer.byteLength(encoded);
      demand(size <= LEDGER_LIMITS.recordBytes && this.#row.logical_bytes + size <= this.#row.max_bytes, 'LEDGER_BYTE_LIMIT');
      const commandHash = hash(entry.envelope);
      this.#db.prepare('INSERT INTO events VALUES (?, ?, ?)').run(entry.sequence, commandHash, encoded);
      this.#db.prepare('UPDATE world SET head=?, sequence=?, logical_bytes=? WHERE id=1').run(entry.hash, entry.sequence, this.#row.logical_bytes + size);
      phase.publish({ phase: 'before-commit', sequence: entry.sequence, head: entry.hash });
      committing = true; this.#db.exec('COMMIT');
      phase.publish({ phase: 'after-commit', sequence: entry.sequence, head: entry.hash });
      this.#journal = next; this.#row = { ...this.#row, head: entry.hash, sequence: entry.sequence, logical_bytes: this.#row.logical_bytes + size };
      this.#commands.set(commandHash, clone(entry));
      return clone(entry);
    } catch (error) {
      rollback(this.#db);
      if (committing || !(error instanceof RuleError)) {
        this.#poisoned = true; try { this.#db.close(); } catch { /* unusable regardless */ }
        throw new RuleError('LEDGER_IO_UNCERTAIN', 'Stop and reopen the ledger, then look up the exact command; never assume an I/O failure means no commit.');
      }
      throw error;
    }
  }
  close() { if (!this.#closed) { if (!this.#poisoned) this.#db.close(); this.#closed = true; } }
}
