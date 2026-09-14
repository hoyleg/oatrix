import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Journal } from '../src/journal.mjs';
import { industrialGenesis, starterRecipes, recipeHash, plaqueRecipe, FORGE_CONTENT } from '../src/industrial-genesis.mjs';
import { hash, clone, RuleError } from '../src/canonical.mjs';
import { command, fixtureKey, publicKey } from '../src/identity.mjs';
import { ContentStore } from '../src/storage.mjs';
import { assertInvariants } from '../src/world.mjs';
import { runExperiments } from '../experiments/scenarios.mjs';

function rig(genesis = industrialGenesis()) {
  const journal = new Journal(genesis);
  const act = (p, action, args, options = {}, key = fixtureKey(p)) => journal.submit(command(journal.state, p, action, args, key, options));
  const tick = (n = 1) => act('founder', 'advance', { ticks: n });
  const start = (id, recipe, p = 'alice', machine = p + '_extractor', provider = 'host_a', options = {}, key = fixtureKey(p)) =>
    act(p, 'startJob', { id, recipe: /^[0-9a-f]{64}$/.test(recipe) ? recipe : recipeHash(journal.state, recipe), machine, provider, termsHash: hash(journal.state.executionProviders[provider]) }, options, key);
  let seq = 0;
  const mine = (raw, count = 1, p = 'alice') => { for (let i = 0; i < count; i++) { start('mine_' + seq++, 'mine_' + raw, p); tick(); } };
  const forge = (id = 'alice_forge') => { mine('ore', 4); mine('wood', 2); start(id, 'forge', 'alice', 'alice_workbench'); tick(2); return id; };
  return { journal, act, tick, start, mine, forge };
}
function rejects(l, code, fn) {
  const before = l.journal.export();
  assert.throws(fn, e => e instanceof RuleError && e.code === code);
  assert.deepEqual(l.journal.export(), before, 'rejection must leave state, nonce and journal unchanged');
}
const recipes = starterRecipes();

test('v2 genesis charges all bootstrap machine materials against the finite reserve', () => {
  const s = industrialGenesis(); assertInvariants(s);
  assert.deepEqual(s.reserve, { ore: 990, wood: 994 });
  assert.equal(Object.keys(s.assets).length, 4); assert.equal(s.supply, 120_000);
});
test('publishing a human-readable recipe creates no materials, money, machine or job', () => {
  const l = rig(), before = l.journal.state, recipe = plaqueRecipe();
  const event = l.act('alice', 'publishRecipe', { recipe });
  assert.equal(event.event.details.recipeHash, hash(recipe));
  for (const key of ['balances', 'supply', 'reserve', 'inventory', 'assets', 'jobs']) assert.deepEqual(l.journal.state[key], before[key]);
  assert.deepEqual(l.journal.state.recipes[hash(recipe)].definition, recipe);
});
test('copying a blueprint is idempotently rejected and cannot copy its author or capacity', () => {
  const l = rig(), recipe = plaqueRecipe(); l.act('alice', 'publishRecipe', { recipe });
  rejects(l, 'RECIPE_EXISTS', () => l.act('bob', 'publishRecipe', { recipe }));
});
for (const [name, mutate, error] of [
  ['unknown executable field', r => { r.script = 'grantAllPermissions()'; }, 'BAD_FIELDS'],
  ['negative ingredient', r => { r.inputs.ore = -1; }, 'BAD_INTEGER'],
  ['fractional ingredient', r => { r.inputs.ore = 0.5; }, 'BAD_INTEGER'],
  ['unknown ingredient', r => { r.inputs.unobtanium = 1; }, 'BAD_FIELDS'],
  ['zero-input assembly', r => { r.inputs = { ore: 0, wood: 0 }; }, 'MATERIAL_REQUIRED'],
  ['money output', r => { r.output = { type: 'currency', amount: 100 }; }, 'BAD_OUTPUT'],
  ['zero duration', r => { r.duration = 0; }, 'BAD_INTEGER'],
  ['unbounded duration', r => { r.duration = 101; }, 'BAD_INTEGER'],
  ['unknown machine', r => { r.machineClass = 'admin'; }, 'UNKNOWN_MACHINE_CLASS'],
  ['injected permission', r => { r.output.permissions = ['pause']; }, 'BAD_FIELDS'],
  ['free machine capacity', r => { r.output.kind = 'machine'; r.output.machineClass = 'forge'; }, 'MACHINE_INPUT_FLOOR'],
  ['machine disguised as ordinary asset', r => { r.output.kind = 'machine'; }, 'BAD_MACHINE_OUTPUT']
]) test('recipe admission rejects ' + name + ' atomically', () => {
  const l = rig(), recipe = plaqueRecipe(); mutate(recipe);
  rejects(l, error, () => l.act('alice', 'publishRecipe', { recipe }));
});
test('extraction rate is bounded by declared duration and may not hide consumed inputs', () => {
  const l = rig(), r = clone(recipes[0]); r.output.amount = 2;
  rejects(l, 'BAD_INTEGER', () => l.act('alice', 'publishRecipe', { recipe: r }));
  r.output.amount = 1; r.inputs.ore = 1;
  rejects(l, 'BAD_EXTRACTION', () => l.act('alice', 'publishRecipe', { recipe: r }));
});
test('existing recipe names are metadata, not mutable authority', () => {
  const l = rig(), r = clone(recipes[0]); r.duration = 2;
  l.act('bob', 'publishRecipe', { recipe: r });
  assert.throws(() => recipeHash(l.journal.state, r.id), /ambiguous/);
  l.start('pinned_original', hash(recipes[0])); l.tick();
  assert.equal(l.journal.state.jobs.pinned_original.status, 'complete');
});
test('wrong owner, wrong class and stale provider terms cannot start a machine', () => {
  const l = rig();
  rejects(l, 'NOT_OWNER', () => l.start('stolen', 'mine_ore', 'bob', 'alice_extractor'));
  rejects(l, 'WRONG_MACHINE', () => l.start('wrong_class', 'mine_ore', 'alice', 'alice_workbench'));
  rejects(l, 'TERMS_CHANGED', () => l.act('alice', 'startJob', { id: 'stale', recipe: hash(recipes[0]), machine: 'alice_extractor', provider: 'host_a', termsHash: hash('old') }));
});
test('one machine cannot be used twice; separate machines may work concurrently', () => {
  const l = rig(); l.start('a', 'mine_ore');
  rejects(l, 'CAPACITY_BUSY', () => l.start('b', 'mine_wood'));
  l.start('c', 'mine_wood', 'bob');
  assert.equal(Object.values(l.journal.state.jobs).filter(j => j.status === 'running').length, 2);
  l.tick(); assert.equal(l.journal.state.inventory.alice.ore, 1); assert.equal(l.journal.state.inventory.bob.wood, 1);
});
test('same principal can run different owned machines rather than one job per principal', () => {
  const l = rig(); l.mine('ore'); l.mine('wood'); const r = plaqueRecipe(); l.act('alice', 'publishRecipe', { recipe: r });
  l.start('nameplate', hash(r), 'alice', 'alice_workbench'); l.start('ore_again', 'mine_ore');
  assert.equal(Object.values(l.journal.state.jobs).filter(j => j.owner === 'alice' && j.status === 'running').length, 2);
});
test('provider capacity is separate from machine ownership and does not depend on login host', () => {
  const l = rig(); l.start('first', 'mine_ore', 'alice', 'alice_extractor', 'host_b');
  rejects(l, 'PROVIDER_CAPACITY', () => l.start('second', 'mine_ore', 'bob', 'bob_extractor', 'host_b'));
  l.start('second', 'mine_ore', 'bob', 'bob_extractor', 'host_a'); l.tick(); assertInvariants(l.journal.state);
});
test('delegated controllers share one owned machine and cannot spend its capacity twice', () => {
  const l = rig();
  for (const id of ['worker_a', 'worker_b']) l.act('alice', 'delegate', { id, publicKey: publicKey(fixtureKey(id)), actions: ['startJob'], budget: 10, until: 50 });
  l.start('first', 'mine_ore', 'alice', 'alice_extractor', 'host_a', { controller: 'worker_a' }, fixtureKey('worker_a'));
  rejects(l, 'CAPACITY_BUSY', () => l.start('second', 'mine_ore', 'alice', 'alice_extractor', 'host_a', { controller: 'worker_b' }, fixtureKey('worker_b')));
  l.tick(); l.start('second', 'mine_ore', 'alice', 'alice_extractor', 'host_a', { controller: 'worker_b' }, fixtureKey('worker_b'));
});
test('recipe publication cannot enlarge a worker mandate; insufficient budget is atomic', () => {
  const l = rig(); l.act('alice', 'delegate', { id: 'worker', publicKey: publicKey(fixtureKey('worker')), actions: ['startJob'], budget: 0, until: 20 });
  rejects(l, 'MANDATE_BUDGET', () => l.start('unfunded', 'mine_ore', 'alice', 'alice_extractor', 'host_a', { controller: 'worker' }, fixtureKey('worker')));
  rejects(l, 'MANDATE_ACTION', () => l.act('alice', 'publishRecipe', { recipe: plaqueRecipe() }, { controller: 'worker' }, fixtureKey('worker')));
});
test('a busy machine cannot be sold, dismantled or moved by its owner', () => {
  const l = rig(); l.start('running', 'mine_ore');
  rejects(l, 'ASSET_BUSY', () => l.act('alice', 'offer', { id: 'sale', asset: 'alice_extractor', price: 10, until: 20 }));
  rejects(l, 'ASSET_BUSY', () => l.act('alice', 'dismantle', { asset: 'alice_extractor' }));
  rejects(l, 'ASSET_BUSY', () => l.act('alice', 'undeploy', { asset: 'alice_extractor' }));
});
test('a machine offered for sale is not usable as active production capacity', () => {
  const l = rig(); l.act('alice', 'offer', { id: 'sale', asset: 'alice_extractor', price: 10, until: 20 });
  rejects(l, 'CAPACITY_BUSY', () => l.start('blocked', 'mine_ore'));
});
test('cancelling extraction returns reserve, not extracted stock; fee stays paid', () => {
  const l = rig(); const before = l.journal.state; l.start('cancel', 'mine_ore');
  rejects(l, 'NOT_OWNER', () => l.act('bob', 'cancelJob', { id: 'cancel' }));
  l.act('alice', 'cancelJob', { id: 'cancel' }); l.tick();
  assert.deepEqual(l.journal.state.reserve, before.reserve); assert.deepEqual(l.journal.state.inventory, before.inventory);
  assert.equal(l.journal.state.balances.alice, before.balances.alice - 1);
  assert.equal(l.journal.state.assets.alice_extractor.busy, null);
  rejects(l, 'ALREADY_EXISTS', () => l.start('cancel', 'mine_ore'));
});
test('cancelling assembly returns only its reserved inputs and releases capacity', () => {
  const l = rig(); l.mine('ore'); l.mine('wood'); const r = plaqueRecipe(); l.act('alice', 'publishRecipe', { recipe: r });
  const before = l.journal.state.inventory.alice;
  l.start('assembly', hash(r), 'alice', 'alice_workbench'); l.act('alice', 'cancelJob', { id: 'assembly' }); l.tick(3);
  assert.deepEqual(l.journal.state.inventory.alice, before); assert.equal(l.journal.state.assets.assembly, undefined);
});
test('completed jobs cannot be cancelled or manufacture twice', () => {
  const l = rig(); l.start('done', 'mine_ore'); l.tick();
  rejects(l, 'JOB_NOT_RUNNING', () => l.act('alice', 'cancelJob', { id: 'done' }));
  l.tick(5); assert.equal(l.journal.state.inventory.alice.ore, 1);
});
test('manufacture a forge, run it, sell the indivisible product and dismantle without minting U', () => {
  const l = rig(); const forge = l.forge(); l.mine('ore', 2); l.mine('wood');
  l.start('sword', 'sword', 'alice', forge); l.tick(3);
  assert.deepEqual(l.journal.state.assets.sword.embodied, { ore: 2, wood: 1 });
  const beforeSale = l.journal.state.balances;
  l.act('alice', 'offer', { id: 'sale', asset: 'sword', price: 1_000, until: 100 });
  l.act('bob', 'buy', { offer: 'sale', termsHash: hash(l.journal.state.offers.sale) });
  assert.equal(l.journal.state.balances.alice - beforeSale.alice, 980);
  const balances = l.journal.state.balances;
  l.act('bob', 'dismantle', { asset: 'sword' });
  assert.deepEqual(l.journal.state.inventory.bob, { ore: 2, wood: 1 });
  assert.deepEqual(l.journal.state.balances, balances); assert.equal(l.journal.state.supply, 120_000);
  assert.equal(l.journal.state.assets.sword, undefined); assert.equal(l.journal.state.retiredAssets.sword.owner, 'bob');
  rejects(l, 'NOT_FOUND', () => l.act('bob', 'dismantle', { asset: 'sword' }));
});
test('sale transfers the actual machine capacity, not just its appearance', () => {
  const l = rig(); l.act('alice', 'offer', { id: 'sale', asset: 'alice_extractor', price: 100, until: 20 });
  l.act('bob', 'buy', { offer: 'sale', termsHash: hash(l.journal.state.offers.sale) });
  rejects(l, 'NOT_OWNER', () => l.start('old_owner', 'mine_ore'));
  l.start('new_owner', 'mine_ore', 'bob', 'alice_extractor'); l.tick();
  assert.equal(l.journal.state.inventory.bob.ore, 1);
});
test('a dismantled bootstrap machine identifier cannot be resurrected', () => {
  const l = rig(); l.act('alice', 'dismantle', { asset: 'alice_extractor' });
  rejects(l, 'ALREADY_EXISTS', () => l.start('alice_extractor', 'mine_ore', 'bob'));
});
test('v2 journal replay pins exact recipes, signed actions and final checkpoint', () => {
  const l = rig(); l.forge(); const restored = Journal.restore(l.journal.export(), l.journal.genesisHash, l.journal.head);
  assert.deepEqual(restored.state, l.journal.state);
  const corrupt = l.journal.export(); const key = Object.keys(corrupt.genesis.recipes)[0]; corrupt.genesis.recipes[key].definition.duration++;
  assert.throws(() => Journal.restore(corrupt, l.journal.genesisHash, l.journal.head), /UNTRUSTED_GENESIS/);
});
test('all original v1 experiment checkpoints remain byte-identical under the original rules', () => {
  const baseline = JSON.parse(readFileSync(new URL('./fixtures/v1-checkpoints.json', import.meta.url), 'utf8'));
  const report = runExperiments().report;
  for (const e of baseline.checkpoints) assert.deepEqual(report.experiments.find(x => x.id === e.id).frames.map(x => x.head), e.heads);
});
test('1,000 seeded v2 candidate actions preserve money, material and machine invariants; failures are atomic', () => {
  const l = rig(); let seed = 90210, accepted = 0, rejected = 0;
  const random = n => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed % n; };
  for (let i = 0; i < 1_000; i++) {
    const before = { state: l.journal.state, head: l.journal.head, count: l.journal.events.length };
    const p = random(2) ? 'alice' : 'bob', choice = random(7);
    try {
      if (choice === 0) l.tick();
      else if (choice === 1) l.start('fuzz_' + i, random(2) ? 'mine_ore' : 'mine_wood', p, p + '_extractor', random(2) ? 'host_a' : 'host_b');
      else if (choice === 2) { const jobs = Object.entries(l.journal.state.jobs).filter(([, j]) => j.status === 'running'); l.act(p, 'cancelJob', { id: jobs[0]?.[0] ?? 'absent' }); }
      else if (choice === 3) l.start('fuzz_' + i, 'forge', p, p + '_workbench');
      else if (choice === 4) { const r = plaqueRecipe(); r.id = 'recipe_' + i; r.inputs.ore = random(3) - 1; l.act(p, 'publishRecipe', { recipe: r }); }
      else if (choice === 5) l.act(p, 'transfer', { to: p === 'alice' ? 'bob' : 'alice', amount: random(2) ? 1 : 1_000_000 });
      else { const items = Object.entries(l.journal.state.assets).filter(([id, a]) => a.owner === p && id.startsWith('fuzz_')); l.act(p, 'dismantle', { asset: items[0]?.[0] ?? 'absent' }); }
      accepted++;
    } catch (e) {
      assert.ok(e instanceof RuleError, String(e)); rejected++;
      assert.deepEqual(l.journal.state, before.state); assert.equal(l.journal.head, before.head); assert.equal(l.journal.events.length, before.count);
    }
    assertInvariants(l.journal.state);
  }
  assert.ok(accepted > 100 && rejected > 100, `accepted=${accepted}, rejected=${rejected}`);
});

test('v2 cold backups copy bytes only and cannot resurrect dismantled machine capacity', () => {
  const l = rig(), id = l.forge(), store = new ContentStore(), other = new ContentStore();
  store.put(FORGE_CONTENT); const backup = store.backup(l.journal.state, 'alice', id), before = l.journal.export();
  other.restore(backup, l.journal.state, 'alice'); assert.deepEqual(l.journal.export(), before);
  l.act('alice', 'dismantle', { asset: id });
  assert.throws(() => other.restore(backup, l.journal.state, 'alice'), /NOT_CURRENT_OWNER/);
  assert.equal(l.journal.state.assets[id], undefined); assertInvariants(l.journal.state);
});
test('checked-in recipe files exactly match the inspectable executable examples', () => {
  for (const r of [...starterRecipes(), plaqueRecipe()]) {
    const saved = JSON.parse(readFileSync(new URL('../examples/recipes/' + r.id + '.v1.json', import.meta.url), 'utf8'));
    assert.deepEqual(saved, r);
  }
});
