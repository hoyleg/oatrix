import test from 'node:test';
import assert from 'node:assert/strict';
import { lab } from './helpers.mjs';
import { startHost } from '../src/http.mjs';
import { command, fixtureKey, signPayload } from '../src/identity.mjs';
import { runExperiments } from '../experiments/scenarios.mjs';
async function post(url, path, body, headers = {}) {
  return fetch(url + path, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });
}
test('HTTP gateways expose host-neutral signed login and retain continuity after one closes', async t => {
  const l = lab(), a = await startHost(l.journal), b = await startHost(l.journal); t.after(() => b.close());
  let aClosed = false; t.after(async () => { if (!aClosed) await a.close(); });
  const ca = await (await post(a.url, '/api/challenges', { principal: 'alice' })).json();
  assert.equal(ca.audience, a.url); await a.close(); aClosed = true;
  const cb = await (await post(b.url, '/api/challenges', { principal: 'alice' })).json();
  const session = await (await post(b.url, '/api/sessions', { challenge: cb, signature: signPayload('OATRIX-LOGIN-1', cb, fixtureKey('alice')) })).json();
  const reply = await post(b.url, '/api/commands', command(l.journal.state, 'alice', 'transfer', { to: 'bob', amount: 10 }, fixtureKey('alice')), { Authorization: 'Bearer ' + session.token });
  assert.equal(reply.status, 200); assert.equal(l.journal.state.balances.bob, 10_010);
});
test('HTTP adapter rejects cross-origin mutation, oversized requests and unsigned instructions', async t => {
  const l = lab(), h = await startHost(l.journal); t.after(() => h.close());
  const origin = await post(h.url, '/api/challenges', { principal: 'alice' }, { Origin: 'https://evil.example' });
  assert.equal((await origin.json()).error, 'ORIGIN_REJECTED');
  const large = await post(h.url, '/api/challenges', { principal: 'a'.repeat(40_000) }); assert.equal(large.status, 413);
  const invalid = await post(h.url, '/api/commands', {}); assert.equal(invalid.status, 400); assert.equal(l.journal.events.length, 0);
});
test('web console and exported experiment report are served without third-party scripts', async t => {
  const l = lab(), h = await startHost(l.journal, { report: runExperiments().report }); t.after(() => h.close());
  const html = await fetch(h.url); assert.equal(html.status, 200); assert.match(html.headers.get('Content-Security-Policy'), /frame-ancestors 'none'/);
  assert.match(await html.text(), /OATRIX/);
  const report = await (await fetch(h.url + '/report.json')).json(); assert.equal(report.experiments.length, 6);
  for (const path of ['/app.mjs', '/style.css', '/api/state', '/api/health', '/api/events']) assert.equal((await fetch(h.url + path)).status, 200);
  assert.equal((await fetch(h.url + '/not-a-file')).status, 404);
});
test('experiment traces are deterministic across complete repeated runs', () => {
  assert.deepEqual(runExperiments().report, runExperiments().report);
});
