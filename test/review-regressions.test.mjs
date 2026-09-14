import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { ACTIONS, actionsFor, actionFieldsFor } from '../src/world.mjs';
import { industrialGenesis, recipeHash, resolveRecipeRef, plaqueRecipe } from '../src/industrial-genesis.mjs';
import { labGenesis } from '../src/genesis.mjs';
import { Journal } from '../src/journal.mjs';
import { startHost } from '../src/http.mjs';
import { command, fixtureKey } from '../src/identity.mjs';
import { hash } from '../src/canonical.mjs';
const exec = promisify(execFile);

test('action discovery separates envelope, v1 and v2 rules and their exact argument fields', () => {
  assert.deepEqual(ACTIONS, actionsFor(1));
  for (const name of ['publishRecipe', 'cancelJob', 'dismantle']) {
    assert.ok(!actionsFor(1).includes(name)); assert.ok(actionsFor(2).includes(name));
  }
  assert.deepEqual(actionFieldsFor(1).startJob, ['id', 'recipe', 'provider', 'termsHash']);
  assert.deepEqual(actionFieldsFor(2).startJob, ['id', 'recipe', 'machine', 'provider', 'termsHash']);
  for (const version of [0, 4, '2', '__proto__', null]) assert.throws(() => actionsFor(version), /RULES_VERSION/);
  assert.throws(() => actionFieldsFor(2).startJob.push('mint'), TypeError);
  assert.throws(() => { actionFieldsFor(2).mint = []; }, TypeError);
});
test('each host publishes discovery for its actual state version', async t => {
  for (const genesis of [labGenesis(), industrialGenesis()]) {
    const h = await startHost(new Journal(genesis)); t.after(() => h.close());
    const response = await fetch(h.url + '/api/protocol'); assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { world: genesis.world, stateVersion: genesis.v, envelopeVersion: 1, actions: actionFieldsFor(genesis.v) });
  }
});
test('recipe resolution supports a 64-hex name as well as exact digest and explicit forms', () => {
  const s = industrialGenesis(), r = plaqueRecipe(); r.id = 'a'.repeat(64);
  const key = hash(r); s.recipes[key] = { author: 'alice', definition: r };
  for (const ref of [r.id, key, 'id:' + r.id, 'hash:' + key]) assert.equal(resolveRecipeRef(s, ref), key);
  assert.equal(resolveRecipeRef(s, 'mine_ore'), recipeHash(s, 'mine_ore'));
  assert.throws(() => resolveRecipeRef(s, 'hash:' + r.id), /UNKNOWN_RECIPE/);
  for (const ref of [null, {}, '', '__proto__']) assert.throws(() => resolveRecipeRef(s, ref));
});
test('explicit recipe prefixes disambiguate names which collide with stored digests', () => {
  const s = industrialGenesis(), ore = recipeHash(s, 'mine_ore'), r = plaqueRecipe(); r.id = ore;
  const key = hash(r); s.recipes[key] = { author: 'alice', definition: r };
  assert.equal(resolveRecipeRef(s, ore), ore); assert.equal(resolveRecipeRef(s, 'id:' + ore), key);
  const duplicate = { ...r, label: 'A different definition with the same name' }; s.recipes[hash(duplicate)] = { author: 'bob', definition: duplicate };
  assert.throws(() => resolveRecipeRef(s, 'id:' + ore), /ambiguous/);
  assert.equal(resolveRecipeRef(s, 'hash:' + key), key);
});
test('real CLI starts a legally named 64-hex recipe through HTTP', async t => {
  const s = industrialGenesis(), r = { ...s.recipes[recipeHash(s, 'mine_ore')].definition, id: 'b'.repeat(64) };
  const j = new Journal(s); j.submit(command(j.state, 'alice', 'publishRecipe', { recipe: r }, fixtureKey('alice')));
  const h = await startHost(j); t.after(() => h.close());
  const result = await exec(process.execPath, ['scripts/client.mjs', 'alice', 'startJob', JSON.stringify({ id: 'hex_name', recipe: r.id }), h.url], { cwd: new URL('..', import.meta.url), timeout: 15_000 });
  assert.ok(JSON.parse(result.stdout)); assert.equal(j.state.jobs.hex_name.recipe, hash(r));
});
