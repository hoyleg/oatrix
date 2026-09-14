/** Opt-in v3 authority tests against real child-process hosts. No direct state mutation. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { fork } from 'node:child_process';
import { once } from 'node:events';
import { command, fixtureKey, publicKey } from '../src/identity.mjs';
import { hash } from '../src/canonical.mjs';
async function lab(t) {
  const child = fork(new URL('./host-process.mjs', import.meta.url), ['--work-mandates'], { silent: true, execArgv: [] });
  let output = '', exited = false;
  child.stdout.on('data', x => { output = (output + x).slice(-10_000); }); child.stderr.on('data', x => { output = (output + x).slice(-10_000); });
  const exit = once(child, 'exit').then(() => { exited = true; });
  t.after(async () => {
    if (exited) return;
    if (child.connected) child.send({ type: 'shutdown' }); else child.kill('SIGTERM');
    const timeout = setTimeout(() => child.kill('SIGKILL'), 2_000); try { await exit; } finally { clearTimeout(timeout); }
  });
  const ready = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => done(new Error('Readiness timeout: ' + output)), 10_000);
    const onExit = () => done(new Error('Early exit: ' + output)), onError = e => done(e);
    const onMessage = message => { if (message.type === 'ready') done(null, message); };
    function done(e, value) { clearTimeout(timer); child.off('message', onMessage); child.off('exit', onExit); child.off('error', onError); e ? reject(e) : resolve(value); }
    child.on('message', onMessage); child.once('exit', onExit); child.once('error', onError);
  });
  async function request(host, path, body) {
    const r = await fetch(ready.urls[host] + path, { signal: AbortSignal.timeout(5_000), ...(body === undefined ? {} : {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
    }) });
    return { status: r.status, data: await r.json() };
  }
  const snapshot = async (host = 0) => { const r = await request(host, '/api/state'); assert.equal(r.status, 200); return r.data; };
  const act = async (p, action, args, { host = 0, key = fixtureKey(p), controller = 'root', expected = null } = {}) => {
    const before = await snapshot(host), r = await request(host, '/api/commands', command(before.state, p, action, args, key, { controller }));
    if (expected) { assert.equal(r.status, 400); assert.equal(r.data.error, expected); assert.deepEqual(await snapshot(host), before); }
    else assert.equal(r.status, 200, JSON.stringify(r.data));
    return r;
  };
  const mine = async (raw, id) => {
    const { state } = await snapshot(); const recipe = Object.keys(state.recipes).find(k => state.recipes[k].definition.id === 'mine_' + raw);
    await act('alice', 'startJob', { id, recipe, machine: 'alice_extractor', provider: 'host_a', termsHash: hash(state.executionProviders.host_a) });
    await act('founder', 'advance', { ticks: 1 });
  };
  return { request, snapshot, act, mine };
}
async function setup(l, machines = ['alice_workbench'], jobs = 4) {
  for (const [i, raw] of ['ore', 'wood'].entries()) await l.mine(raw, 'raw_' + i);
  const { state } = await l.snapshot();
  const r = { v: 1, id: 'http_plaque', revision: 1, label: 'HTTP work test', duration: 2, machineClass: 'workbench', inputs: { ore: 1, wood: 1 },
    output: { type: 'asset', kind: 'plaque', content: hash('fixture-content'), machineClass: null } };
  await l.act('alice', 'publishRecipe', { recipe: r }); const key = fixtureKey('http_worker');
  const args = id => ({ id, recipe: hash(r), machine: machines[0], provider: 'host_a', termsHash: hash(state.executionProviders.host_a) });
  await l.act('alice', 'delegateWork', { id: 'worker', publicKey: publicKey(key), budget: 100, until: 100,
    scope: { recipes: [hash(r)], machines, providers: [{ id: 'host_a', termsHash: hash(state.executionProviders.host_a) }],
      inputs: { ore: 1, wood: 1 }, extraction: { ore: 0, wood: 0 }, jobs } });
  return { args, key, controller: 'worker' };
}
test('v3 HTTP worker is material-bounded across hosts, cancellation, revocation and regrant', { timeout: 20_000 }, async t => {
  const l = await lab(t), w = await setup(l);
  const protocol = await l.request(1, '/api/protocol'); assert.equal(protocol.data.stateVersion, 3); assert.ok(protocol.data.actions.delegateWork);
  const initial = await l.snapshot();
  await l.act('alice', 'startJob', w.args('first'), w);
  await l.act('alice', 'cancelJob', { id: 'first' }, { host: 1 });
  assert.deepEqual((await l.snapshot()).state.inventory.alice, initial.state.inventory.alice);
  await l.act('alice', 'startJob', w.args('over'), { ...w, host: 1, expected: 'WORK_INPUTS' });
  await l.act('alice', 'transfer', { to: 'bob', amount: 1 }, { ...w, expected: 'MANDATE_ACTION' });
  const current = await l.snapshot(), stale = command(current.state, 'alice', 'startJob', w.args('stale'), w.key, { controller: 'worker' });
  await l.act('alice', 'revoke', { id: 'worker' }, { host: 1 });
  assert.equal((await l.request(0, '/api/commands', stale)).data.error, 'NOT_FOUND');
  const { state } = await l.snapshot();
  await l.act('alice', 'delegateWork', { id: 'worker', publicKey: publicKey(w.key), budget: 2, until: 100,
    scope: { recipes: [w.args('x').recipe], machines: ['alice_workbench'], providers: [{ id: 'host_a', termsHash: hash(state.executionProviders.host_a) }], inputs: { ore: 1, wood: 1 }, extraction: { ore: 0, wood: 0 }, jobs: 1 } });
  assert.equal((await l.request(1, '/api/commands', stale)).data.error, 'STALE_CONTROLLER');
  await l.act('alice', 'startJob', w.args('fresh'), { ...w, host: 1 }); await l.act('founder', 'advance', { ticks: 2 });
  const final = await l.snapshot(); assert.equal(final.state.assets.fresh.owner, 'alice'); assert.equal(final.state.identities.alice.delegates.worker.work.used.jobs, 1);
  assert.deepEqual(final, await l.snapshot(1));
});
test('two HTTP hosts cannot multiply one work grant by racing separate owned machines', { timeout: 20_000 }, async t => {
  const l = await lab(t);
  await l.act('bob', 'offer', { id: 'bench_sale', asset: 'bob_workbench', price: 1, until: 100 });
  await l.act('alice', 'buy', { offer: 'bench_sale', termsHash: hash((await l.snapshot()).state.offers.bench_sale) });
  const w = await setup(l, ['alice_workbench', 'bob_workbench'], 1), { state } = await l.snapshot();
  const first = command(state, 'alice', 'startJob', w.args('race_a'), w.key, { controller: 'worker' });
  const second = command(state, 'alice', 'startJob', { ...w.args('race_b'), machine: 'bob_workbench' }, w.key, { controller: 'worker' });
  const responses = await Promise.all([l.request(0, '/api/commands', first), l.request(1, '/api/commands', second)]);
  assert.deepEqual(responses.map(r => r.status).sort(), [200, 400]); assert.equal(responses.find(r => r.status === 400).data.error, 'BAD_NONCE');
  const after = await l.snapshot(), idle = ['alice_workbench', 'bob_workbench'].find(id => after.state.assets[id].busy === null);
  await l.act('alice', 'startJob', { ...w.args('fresh_nonce'), machine: idle }, { ...w, host: 1, expected: 'WORK_JOBS' });
  assert.equal(after.state.identities.alice.delegates.worker.work.used.jobs, 1);
  assert.equal(Object.values(after.state.jobs).filter(j => j.status === 'running').length, 1);
  assert.deepEqual(await l.snapshot(0), await l.snapshot(1));
});
