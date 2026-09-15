/** Private subprocess test harness; never a network service or key-taking gateway. */
import { readFileSync } from 'node:fs';
import { DiskArchive } from '../src/disk-archive.mjs';
import { Journal } from '../src/journal.mjs';
import { restoreAssetPack } from '../src/asset-packs.mjs';
const [mode, ...args] = process.argv.slice(2);
try {
  if (mode === 'put') {
    const [directory, packFile] = args; const a = new DiskArchive(directory, { maxFiles: 1 });
    console.log(JSON.stringify({ id: a.put(readFileSync(packFile)) }));
  } else if (mode === 'restore') {
    const [directory, id, keyFile, journalFile, genesis, head, approvalFile] = args;
    const j = Journal.restore(JSON.parse(readFileSync(journalFile, 'utf8')), genesis, head);
    const key = readFileSync(keyFile);
    try {
      const r = restoreAssetPack(new DiskArchive(directory).get(id), key, j, JSON.parse(readFileSync(approvalFile, 'utf8')), 'restored_store');
      console.log(JSON.stringify(r.receipt));
    } finally { key.fill(0); }
  } else throw new Error('Unknown private test operation');
} catch (error) { console.error(error.code ?? error.message); process.exitCode = 1; }
