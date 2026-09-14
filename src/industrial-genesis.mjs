/** Explicit v2 fixtures. Bootstrap machines embody real reserve units, not free duplication. */
import { labGenesis, SWORD_CONTENT } from './genesis.mjs';
import { demand, digest, hash, hashBytes, clone } from './canonical.mjs';
import { validateRecipe } from './industry.mjs';
export const FORGE_CONTENT = Buffer.from('Oatrix forge: four ore, two wood; one concurrent job.\n');
export const PLAQUE_CONTENT = Buffer.from('Oatrix plaque: one ore, one wood; built from a human-readable recipe.\n');
export function starterRecipes() {
  const raw = name => ({ v: 1, id: 'mine_' + name, revision: 1, label: 'Extract ' + name, duration: 1,
    machineClass: 'extractor', inputs: { ore: 0, wood: 0 }, output: { type: 'raw', raw: name, amount: 1 } });
  const build = (id, label, duration, machineClass, inputs, content, outputClass = null) => ({
    v: 1, id, revision: 1, label, duration, machineClass, inputs,
    output: { type: 'asset', kind: outputClass ? 'machine' : id, content: hashBytes(content), machineClass: outputClass }
  });
  return [raw('ore'), raw('wood'),
    build('forge', 'Build a forge', 2, 'workbench', { ore: 4, wood: 2 }, FORGE_CONTENT, 'forge'),
    build('sword', 'Forge a sword', 3, 'forge', { ore: 2, wood: 1 }, SWORD_CONTENT)];
}
export function plaqueRecipe() {
  return { v: 1, id: 'plaque', revision: 1, label: 'Workshop name plaque', duration: 2, machineClass: 'workbench',
    inputs: { ore: 1, wood: 1 }, output: { type: 'asset', kind: 'plaque', content: hashBytes(PLAQUE_CONTENT), machineClass: null } };
}
export function industrialGenesis() {
  const s = labGenesis(); s.v = 2; s.world = 'oatrix-lab-v2'; s.recipes = {}; s.retiredAssets = {};
  for (const recipe of starterRecipes()) { validateRecipe(recipe); s.recipes[hash(recipe)] = { author: 'founder', definition: recipe }; }
  s.executionProviders = {
    host_a: { pricePerTick: 1, maxConcurrent: 2, classes: ['extractor', 'workbench', 'forge'] },
    host_b: { pricePerTick: 2, maxConcurrent: 1, classes: ['extractor', 'workbench', 'forge'] }
  };
  for (const owner of ['alice', 'bob']) for (const [kind, embodied] of Object.entries({ extractor: { ore: 3, wood: 1 }, workbench: { ore: 2, wood: 2 } })) {
    const id = owner + '_' + kind;
    s.assets[id] = { owner, kind: 'machine', machineClass: kind, busy: null, embodied: clone(embodied),
      content: hashBytes(Buffer.from('Oatrix bootstrap ' + kind + '\n')), deployed: null, locked: null };
    for (const raw of ['ore', 'wood']) s.reserve[raw] -= embodied[raw];
  }
  return s;
}
/** Convenience for fixtures/CLI only: names are not authoritative; commands bind the digest. */
export function recipeHash(state, id, revision = 1) {
  const matches = Object.entries(state.recipes).filter(([, r]) => r.definition.id === id && r.definition.revision === revision);
  if (matches.length !== 1) throw new Error('Recipe name is missing or ambiguous; use its exact digest.');
  return matches[0][0];
}

/** Fixture/CLI resolver: existing digest first, then name; prefixes remove collisions. */
export function resolveRecipeRef(state, ref) {
  demand(typeof ref === 'string' && ref.length > 0, 'UNKNOWN_RECIPE');
  if (ref.startsWith('hash:')) {
    const key = ref.slice(5); digest(key); demand(Object.hasOwn(state.recipes, key), 'UNKNOWN_RECIPE'); return key;
  }
  if (ref.startsWith('id:')) return recipeHash(state, ref.slice(3));
  if (Object.hasOwn(state.recipes, ref)) return ref;
  return recipeHash(state, ref);
}
