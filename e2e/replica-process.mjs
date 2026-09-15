/** Local subprocess harness. Sync/fault control exists only on the parent's IPC channel, never HTTP. */
import { subscribe } from 'node:diagnostics_channel';
import { writeFileSync } from 'node:fs';
import { DurableJournal } from '../src/durable-journal.mjs';
import { industrialGenesis } from '../src/industrial-genesis.mjs';
import { hash } from '../src/canonical.mjs';
import { catchUp, replicaView } from '../src/replication.mjs';
import { startHost } from '../src/http.mjs';
const [directory, role, crash = 'none', marker = '-'] = process.argv.slice(2);
if (!process.send || !directory || !['source', 'replica'].includes(role) || !['none', 'replica-before-commit', 'replica-after-commit'].includes(crash)) throw new Error('Bad harness arguments');
const j = new DurableJournal(directory, hash(industrialGenesis())); let host, closing = false, busy = false;
async function close() { if (closing) return; closing = true; if (host) await host.close(); j.close(); }
if (crash !== 'none') subscribe('oatrix.ledger.phase', e => { if (e.phase === crash) { writeFileSync(marker, JSON.stringify(e)); process.kill(process.pid, 'SIGKILL'); } });
try {
  host = await startHost(role === 'replica' ? replicaView(j) : j, { replication: true });
  process.send({ type: 'ready', url: host.url, checkpoint: j.checkpoint(), pid: process.pid });
  process.on('message', async m => {
    if (m.type === 'shutdown') { await close(); process.disconnect(); return; }
    if (m.type !== 'sync') return;
    if (busy) { process.send({ type: 'result', id: m.id, error: 'HARNESS_BUSY' }); return; }
    busy = true;
    try { const result = await catchUp(j, m.options); process.send({ type: 'result', id: m.id, result }); }
    catch (e) { if (process.connected) process.send({ type: 'result', id: m.id, error: e.code ?? e.name }); }
    finally { busy = false; }
  });
  process.on('disconnect', close);
} catch (e) { await close(); throw e; }
