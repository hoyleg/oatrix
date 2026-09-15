/** Explicit opt-in persistent laboratory. Missing/corrupt storage is fatal, never reset. */
import { readFileSync, lstatSync } from 'node:fs';
import { resolve } from 'node:path';
import { DurableJournal } from '../src/durable-journal.mjs';
import { industrialGenesis } from '../src/industrial-genesis.mjs';
import { hash, demand } from '../src/canonical.mjs';
import { startHost } from '../src/http.mjs';
import { runExperiments } from '../experiments/scenarios.mjs';
import { runSuite } from '../experiments/sweeps.mjs';
import { readJSONFile } from './sweep-io.mjs';
demand(process.argv.length <= 4, 'USAGE', 'Usage: npm run start:durable -- [directory] [trusted-checkpoint.json]');
const directory = resolve(process.argv[2] ?? '.oatrix/ledger'); let minimumCheckpoint = null;
if (process.argv[3]) {
  demand(lstatSync(process.argv[3]).size <= 4096, 'CHECKPOINT_FILE_LIMIT');
  minimumCheckpoint = JSON.parse(readFileSync(process.argv[3], 'utf8'));
}
const journal = new DurableJournal(directory, hash(industrialGenesis()), { minimumCheckpoint });
const hosts = []; let closing = false;
async function close() { if (closing) return; closing = true; for (const host of hosts) await host.close(); journal.close(); }
try {
  const { report } = runExperiments();
  const sweepReport = runSuite(await readJSONFile('examples/experiments/default.json'));
  const port = Number(process.env.PORT ?? 8787); demand(Number.isInteger(port) && port >= 0 && port <= 65534, 'BAD_PORT');
  hosts.push(await startHost(journal, { port, report, sweepReport }));
  hosts.push(await startHost(journal, { port: port ? port + 1 : 0, report, sweepReport }));
  console.log('Oatrix persistent LAB ONLY — public fixture keys; do not use real assets or secrets.');
  console.log('Database: ' + directory);
  for (const [i, host] of hosts.entries()) console.log(`Host ${i + 1}: ${host.url}`);
  console.log('Live authoritative state: /api/state. Current checkpoint: /api/checkpoint.');
  console.log('The browser console still replays fixed scenes, not the live ledger. Both hosts share one local SQLite ledger; no distributed consensus.');
  console.log('Restart replays persisted commands; missing or corrupt storage fails closed. No reset, clock advancement or migration is automatic.');
  console.log('Retain independent checkpoints to detect rollback; the database alone cannot prove freshness.');
  process.once('SIGINT', close); process.once('SIGTERM', close);
} catch (error) { await close(); throw error; }
