/** Bounded checkpoint-pinned replication, not consensus or automatic leader election.
 * Source responses are untrusted. No data is installed until the WHOLE target
 * history verifies, and the durable importer checks the local predecessor again.
 */
import { canonical, clone, demand, digest, fields, hash, integer } from './canonical.mjs';
import { Journal } from './journal.mjs';

export const REPLICATION_LIMITS = Object.freeze({ events: 10_000, recordBytes: 65_536,
  logicalBytes: 16_777_216, pageEvents: 32, pageBytes: 262_144, deadlineMs: 30_000 });
export function validateCheckpoint(cp) {
  fields(cp, ['v', 'genesisHash', 'sequence', 'head']);
  demand(cp.v === 1, 'REPLICA_VERSION'); digest(cp.genesisHash); digest(cp.head);
  integer(cp.sequence, 0, REPLICATION_LIMITS.events);
  if (cp.sequence === 0) demand(cp.head === cp.genesisHash, 'REPLICA_GENESIS_HEAD');
  return cp;
}
export function sameCheckpoint(a, b) { return canonical(a) === canonical(b); }
function lineage(from, target) {
  validateCheckpoint(from); validateCheckpoint(target);
  demand(from.genesisHash === target.genesisHash, 'UNTRUSTED_GENESIS');
  demand(target.sequence >= from.sequence, 'REPLICA_ROLLBACK');
  if (from.sequence === target.sequence) demand(from.head === target.head, 'REPLICA_FORK');
}
export function checkpointOf(journal) {
  const b = journal.export();
  return { v: 1, genesisHash: hash(b.genesis), sequence: b.events.length, head: b.head };
}
/** Pure serving function. An older explicitly pinned target is allowed while the writer advances. */
export function exportPage(journal, request) {
  fields(request, ['from', 'target', 'limit']);
  const { from, target, limit } = request; lineage(from, target);
  integer(limit, 1, REPLICATION_LIMITS.pageEvents);
  const bundle = journal.export(), genesisHash = hash(bundle.genesis);
  demand(genesisHash === from.genesisHash, 'UNTRUSTED_GENESIS');
  const at = sequence => sequence === 0 ? genesisHash : bundle.events[sequence - 1]?.hash;
  demand(at(from.sequence) === from.head, 'REPLICA_FORK');
  demand(at(target.sequence) === target.head, 'REPLICA_TARGET_UNAVAILABLE');
  const records = [], page = { v: 1, from: clone(from), target: clone(target), next: clone(from), records };
  for (let i = from.sequence; i < target.sequence && records.length < limit; i++) {
    const record = bundle.events[i];
    demand(Buffer.byteLength(canonical(record)) <= REPLICATION_LIMITS.recordBytes, 'REPLICA_RECORD_LIMIT');
    records.push(record); page.next = { ...from, sequence: record.sequence, head: record.hash };
    if (Buffer.byteLength(canonical(page)) > REPLICATION_LIMITS.pageBytes) {
      records.pop(); const last = records.at(-1);
      page.next = last ? { ...from, sequence: last.sequence, head: last.hash } : clone(from); break;
    }
  }
  demand(from.sequence === target.sequence || records.length > 0, 'REPLICA_NO_PROGRESS');
  return page;
}
/** Validate a remote page and each exact replay result. Mutates only a disposable staging Journal. */
export function replayPage(staging, page, from, target, limit = REPLICATION_LIMITS.pageEvents) {
  lineage(from, target); integer(limit, 1, REPLICATION_LIMITS.pageEvents);
  fields(page, ['v', 'from', 'target', 'next', 'records']);
  demand(Buffer.byteLength(canonical(page)) <= REPLICATION_LIMITS.pageBytes, 'REPLICA_PAGE_LIMIT');
  demand(page.v === 1, 'REPLICA_VERSION'); validateCheckpoint(page.next);
  demand(sameCheckpoint(page.from, from) && sameCheckpoint(page.target, target), 'REPLICA_PAGE_BINDING');
  demand(sameCheckpoint(checkpointOf(staging), from), 'REPLICA_STAGING_CHANGED');
  demand(Array.isArray(page.records) && page.records.length <= limit &&
    page.records.length <= target.sequence - from.sequence, 'REPLICA_RECORD_COUNT');
  demand(page.records.length > 0 || sameCheckpoint(from, target), 'REPLICA_NO_PROGRESS');
  for (const record of page.records) {
    demand(Buffer.byteLength(canonical(record)) <= REPLICATION_LIMITS.recordBytes, 'REPLICA_RECORD_LIMIT');
    const accepted = staging.submit(record.envelope);
    demand(canonical(accepted) === canonical(record), 'JOURNAL_MISMATCH');
  }
  const next = checkpointOf(staging);
  demand(sameCheckpoint(next, page.next), 'REPLICA_NEXT');
  if (next.sequence === target.sequence) demand(sameCheckpoint(next, target), 'REPLICA_TARGET_MISMATCH');
  return next;
}
export function validateSource(source) {
  demand(typeof source === 'string' && source.length <= 500, 'REPLICA_SOURCE');
  let u; try { u = new URL(source); } catch { demand(false, 'REPLICA_SOURCE'); }
  demand(u.origin === source && !u.username && !u.password, 'REPLICA_SOURCE');
  demand(u.protocol === 'https:' || (u.protocol === 'http:' && ['127.0.0.1', '[::1]'].includes(u.hostname)), 'REPLICA_SOURCE');
  return u.origin;
}
async function fetchPage(source, request, signal) {
  const url = new URL('/api/replication', source);
  url.search = new URLSearchParams({ genesis: request.from.genesisHash, after: String(request.from.sequence),
    head: request.from.head, target: String(request.target.sequence), targetHead: request.target.head, limit: String(request.limit) });
  const response = await fetch(url, { signal, redirect: 'error', credentials: 'omit', headers: { Accept: 'application/json' } });
  let reader;
  try {
    demand(response.status === 200, 'REPLICA_HTTP_STATUS');
    demand(response.headers.get('content-type')?.split(';')[0].trim() === 'application/json', 'REPLICA_CONTENT_TYPE');
    const declared = response.headers.get('content-length');
    if (declared !== null) demand(/^\d+$/.test(declared) && Number(declared) <= REPLICATION_LIMITS.pageBytes, 'REPLICA_PAGE_LIMIT');
    demand(response.body, 'REPLICA_EMPTY_RESPONSE'); reader = response.body.getReader();
    let count = 0; const chunks = [];
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      count += value.byteLength; demand(count <= REPLICATION_LIMITS.pageBytes, 'REPLICA_PAGE_LIMIT'); chunks.push(value);
    }
    let result;
    try { result = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks))); }
    catch { demand(false, 'REPLICA_JSON'); }
    return result;
  } finally { if (reader) { await reader.cancel().catch(() => {}); reader.releaseLock(); } else await response.body?.cancel().catch(() => {}); }
}
/** One finite pull. The owner supplies target separately; never promote a response to a trust anchor.
 * There is no retry loop, automatic target refresh, conflict resolution or writer promotion.
 */
export async function catchUp(journal, { source, target, pageSize = REPLICATION_LIMITS.pageEvents, timeoutMs = REPLICATION_LIMITS.deadlineMs }) {
  validateSource(source); validateCheckpoint(target); target = clone(target);
  integer(pageSize, 1, REPLICATION_LIMITS.pageEvents); integer(timeoutMs, 1, REPLICATION_LIMITS.deadlineMs);
  const base = journal.checkpoint(); lineage(base, target);
  const bundle = journal.export(), staging = Journal.restore(bundle, base.genesisHash, base.head);
  let cursor = clone(base), pages = 0, total = 0; const records = [], signal = AbortSignal.timeout(timeoutMs);
  while (cursor.sequence < target.sequence) {
    signal.throwIfAborted();
    const page = await fetchPage(source, { from: cursor, target, limit: pageSize }, signal);
    cursor = replayPage(staging, page, cursor, target, pageSize); pages++;
    for (const record of page.records) { total += Buffer.byteLength(canonical(record)); records.push(record); }
    demand(total <= REPLICATION_LIMITS.logicalBytes, 'REPLICA_BYTE_LIMIT');
    demand(records.length <= REPLICATION_LIMITS.events, 'REPLICA_RECORD_COUNT');
  }
  signal.throwIfAborted();
  // Rechecks all records/permissions in the transaction; staging is not trusted by the writer.
  const installed = journal.importRecords(records, base, target);
  return { v: 1, from: base, checkpoint: installed, pages, records: records.length, recordBytes: total,
    caution: 'Validated to the supplied checkpoint, not proof of network freshness or consensus. No automatic failover.' };
}
/** Read-only service facade, not protection against the filesystem owner replacing the software. */
export function replicaView(journal) {
  return Object.freeze({
    get state() { return journal.state; }, get head() { return journal.head; }, get events() { return journal.events; },
    get genesisHash() { return journal.genesisHash; }, mode: 'verified-read-only-replica-lab',
    checkpoint: () => journal.checkpoint(), lookup: h => journal.lookup(h), export: () => journal.export(),
    refreshForRead: () => journal.refresh(), submit: () => demand(false, 'REPLICA_READ_ONLY')
  });
}
