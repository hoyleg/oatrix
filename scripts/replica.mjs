/** Explicit owner-run source/replica tools. No discovery trust, polling, auto-promotion or reset. */
import { lstatSync, readFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { industrialGenesis } from '../src/industrial-genesis.mjs';
import { demand, hash } from '../src/canonical.mjs';
import { catchUp, replicaView, validateCheckpoint } from '../src/replication.mjs';
import { startHost } from '../src/http.mjs';
const usage = 'Usage: replica.mjs init directory | sync directory source-origin trusted-target.json | source directory | serve directory [minimum-checkpoint.json]';
function readPin(path) {
  const s = lstatSync(path); demand(s.isFile() && !s.isSymbolicLink() && s.nlink === 1 && s.size <= 4096, 'CHECKPOINT_FILE');
  const b = readFileSync(path); demand(b.length <= 4096, 'CHECKPOINT_FILE'); const cp = JSON.parse(b.toString('utf8')); validateCheckpoint(cp); return cp;
}
let j, host, serving = false;
async function close() { if (host) { const h = host; host = null; await h.close(); } j?.close(); }
try {
  const [action, dir, arg, pin] = process.argv.slice(2);
  demand(dir && ['init', 'sync', 'source', 'serve'].includes(action) && process.argv.length <= 6, 'USAGE', usage);
  if (action === 'sync') demand(arg && pin, 'USAGE', usage);
  else demand(!pin && (action === 'serve' || !arg), 'USAGE', usage);
  // Give users with an older shell runtime a useful error rather than a SQLite import failure.
  const [major, minor] = process.versions.node.split('.').map(Number);
  demand(major > 22 || (major === 22 && minor >= 16), 'NODE_VERSION', 'Select Node 22.16.0 or later before using replica tools. No ledger files were opened.');
  const { DurableJournal } = await import('../src/durable-journal.mjs'), genesis = industrialGenesis(), directory = resolve(dir);
  if (action === 'init') { mkdirSync(dirname(directory), { recursive: true }); j = DurableJournal.initialize(directory, genesis); }
  else j = new DurableJournal(directory, hash(genesis), { minimumCheckpoint: action === 'serve' && arg ? readPin(arg) : null });
  if (action === 'sync') {
    const result = await catchUp(j, { source: arg, target: readPin(pin) }); console.log(JSON.stringify(result, null, 2));
  } else if (action === 'source' || action === 'serve') {
    const port = Number(process.env.PORT ?? (action === 'source' ? 8787 : 8789)); demand(Number.isInteger(port) && port >= 0 && port <= 65535, 'BAD_PORT');
    host = await startHost(action === 'source' ? j : replicaView(j), { port, replication: true }); serving = true;
    console.log(`Oatrix ${action === 'source' ? 'writable source' : 'read-only replica'} LAB ONLY: ${host.url}`);
    console.log('Public fixture keys. Live: /api/state and /api/checkpoint. Independent files do not establish consensus.');
    console.log('Catch-up is a separate finite command with an independently supplied target. No automatic promotion or polling.');
    process.once('SIGINT', close); process.once('SIGTERM', close);
  } else console.log(JSON.stringify({ directory, checkpoint: j.checkpoint(), note: 'Keep trusted checkpoints separately. Initialization never overwrites a directory.' }, null, 2));
} catch (e) { console.error(`${e.code ?? 'REPLICA_ERROR'}: ${e.message}`); process.exitCode = 1; }
finally { if (!serving) await close(); }
