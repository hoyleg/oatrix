/** CLI for the PUBLIC FIXTURE IDENTITIES only. Never load real keys into this tool. */
import { fixtureKey, command, signPayload } from '../src/identity.mjs';
import { demand, hash } from '../src/canonical.mjs';
const args = process.argv.slice(2);
if (args.length < 3 || args.length > 4) {
  console.error('Usage: node scripts/client.mjs <alice|bob|founder|...> <action> <JSON-args> [http://127.0.0.1:8787]');
  process.exit(1);
}
const [principal, action, json, rawHost = 'http://127.0.0.1:8787'] = args, host = new URL(rawHost);
demand(host.protocol === 'http:' && host.hostname === '127.0.0.1' && host.pathname === '/' && !host.search && !host.hash && !host.username && !host.password, 'LOCAL_LAB_HOST_REQUIRED');
const request = async (path, body, token) => {
  const reply = await fetch(host.origin + path, body === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: JSON.stringify(body) });
  const data = await reply.json(); demand(reply.ok, data.error ?? 'HTTP_ERROR'); return data;
};
const { state } = await request('/api/state'); demand(state.world === 'oatrix-lab-v1', 'NOT_A_LAB');
const c = await request('/api/challenges', { principal });
demand(c.audience === host.origin && c.world === state.world && c.principal === principal, 'UNEXPECTED_CHALLENGE');
const key = fixtureKey(principal), session = await request('/api/sessions', { challenge: c, signature: signPayload('OATRIX-LOGIN-1', c, key) });
let payload = JSON.parse(json);
if (action === 'startJob') {
  const provider = payload.provider ?? 'host_a';
  payload = { provider, termsHash: hash(state.executionProviders[provider]), ...payload };
}
const envelope = command(state, principal, action, payload, key);
console.log(JSON.stringify(await request('/api/commands', envelope, session.token), null, 2));
