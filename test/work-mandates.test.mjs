import test from 'node:test';
import assert from 'node:assert/strict';
import { workMandateGenesis, industrialGenesis, recipeHash, plaqueRecipe } from '../src/industrial-genesis.mjs';
import { Journal } from '../src/journal.mjs';
import { command, fixtureKey, publicKey } from '../src/identity.mjs';
import { hash, clone } from '../src/canonical.mjs';
import { actionsFor, actionFieldsFor, assertInvariants } from '../src/world.mjs';
function rig(configure = () => {}) {
  const g = workMandateGenesis();
  for (const raw of ['ore', 'wood']) { g.inventory.alice[raw] = 20; g.reserve[raw] -= 20; }
  configure(g); const j = new Journal(g), key = fixtureKey('scoped_worker');
  const act = (action, args, p = 'alice') => j.submit(command(j.state, p, action, args, fixtureKey(p)));
  const recipe = plaqueRecipe(); act('publishRecipe', { recipe }); const plaque = hash(recipe);
  const grant = (overrides = {}, scope = {}) => act('delegateWork', {
    id: 'worker', publicKey: publicKey(key), budget: 100, until: 100,
    scope: { recipes: [plaque, recipeHash(j.state, 'mine_ore')], machines: ['alice_workbench', 'alice_extractor'],
      providers: [{ id: 'host_a', termsHash: hash(j.state.executionProviders.host_a) }],
      inputs: { ore: 2, wood: 2 }, extraction: { ore: 2, wood: 0 }, jobs: 4, ...scope }, ...overrides
  });
  const args = (id, changes = {}) => ({ id, recipe: plaque, machine: 'alice_workbench', provider: 'host_a', termsHash: hash(j.state.executionProviders.host_a), ...changes });
  const envelope = (action, a) => command(j.state, 'alice', action, a, key, { controller: 'worker' });
  const work = (id, changes) => j.submit(envelope('startJob', args(id, changes)));
  const tick = (ticks = 2) => act('advance', { ticks }, 'founder');
  return { j, key, act, grant, args, envelope, work, tick, plaque };
}
function reject(l, code, fn) {
  const head = l.j.head, state = l.j.state;
  assert.throws(fn, e => e.code === code, code); assert.equal(l.j.head, head); assert.deepEqual(l.j.state, state);
}
const used = l => l.j.state.identities.alice.delegates.worker.work.used;

test('v3 explicitly opts into work grants; v1/v2 vocabularies and default fixture do not', () => {
  assert.ok(actionsFor(3).includes('delegateWork'));
  for (const v of [1, 2]) assert.ok(!actionsFor(v).includes('delegateWork'));
  assert.deepEqual(actionFieldsFor(3).delegateWork, ['id', 'publicKey', 'budget', 'until', 'scope']);
  assert.equal(industrialGenesis().v, 2);
  const j = new Journal(industrialGenesis()), before = j.head;
  assert.throws(() => j.submit(command(j.state, 'alice', 'delegateWork', {}, fixtureKey('alice'))), /UNKNOWN_ACTION/);
  assert.equal(j.head, before);
});
test('grant records explicit scope without reserving, transferring or creating any resource', () => {
  const l = rig(), before = l.j.state; l.grant();
  for (const field of ['balances', 'inventory', 'reserve', 'assets', 'supply']) assert.deepEqual(l.j.state[field], before[field]);
  const grant = l.j.state.identities.alice.delegates.worker;
  assert.deepEqual(grant.actions, ['startJob']); assert.deepEqual(used(l), { inputs: { ore: 0, wood: 0 }, extraction: { ore: 0, wood: 0 }, jobs: 0 });
  assert.equal(l.j.events.at(-1).event.details.scopeHash, hash(grant.work.policy));
});
for (const [label, changes, code] of [
  ['unknown permission', { admin: true }, 'BAD_FIELDS'],
  ['zero admissions', { jobs: 0 }, 'BAD_INTEGER'],
  ['too many admissions', { jobs: 1001 }, 'BAD_INTEGER'],
  ['negative input', { inputs: { ore: -1, wood: 0 } }, 'BAD_INTEGER'],
  ['unknown raw', { inputs: { ore: 1, wood: 1, gold: 1 } }, 'BAD_FIELDS'],
  ['fractional extraction', { extraction: { ore: 0.5, wood: 0 } }, 'BAD_INTEGER'],
  ['empty recipe list', { recipes: [] }, 'WORK_SCOPE_LIST'],
  ['unowned machine', { machines: ['bob_workbench'] }, 'NOT_OWNED_MACHINE'],
  ['unknown recipe', { recipes: ['f'.repeat(64)] }, 'UNKNOWN_RECIPE'],
  ['stale provider terms', { providers: [{ id: 'host_a', termsHash: 'f'.repeat(64) }] }, 'TERMS_CHANGED']
]) test('work grant rejects ' + label + ' atomically', () => { const l = rig(); reject(l, code, () => l.grant({}, changes)); });
test('duplicate and oversized scope lists are bounded before activation', () => {
  const l = rig(); reject(l, 'WORK_SCOPE_LIST', () => l.grant({}, { recipes: [l.plaque, l.plaque] }));
  reject(l, 'WORK_SCOPE_LIST', () => l.grant({}, { machines: Array.from({ length: 33 }, (_, i) => 'm' + i) }));
  const p = { id: 'host_a', termsHash: hash(l.j.state.executionProviders.host_a) };
  reject(l, 'WORK_SCOPE_LIST', () => l.grant({}, { providers: [p, p] }));
});
test('a legal job consumes U, cumulative inputs and an admission exactly once', () => {
  const l = rig(); l.grant(); const b = l.j.state.balances.alice;
  l.work('job'); assert.equal(l.j.state.balances.alice, b - 2);
  assert.deepEqual(used(l), { inputs: { ore: 1, wood: 1 }, extraction: { ore: 0, wood: 0 }, jobs: 1 });
  assert.equal(l.j.state.identities.alice.delegates.worker.budget, 98);
  l.tick(); assert.equal(l.j.state.assets.job.owner, 'alice'); assert.equal(used(l).jobs, 1);
});
test('U alone cannot override a material or extraction limit', () => {
  const l = rig(); l.grant({ budget: 10_000 }, { inputs: { ore: 0, wood: 0 }, extraction: { ore: 0, wood: 0 } });
  reject(l, 'WORK_INPUTS', () => l.work('no_material_grant'));
  reject(l, 'WORK_EXTRACTION', () => l.work('no_mining_grant', { recipe: recipeHash(l.j.state, 'mine_ore'), machine: 'alice_extractor' }));
});
test('cancellation and dismantling do not replenish cumulative work allowances', () => {
  const l = rig(); l.grant({}, { inputs: { ore: 1, wood: 1 } }); const initial = l.j.state.inventory.alice;
  l.work('cancelled'); l.act('cancelJob', { id: 'cancelled' }); assert.deepEqual(l.j.state.inventory.alice, initial);
  reject(l, 'WORK_INPUTS', () => l.work('again')); assert.equal(used(l).jobs, 1);
  const other = rig(); other.grant({}, { inputs: { ore: 1, wood: 1 } }); other.work('made'); other.tick(); other.act('dismantle', { asset: 'made' });
  reject(other, 'WORK_INPUTS', () => other.work('again')); assert.equal(used(other).jobs, 1);
});
test('cancelled extraction returns reserves but not extraction allowance', () => {
  const l = rig(); l.grant({}, { extraction: { ore: 1, wood: 0 } }); const original = l.j.state.reserve.ore;
  const args = { recipe: recipeHash(l.j.state, 'mine_ore'), machine: 'alice_extractor' };
  l.work('ore', args); l.act('cancelJob', { id: 'ore' }); assert.equal(l.j.state.reserve.ore, original);
  reject(l, 'WORK_EXTRACTION', () => l.work('ore2', args)); assert.equal(used(l).extraction.ore, 1);
});
test('zero-price providers cannot bypass admission caps by repeated cancellations', () => {
  const l = rig(g => { g.executionProviders.host_a.pricePerTick = 0; }); l.grant({ budget: 0 }, { jobs: 1 });
  l.work('free'); l.act('cancelJob', { id: 'free' });
  reject(l, 'WORK_JOBS', () => l.work('free2')); assert.equal(l.j.state.identities.alice.delegates.worker.budget, 0);
});
test('recipe digest, machine and provider scope remain independently enforced', () => {
  const l = rig(g => { g.assets.bob_workbench.owner = 'alice'; }); l.grant();
  reject(l, 'WORK_MACHINE', () => l.work('other_machine', { machine: 'bob_workbench' }));
  reject(l, 'WORK_RECIPE', () => l.work('other_recipe', { recipe: recipeHash(l.j.state, 'mine_wood'), machine: 'alice_extractor' }));
  reject(l, 'WORK_PROVIDER', () => l.work('other_provider', { provider: 'host_b', termsHash: hash(l.j.state.executionProviders.host_b) }));
  const altered = plaqueRecipe(); altered.label = 'Same name, another definition'; l.act('publishRecipe', { recipe: altered });
  reject(l, 'WORK_RECIPE', () => l.work('name_substitution', { recipe: hash(altered) }));
});
test('insufficient funds, materials and provider capacity roll back work counters and nonces', () => {
  const noFunds = rig(); noFunds.grant({ budget: 1 }); reject(noFunds, 'MANDATE_BUDGET', () => noFunds.work('costs2'));
  const noInputs = rig(g => { g.reserve.ore += g.inventory.alice.ore; g.inventory.alice.ore = 0; }); noInputs.grant();
  reject(noInputs, 'MISSING_INPUTS', () => noInputs.work('missing'));
  const capacity = rig(g => { g.executionProviders.host_a.maxConcurrent = 1; }); capacity.grant();
  capacity.act('startJob', { id: 'busy', recipe: recipeHash(capacity.j.state, 'mine_ore'), machine: 'bob_extractor', provider: 'host_a', termsHash: hash(capacity.j.state.executionProviders.host_a) }, 'bob');
  reject(capacity, 'PROVIDER_CAPACITY', () => capacity.work('queued')); assert.equal(used(capacity).jobs, 0);
});
test('worker cannot transfer, dismantle, cancel or expand its own authority', () => {
  const l = rig(); l.grant();
  for (const [action, args] of [['transfer', { to: 'bob', amount: 1 }], ['dismantle', { asset: 'alice_workbench' }], ['cancelJob', { id: 'absent' }], ['pause', { reason: 'because I say so' }],
    ['delegate', { id: 'child', publicKey: publicKey(l.key), actions: ['startJob'], budget: 1, until: 20 }]])
    reject(l, 'MANDATE_ACTION', () => l.j.submit(l.envelope(action, args)));
});
test('two validly ordered commands share one grant counter, rather than multiplying its limit', () => {
  const l = rig(g => { g.assets.bob_workbench.owner = 'alice'; });
  l.grant({}, { machines: ['alice_workbench', 'bob_workbench'], jobs: 1 });
  const first = l.envelope('startJob', l.args('one')), racing = l.envelope('startJob', l.args('two', { machine: 'bob_workbench' }));
  l.j.submit(first); reject(l, 'BAD_NONCE', () => l.j.submit(racing));
  reject(l, 'WORK_JOBS', () => l.work('two', { machine: 'bob_workbench' })); assert.equal(used(l).jobs, 1);
});
test('regrant uses a fresh epoch; old signatures and usage cannot be reused', () => {
  const l = rig(); l.grant(); const old = l.envelope('startJob', l.args('old')), epoch = old.body.epoch;
  l.act('revoke', { id: 'worker' }); l.grant();
  assert.ok(l.j.state.identities.alice.delegates.worker.epoch > epoch);
  reject(l, 'STALE_CONTROLLER', () => l.j.submit(old)); assert.equal(used(l).jobs, 0); l.work('new');
});
test('revocation/expiry deny new work without erasing previously authorised commitments', () => {
  const l = rig(); l.grant({ until: 1 }); l.work('already_admitted'); l.tick(1);
  reject(l, 'MANDATE_EXPIRED', () => l.work('late')); l.tick(1); assert.ok(l.j.state.assets.already_admitted);
  const revoke = rig(); revoke.grant(); revoke.work('kept'); const pending = revoke.envelope('startJob', revoke.args('pending'));
  revoke.act('revoke', { id: 'worker' }); reject(revoke, 'NOT_FOUND', () => revoke.j.submit(pending));
  revoke.tick(); assert.ok(revoke.j.state.assets.kept);
});
test('root rotation revokes work credentials and cannot be countermanded by the worker', () => {
  const l = rig(); l.grant(); const pending = l.envelope('startJob', l.args('old'));
  l.act('rotateKey', { publicKey: publicKey(fixtureKey('new_root')) });
  assert.deepEqual(l.j.state.identities.alice.delegates, {}); reject(l, 'NOT_FOUND', () => l.j.submit(pending));
});
test('selling a scoped machine does not invalidate the world or let the old delegate use it', () => {
  const l = rig(); l.grant(); l.act('offer', { id: 'sale', asset: 'alice_workbench', price: 1, until: 10 });
  l.act('buy', { offer: 'sale', termsHash: hash(l.j.state.offers.sale) }, 'bob');
  assert.equal(assertInvariants(l.j.state), true); reject(l, 'NOT_OWNER', () => l.work('stolen'));
});
test('material limits are local to a grant, not silently aggregated across separately authorised grants', () => {
  const l = rig(); l.grant({}, { inputs: { ore: 1, wood: 1 } }); l.grant({ id: 'other' }, { inputs: { ore: 1, wood: 1 } });
  l.work('one'); l.tick();
  const e = command(l.j.state, 'alice', 'startJob', l.args('two'), l.key, { controller: 'other' }); l.j.submit(e);
  assert.equal(l.j.state.identities.alice.delegates.other.work.used.jobs, 1); assert.equal(used(l).jobs, 1);
});
test('malformed persisted work counters or expanded action lists fail invariants', () => {
  const l = rig(); l.grant(); const bad = l.j.state; bad.identities.alice.delegates.worker.work.used.jobs = 99;
  assert.throws(() => assertInvariants(bad), /BAD_INTEGER/);
  const other = l.j.state; other.identities.alice.delegates.worker.actions.push('transfer'); assert.throws(() => assertInvariants(other), /WORK_ACTION/);
});
test('legacy U-only grants keep their old meaning even in an explicitly v3 world', () => {
  const l = rig(); l.act('delegate', { id: 'worker', publicKey: publicKey(l.key), actions: ['startJob'], budget: 10, until: 50 });
  l.work('legacy'); assert.equal(l.j.state.identities.alice.delegates.worker.work, undefined); l.tick(); assert.ok(l.j.state.assets.legacy);
});
test('one thousand generated candidate actions preserve scopes, resources, atomic rejection and replay', () => {
  let accepted = 0, rejected = 0;
  for (let seed = 1; seed <= 20; seed++) {
    const l = rig(g => { g.executionProviders.host_a.pricePerTick = 0; });
    l.grant({ budget: 0 }, { inputs: { ore: 2, wood: 2 }, extraction: { ore: 3, wood: 0 }, jobs: 5 });
    let rng = seed;
    for (let i = 0; i < 50; i++) {
      rng = (Math.imul(rng, 1664525) + 1013904223) >>> 0;
      const before = l.j.head;
      try {
        if (rng % 5 === 0) l.tick(1);
        else if (rng % 5 === 1) l.work('p' + i);
        else if (rng % 5 === 2) l.work('m' + i, { recipe: recipeHash(l.j.state, 'mine_ore'), machine: 'alice_extractor' });
        else if (rng % 5 === 3) l.work('w' + i, { recipe: recipeHash(l.j.state, 'mine_wood'), machine: 'alice_extractor' });
        else {
          const id = Object.keys(l.j.state.jobs).find(id => l.j.state.jobs[id].status === 'running');
          l.act('cancelJob', { id: id ?? 'missing' });
        }
        accepted++;
      } catch (e) {
        assert.ok(['CAPACITY_BUSY', 'PROVIDER_CAPACITY', 'WORK_INPUTS', 'WORK_EXTRACTION', 'WORK_JOBS', 'WORK_RECIPE', 'NOT_FOUND'].includes(e.code), e.code);
        assert.equal(l.j.head, before); rejected++;
      }
      const u = used(l); assert.ok(u.jobs <= 5 && u.inputs.ore <= 2 && u.inputs.wood <= 2 && u.extraction.ore <= 3 && u.extraction.wood === 0);
      assert.equal(assertInvariants(l.j.state), true);
    }
    const bundle = l.j.export(); assert.deepEqual(Journal.restore(bundle, l.j.genesisHash, l.j.head).state, l.j.state);
  }
  assert.equal(accepted + rejected, 1000); assert.ok(accepted > 0 && rejected > 0);
});

test('opt-in work demonstration is repeatable, replayable and does not change the default world', async () => {
  const { runWorkMandateDemo } = await import('../experiments/work-mandates.mjs');
  const a = runWorkMandateDemo(), b = runWorkMandateDemo(); assert.deepEqual(a, b);
  assert.equal(a.report.rules, 3); assert.equal(a.report.modelCalls, 0); assert.equal(a.report.rejected, 'WORK_INPUTS');
  assert.equal(a.report.frames.length, 6);
  assert.equal(a.report.frames[2].grant.work.used.inputs.ore, 1);
  assert.equal(a.report.frames[3].head, a.report.frames[2].head);
  assert.equal(a.report.frames[4].grant, null);
  assert.equal(industrialGenesis().v, 2);
});
