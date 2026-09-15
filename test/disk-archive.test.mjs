import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, readdirSync, symlinkSync, linkSync, unlinkSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DiskArchive } from '../src/disk-archive.mjs';
import { sealAssetPack } from '../src/asset-packs.mjs';
import { ContentStore } from '../src/storage.mjs';
import { Journal } from '../src/journal.mjs';
import { industrialGenesis } from '../src/industrial-genesis.mjs';
function rig(t, options = {}) {
  const root = mkdtempSync(join(tmpdir(), 'oatrix-archive-')); t.after(() => rmSync(root, { recursive: true, force: true }));
  const dir = join(root, 'archive'), j = new Journal(industrialGenesis()), store = new ContentStore(); store.put(Buffer.from('Oatrix bootstrap workbench\n'));
  const p = sealAssetPack({ head: j.head, state: j.state }, 'alice', ['alice_workbench'], store);
  return { root, dir, p, archive: new DiskArchive(dir, options) };
}
test('real archive persists across instances, deduplicates identical ciphertext and never receives keys', t => {
  const l = rig(t), a = l.archive; assert.equal(a.put(l.p.pack), l.p.id); a.put(l.p.pack);
  assert.deepEqual(a.usage().packs, [{ id: l.p.id, bytes: l.p.pack.length }]);
  assert.deepEqual(new DiskArchive(l.dir).get(l.p.id), l.p.pack);
  assert.deepEqual(readdirSync(l.dir), [l.p.id + '.oap']);
  if (process.platform !== 'win32') assert.equal(statSync(join(l.dir, l.p.id + '.oap')).mode & 0o777, 0o600);
  assert.equal(a.remove(l.p.id), true); assert.equal(a.remove(l.p.id), false); assert.throws(() => a.get(l.p.id), /ARCHIVE_MISSING/);
});
test('quota rejection preserves existing bytes and does not leave temp files or locks', t => {
  const l = rig(t), a = new DiskArchive(l.dir, { quotaBytes: l.p.pack.length, maxFiles: 1 }); a.put(l.p.pack);
  const other = Buffer.from(l.p.pack); other[other.length - 1] ^= 1;
  assert.throws(() => a.put(other), /ARCHIVE_QUOTA/); assert.deepEqual(a.get(l.p.id), l.p.pack);
  assert.deepEqual(readdirSync(l.dir), [l.p.id + '.oap']);
  assert.equal(a.put(l.p.pack), l.p.id); // Idempotent even when full.
});
test('corruption is detected on read and is not silently overwritten by a matching-name put', t => {
  const l = rig(t); l.archive.put(l.p.pack); const file = join(l.dir, l.p.id + '.oap'), corrupt = Buffer.from(l.p.pack); corrupt[40] ^= 1; writeFileSync(file, corrupt);
  assert.throws(() => l.archive.get(l.p.id), /ARCHIVE_CORRUPT/);
  assert.throws(() => l.archive.put(l.p.pack), /ARCHIVE_CORRUPT/); assert.deepEqual(readFileSync(file), corrupt);
});
test('held/crash-left locks are never stolen; old immutable packs remain readable', t => {
  const l = rig(t); l.archive.put(l.p.pack); const lock = join(l.dir, '.lock'); writeFileSync(lock, 'simulated crashed owner');
  assert.throws(() => l.archive.put(l.p.pack), /ARCHIVE_LOCKED/); assert.throws(() => l.archive.usage(), /ARCHIVE_LOCKED/);
  assert.deepEqual(l.archive.get(l.p.id), l.p.pack); assert.equal(readFileSync(lock, 'utf8'), 'simulated crashed owner');
});
test('unknown files and crash-left temporary files fail closed', t => {
  const l = rig(t); writeFileSync(join(l.dir, '.tmp-crash'), 'partial');
  assert.throws(() => l.archive.put(l.p.pack), /ARCHIVE_DIRTY/); assert.ok(readdirSync(l.dir).includes('.tmp-crash'));
});
test('archive names cannot escape the chosen directory', t => {
  const l = rig(t); for (const id of ['../escape', '/etc/passwd', 'a'.repeat(64) + '/x', '__proto__']) {
    assert.throws(() => l.archive.get(id), /BAD_DIGEST/); assert.throws(() => l.archive.remove(id), /BAD_DIGEST/);
  }
});
test('hard links are refused rather than mutating or trusting another file', t => {
  const l = rig(t), outside = join(l.root, 'outside'); writeFileSync(outside, l.p.pack);
  linkSync(outside, join(l.dir, l.p.id + '.oap'));
  assert.throws(() => l.archive.get(l.p.id), /ARCHIVE_FILE/); assert.throws(() => l.archive.put(l.p.pack), /ARCHIVE_FILE/);
  assert.deepEqual(readFileSync(outside), l.p.pack);
});
test('symlink files and symlink archive roots are refused when supported by the OS', t => {
  const l = rig(t), outside = join(l.root, 'outside'); writeFileSync(outside, l.p.pack);
  try { symlinkSync(outside, join(l.dir, l.p.id + '.oap')); }
  catch (error) { if (process.platform === 'win32' && ['EPERM', 'EACCES'].includes(error.code)) { t.skip('OS user cannot create symbolic links'); return; } throw error; }
  assert.throws(() => l.archive.get(l.p.id), /ARCHIVE_FILE/); assert.throws(() => l.archive.usage(), /ARCHIVE_FILE/);
  unlinkSync(join(l.dir, l.p.id + '.oap')); const alias = join(l.root, 'alias'); symlinkSync(l.dir, alias, 'dir');
  assert.throws(() => new DiskArchive(alias), /ARCHIVE_DIRECTORY/);
});

test('review: corrupt existing ciphertext blocks usage and unrelated writes before quota decisions', t => {
  const l = rig(t); l.archive.put(l.p.pack);
  const damaged = Buffer.from(l.p.pack); damaged[damaged.length - 1] ^= 1;
  const file = join(l.dir, l.p.id + '.oap'); writeFileSync(file, damaged);
  const other = Buffer.from(l.p.pack); other[40] ^= 1;
  for (const operation of [() => l.archive.usage(), () => l.archive.put(other), () => l.archive.remove('f'.repeat(64))]) {
    assert.throws(operation, /ARCHIVE_CORRUPT/);
    assert.deepEqual(readFileSync(file), damaged);
    assert.deepEqual(readdirSync(l.dir), [l.p.id + '.oap']);
  }
});
test('review: a well-framed pack stored under the wrong digest is not healthy archive capacity', t => {
  const l = rig(t), wrongId = l.p.id === 'a'.repeat(64) ? 'b'.repeat(64) : 'a'.repeat(64);
  writeFileSync(join(l.dir, wrongId + '.oap'), l.p.pack);
  assert.throws(() => l.archive.usage(), /ARCHIVE_CORRUPT/);
  assert.throws(() => l.archive.put(l.p.pack), /ARCHIVE_CORRUPT/);
  assert.deepEqual(readdirSync(l.dir), [wrongId + '.oap']);
});
