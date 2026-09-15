/** Actual disk and fresh-process recovery; not network consensus or power-loss certification. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DiskArchive } from '../src/disk-archive.mjs';
const exec = promisify(execFile), root = fileURLToPath(new URL('../', import.meta.url));
async function demo(t) {
  const dir = mkdtempSync(join(tmpdir(), 'oatrix-cold-e2e-')); t.after(() => rmSync(dir, { recursive: true, force: true }));
  const { stdout } = await exec(process.execPath, ['scripts/storage-demo.mjs', dir], { cwd: root, timeout: 15_000 });
  const report = JSON.parse(stdout), d = report.directory;
  return { report, d, dir, pack: join(d, 'cold-copy', report.packId + '.oap'), key: join(d, 'owner-only', 'demo-pack.key'),
    args: ['e2e/storage-worker.mjs', 'restore', join(d, 'cold-copy'), report.packId, join(d, 'owner-only', 'demo-pack.key'), join(d, 'journal.json'),
      report.genesisHash, report.head, join(d, 'owner-only', 'restore-approval.json')] };
}
test('cold content restores in a fresh process after the producer and both online copies are gone', { timeout: 30_000 }, async t => {
  const l = await demo(t), original = readFileSync(join(l.d, 'journal.json'));
  assert.equal(l.report.onlineCopiesRemaining, 0); assert.equal(l.report.rejectedStaleApproval, 'RESTORE_HEAD');
  const result = await exec(process.execPath, l.args, { cwd: root, timeout: 15_000 }), r = JSON.parse(result.stdout);
  assert.equal(r.uniqueBytes, l.report.uniqueContentBytes); assert.equal(r.ledgerChanged, false); assert.equal(r.checkedHead, l.report.head);
  assert.deepEqual(readFileSync(join(l.d, 'journal.json')), original);
  const inspect = await exec(process.execPath, ['scripts/pack-inspect.mjs', l.pack, l.key], { cwd: root, timeout: 15_000 });
  const info = JSON.parse(inspect.stdout); assert.equal(info.packId, l.report.packId); assert.equal(info.uniqueBytes, r.uniqueBytes);
  assert.equal(inspect.stdout.includes('bytes":'), false); // Inspector reports metadata, not the plaintext payload.
});
test('fresh-process recovery rejects corruption and a wrong independently pinned checkpoint', { timeout: 30_000 }, async t => {
  const l = await demo(t), wrong = [...l.args]; wrong[7] = 'f'.repeat(64);
  await assert.rejects(exec(process.execPath, wrong, { cwd: root }), e => /CHECKPOINT_MISMATCH/.test(e.stderr));
  const bytes = readFileSync(l.pack); bytes[bytes.length - 1] ^= 1; writeFileSync(l.pack, bytes);
  await assert.rejects(exec(process.execPath, l.args, { cwd: root }), e => /ARCHIVE_CORRUPT/.test(e.stderr));
});
test('a missing key or the wrong key is real loss, not permission to manufacture replacement content', { timeout: 30_000 }, async t => {
  const l = await demo(t); writeFileSync(l.key, Buffer.alloc(32));
  await assert.rejects(exec(process.execPath, l.args, { cwd: root }), e => /PACK_DECRYPT/.test(e.stderr));
  rmSync(l.key); await assert.rejects(exec(process.execPath, l.args, { cwd: root }), e => /ENOENT/.test(e.stderr));
});
test('concurrent real archive writers cannot both exceed the shared one-file capacity', { timeout: 30_000 }, async t => {
  const l = await demo(t), second = join(l.dir, 'second.oap'), bytes = readFileSync(l.pack); bytes[40] ^= 1; writeFileSync(second, bytes);
  const target = join(l.dir, 'competing-writers');
  const results = await Promise.allSettled([l.pack, second].map(p => exec(process.execPath, ['e2e/storage-worker.mjs', 'put', target, p], { cwd: root, timeout: 15_000 })));
  assert.equal(results.filter(x => x.status === 'fulfilled').length, 1);
  const rejected = results.find(x => x.status === 'rejected'); assert.match(rejected.reason.stderr, /ARCHIVE_LOCKED|ARCHIVE_QUOTA/);
  assert.equal(new DiskArchive(target, { maxFiles: 1 }).usage().packs.length, 1);
});
