/** Local inspection only; no decrypted content execution and no key in process arguments. */
import { openSync, closeSync, fstatSync, readSync } from 'node:fs';
import { openAssetPack, PACK_LIMITS } from '../src/asset-packs.mjs';
import { demand, hashBytes } from '../src/canonical.mjs';
if (process.argv.length !== 4) throw new Error('Usage: npm run pack:inspect -- <pack.oap> <separate-key-file>');
function readBounded(path, max) {
  const fd = openSync(path, 'r');
  try {
    const s = fstatSync(fd); demand(s.isFile() && s.size <= max, 'INSPECT_FILE_SIZE');
    const bytes = Buffer.alloc(s.size); let offset = 0;
    while (offset < bytes.length) { const n = readSync(fd, bytes, offset, bytes.length - offset, null); demand(n > 0, 'INSPECT_FILE_CHANGED'); offset += n; }
    demand(readSync(fd, Buffer.alloc(1), 0, 1, null) === 0, 'INSPECT_FILE_CHANGED'); return bytes;
  } finally { closeSync(fd); }
}
const pack = readBounded(process.argv[2], PACK_LIMITS.packBytes), key = readBounded(process.argv[3], 32);
try {
  const payload = openAssetPack(pack, key);
  console.log(JSON.stringify({ v: 1, packId: hashBytes(pack), world: payload.world, sourceHead: payload.sourceHead,
    assets: payload.assets, ciphertextBytes: pack.length, uniqueBlobs: payload.blobs.length,
    uniqueBytes: payload.blobs.reduce((n, b) => n + Buffer.byteLength(b.bytes, 'base64'), 0),
    note: 'Content integrity only. This does not establish current ownership or canonical ledger state.' }, null, 2));
} finally { key.fill(0); }
