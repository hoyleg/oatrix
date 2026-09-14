import { runExperiments } from '../experiments/scenarios.mjs';
import { startHost } from '../src/http.mjs';
const { report, journal } = runExperiments();
const port = Number(process.env.PORT ?? 8787);
if (!Number.isInteger(port) || port < 0 || port > 65534) throw new Error('PORT must be an integer from 0 to 65534 (0 selects ephemeral ports).');
const hosts = [];
try {
  hosts.push(await startHost(journal, { port, report }));
  hosts.push(await startHost(journal, { port: port === 0 ? 0 : port + 1, report }));
} catch (error) {
  for (const host of hosts) await host.close(); throw error;
}
console.log('Oatrix LAB ONLY — known fixture keys; resettable state; never use real assets or secrets.');
for (const [i, host] of hosts.entries()) console.log(`Host ${i + 1}: ${host.url}`);
console.log('The console replays fixed experiments. /api/state shows the mutable v2 machinery journal shared by both local hosts.');
console.log('Restart resets the in-memory server. No public network or blockchain has been deployed.');
let closing = false;
async function close() { if (closing) return; closing = true; for (const host of hosts) await host.close(); }
process.once('SIGINT', close); process.once('SIGTERM', close);
