/** Child-process test harness. Fault phases are configured by parent before startup, never over HTTP. */
import { subscribe } from 'node:diagnostics_channel';
import { readFileSync, writeFileSync } from 'node:fs';
import { DurableJournal } from '../src/durable-journal.mjs';
import { industrialGenesis } from '../src/industrial-genesis.mjs';
import { hash } from '../src/canonical.mjs';
import { startHost } from '../src/http.mjs';
const [directory, phase = 'none', marker = '-', pinFile = '-'] = process.argv.slice(2);
if (!process.send || !directory || !['none', 'before-commit', 'after-commit'].includes(phase)) throw new Error('Bad test harness arguments');
const j = new DurableJournal(directory, hash(industrialGenesis()), { minimumCheckpoint: pinFile === '-' ? null : JSON.parse(readFileSync(pinFile, 'utf8')) });
const hosts = []; let closing = false;
async function close() { if (closing) return; closing = true; for (const host of hosts) await host.close(); j.close(); }
if (phase !== 'none') subscribe('oatrix.ledger.phase', event => {
  if (event.phase === phase) { writeFileSync(marker, JSON.stringify(event)); process.kill(process.pid, 'SIGKILL'); }
});
try {
  hosts.push(await startHost(j)); hosts.push(await startHost(j));
  process.send({ type: 'ready', urls: hosts.map(h => h.url), checkpoint: j.checkpoint() });
  process.on('message', async m => { if (m.type === 'shutdown') { await close(); process.disconnect(); } });
  process.on('disconnect', close);
} catch (error) { await close(); throw error; }
