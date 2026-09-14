/** Test-only lifecycle harness. All world mutations must arrive through real HTTP.
 * Two gateway listeners still share ONE journal. This is not a consensus test.
 */
import { startHost } from '../src/http.mjs';
import { Journal } from '../src/journal.mjs';
import { industrialGenesis, workMandateGenesis } from '../src/industrial-genesis.mjs';
if (process.argv.length > 3 || (process.argv[2] && process.argv[2] !== '--work-mandates')) throw new Error('Unknown fixture option.');
const journal = new Journal(process.argv[2] === '--work-mandates' ? workMandateGenesis() : industrialGenesis()), hosts = [], stopped = new Set();
async function stop(index) { if (!stopped.has(index)) { stopped.add(index); await hosts[index].close(); } }
async function shutdown() { for (let i = 0; i < hosts.length; i++) await stop(i); }
try {
  hosts.push(await startHost(journal)); hosts.push(await startHost(journal));
  if (!process.send) throw new Error('This test fixture requires an IPC parent.');
  process.send({ type: 'ready', urls: hosts.map(h => h.url) });
  process.on('message', async message => {
    try {
      if (message.type === 'stopHost' && [0, 1].includes(message.index)) { await stop(message.index); process.send({ type: 'stopped', index: message.index }); }
      else if (message.type === 'shutdown') { await shutdown(); process.disconnect(); }
    } catch (error) { console.error(error); process.exitCode = 1; await shutdown(); if (process.connected) process.disconnect(); }
  });
  process.on('disconnect', shutdown);
} catch (error) { await shutdown(); throw error; }
