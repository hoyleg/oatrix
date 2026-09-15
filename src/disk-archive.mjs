/** Local, quota-bounded archive of opaque encrypted packs. No decryption keys.
 * Cooperative single-directory writers; an untrusted directory owner/OS is out of scope.
 * Files are fsynced before rename. Crash-left locks/temp files fail closed, never auto-stolen.
 */
import { constants, closeSync, existsSync, fstatSync, fsyncSync, lstatSync, mkdirSync, openSync,
  readSync, readdirSync, realpathSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { randomBytes } from 'node:crypto';
import { demand, digest, integer } from './canonical.mjs';
import { PACK_LIMITS, validatePackFrame } from './asset-packs.mjs';
export class DiskArchive {
  #dir; #quota; #files;
  constructor(directory, { quotaBytes = 32_000_000, maxFiles = 128 } = {}) {
    demand(typeof directory === 'string' && directory.length > 0, 'ARCHIVE_DIRECTORY');
    integer(quotaBytes, 1, 1_000_000_000); integer(maxFiles, 1, 1024);
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    demand(lstatSync(directory).isDirectory() && !lstatSync(directory).isSymbolicLink(), 'ARCHIVE_DIRECTORY');
    this.#dir = realpathSync(resolve(directory)); this.#quota = quotaBytes; this.#files = maxFiles;
  }
  #file(id) { digest(id); return join(this.#dir, id + '.oap'); }
  #lock(fn) {
    const lock = join(this.#dir, '.lock'); let fd;
    try { fd = openSync(lock, 'wx', 0o600); }
    catch (error) { if (error.code === 'EEXIST') demand(false, 'ARCHIVE_LOCKED'); throw error; }
    try { return fn(); }
    finally { closeSync(fd); unlinkSync(lock); }
  }
  #scan() {
    const names = readdirSync(this.#dir);
    demand(names.length <= this.#files + 1, 'ARCHIVE_FILE_LIMIT');
    let bytes = 0; const packs = [];
    for (const name of names) {
      if (name === '.lock') continue;
      demand(/^[0-9a-f]{64}\.oap$/.test(name), 'ARCHIVE_DIRTY');
      const info = lstatSync(join(this.#dir, name));
      demand(info.isFile() && !info.isSymbolicLink() && info.nlink === 1, 'ARCHIVE_FILE');
      integer(info.size, 37, PACK_LIMITS.packBytes); bytes += info.size;
      packs.push({ id: name.slice(0, -4), bytes: info.size });
    }
    demand(packs.length <= this.#files && bytes <= this.#quota, 'ARCHIVE_QUOTA');
    // Bound total work from metadata first, then verify every ciphertext address.
    // A well-sized corrupt/renamed pack must not be counted as a healthy archive.
    for (const pack of packs) demand(this.get(pack.id).length === pack.bytes, 'ARCHIVE_CHANGED');
    return { bytes, packs: packs.sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0), quotaBytes: this.#quota, maxFiles: this.#files };
  }
  usage() { return this.#lock(() => this.#scan()); }
  get(id) {
    const file = this.#file(id); let fd;
    try {
      const info = lstatSync(file); demand(info.isFile() && !info.isSymbolicLink() && info.nlink === 1, 'ARCHIVE_FILE');
      integer(info.size, 37, PACK_LIMITS.packBytes);
      fd = openSync(file, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
      const opened = fstatSync(fd); demand(opened.isFile() && opened.ino === info.ino && opened.dev === info.dev && opened.size === info.size, 'ARCHIVE_CHANGED');
      const bytes = Buffer.alloc(info.size); let offset = 0;
      while (offset < bytes.length) { const n = readSync(fd, bytes, offset, bytes.length - offset, null); demand(n > 0, 'ARCHIVE_CHANGED'); offset += n; }
      demand(readSync(fd, Buffer.alloc(1), 0, 1, null) === 0, 'ARCHIVE_CHANGED');
      demand(validatePackFrame(bytes) === id, 'ARCHIVE_CORRUPT'); return bytes;
    } catch (error) { if (error.code === 'ENOENT') demand(false, 'ARCHIVE_MISSING'); throw error; }
    finally { if (fd !== undefined) closeSync(fd); }
  }
  put(pack) {
    const id = validatePackFrame(pack), file = this.#file(id);
    return this.#lock(() => {
      const usage = this.#scan();
      if (existsSync(file)) { demand(this.get(id).equals(pack), 'ARCHIVE_CORRUPT'); return id; }
      demand(usage.packs.length < this.#files && usage.bytes + pack.length <= this.#quota, 'ARCHIVE_QUOTA');
      const temp = join(this.#dir, '.tmp-' + randomBytes(12).toString('hex')); let fd;
      try {
        fd = openSync(temp, 'wx', 0o600); writeFileSync(fd, pack); fsyncSync(fd); closeSync(fd); fd = undefined;
        renameSync(temp, file); return id;
      } finally { if (fd !== undefined) closeSync(fd); if (existsSync(temp)) unlinkSync(temp); }
    });
  }
  remove(id) {
    const file = this.#file(id);
    return this.#lock(() => { this.#scan(); if (!existsSync(file)) return false; this.get(id); unlinkSync(file); return true; });
  }
}
