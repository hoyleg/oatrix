/** Rules v2: declarative recipes, owned machines and provider execution slots.
 * Recipe data is never evaluated as code. All side effects remain fixed here.
 */
import { consumeWork } from './work-mandates.mjs';
import { demand, integer, identifier, text, digest, fields, clone, hash, sum } from './canonical.mjs';

export const INDUSTRY_FIELDS = Object.freeze({
  publishRecipe: ['recipe'],
  startJob: ['id', 'recipe', 'machine', 'provider', 'termsHash'],
  cancelJob: ['id'], dismantle: ['asset']
});
const MATERIALS = ['ore', 'wood'];
const MACHINE_COST = {
  extractor: { ore: 3, wood: 1 }, workbench: { ore: 2, wood: 2 }, forge: { ore: 4, wood: 2 }
};
const MAX_RECIPES = 256;
function quantities(value) {
  fields(value, MATERIALS);
  for (const r of MATERIALS) integer(value[r], 0, 1_000);
}
function machineClass(value) {
  demand(typeof value === 'string' && Object.hasOwn(MACHINE_COST, value), 'UNKNOWN_MACHINE_CLASS');
}
function owned(s, principal, id) {
  identifier(id); demand(Object.hasOwn(s.assets, id), 'NOT_FOUND');
  const a = s.assets[id]; demand(a.owner === principal, 'NOT_OWNER'); return a;
}
export function validateRecipe(r) {
  fields(r, ['v', 'id', 'revision', 'label', 'duration', 'machineClass', 'inputs', 'output']);
  demand(r.v === 1, 'RECIPE_VERSION'); identifier(r.id); integer(r.revision, 1, 1_000);
  text(r.label, 120); integer(r.duration, 1, 100); machineClass(r.machineClass); quantities(r.inputs);
  demand(r.output !== null && typeof r.output === 'object' && !Array.isArray(r.output), 'BAD_OUTPUT');
  if (r.output.type === 'raw') {
    fields(r.output, ['type', 'raw', 'amount']);
    demand(MATERIALS.includes(r.output.raw), 'UNKNOWN_MATERIAL'); integer(r.output.amount, 1, r.duration);
    demand(r.machineClass === 'extractor' && sum(Object.values(r.inputs)) === 0, 'BAD_EXTRACTION');
  } else {
    demand(r.output.type === 'asset', 'BAD_OUTPUT');
    fields(r.output, ['type', 'kind', 'content', 'machineClass']);
    identifier(r.output.kind); digest(r.output.content);
    demand(r.machineClass !== 'extractor' && sum(Object.values(r.inputs)) > 0, 'MATERIAL_REQUIRED');
    if (r.output.machineClass !== null) {
      machineClass(r.output.machineClass);
      demand(r.output.kind === 'machine', 'BAD_MACHINE_OUTPUT');
      for (const raw of MATERIALS) demand(r.inputs[raw] >= MACHINE_COST[r.output.machineClass][raw], 'MACHINE_INPUT_FLOOR');
    } else demand(r.output.kind !== 'machine', 'BAD_MACHINE_OUTPUT');
  }
  return true;
}
export function validateProvider(p) {
  fields(p, ['pricePerTick', 'maxConcurrent', 'classes']);
  integer(p.pricePerTick, 0, 1_000); integer(p.maxConcurrent, 1, 64);
  demand(Array.isArray(p.classes) && p.classes.length > 0 && p.classes.length <= 3 && new Set(p.classes).size === p.classes.length, 'BAD_PROVIDER');
  for (const c of p.classes) machineClass(c);
}
/** Caller has already verified the envelope and cloned state; debit/payout are core-only. */
export function industryAction(s, principal, action, args, authority, { debit, payout }) {
  const a = args;
  if (action === 'publishRecipe') {
    validateRecipe(a.recipe);
    const recipeHash = hash(a.recipe);
    demand(!Object.hasOwn(s.recipes, recipeHash), 'RECIPE_EXISTS');
    demand(Object.keys(s.recipes).length < MAX_RECIPES, 'RECIPE_LIMIT');
    s.recipes[recipeHash] = { author: principal, definition: clone(a.recipe) };
    return { recipeHash, note: 'Definition published; no materials, capacity or currency created.' };
  }
  if (action === 'startJob') {
    identifier(a.id); digest(a.recipe); identifier(a.provider); digest(a.termsHash);
    demand(!Object.hasOwn(s.jobs, a.id) && !Object.hasOwn(s.assets, a.id) && !Object.hasOwn(s.retiredAssets, a.id), 'ALREADY_EXISTS');
    demand(Object.hasOwn(s.recipes, a.recipe), 'UNKNOWN_RECIPE');
    const r = s.recipes[a.recipe].definition, machine = owned(s, principal, a.machine);
    demand(machine.kind === 'machine' && machine.machineClass === r.machineClass, 'WRONG_MACHINE');
    demand(machine.busy === null && machine.locked === null, 'CAPACITY_BUSY');
    demand(Object.hasOwn(s.executionProviders, a.provider), 'NOT_FOUND');
    const provider = s.executionProviders[a.provider];
    demand(a.termsHash === hash(provider), 'TERMS_CHANGED');
    demand(provider.classes.includes(r.machineClass), 'PROVIDER_CAPABILITY');
    demand(Object.values(s.jobs).filter(j => j.status === 'running' && j.provider === a.provider).length < provider.maxConcurrent, 'PROVIDER_CAPACITY');
    if (s.v === 3 && authority !== null && Object.hasOwn(authority, 'work')) consumeWork(authority, a, r);
    const extracted = { ore: 0, wood: 0 };
    for (const raw of MATERIALS) {
      demand(s.inventory[principal][raw] >= r.inputs[raw], 'MISSING_INPUTS');
      s.inventory[principal][raw] -= r.inputs[raw];
    }
    if (r.output.type === 'raw') {
      const { raw, amount } = r.output;
      demand(s.reserve[raw] >= amount, 'RESERVE_EMPTY'); s.reserve[raw] -= amount; extracted[raw] = amount;
    }
    const fee = r.duration * provider.pricePerTick;
    debit(s, principal, authority, fee); const levy = payout(s, a.provider, fee, principal);
    machine.busy = a.id;
    s.jobs[a.id] = { owner: principal, provider: a.provider, machine: a.machine, recipe: a.recipe,
      inputs: clone(r.inputs), extracted, end: s.tick + r.duration, status: 'running', fee };
    return { recipeHash: a.recipe, machine: a.machine, fee, levy };
  }
  if (action === 'cancelJob') {
    identifier(a.id); demand(Object.hasOwn(s.jobs, a.id), 'NOT_FOUND'); const job = s.jobs[a.id];
    demand(job.owner === principal, 'NOT_OWNER'); demand(job.status === 'running', 'JOB_NOT_RUNNING');
    for (const raw of MATERIALS) { s.inventory[principal][raw] += job.inputs[raw]; s.reserve[raw] += job.extracted[raw]; }
    s.assets[job.machine].busy = null; job.status = 'cancelled';
    return { feeRefunded: 0, note: 'Materials returned; admission fee was already settled.' };
  }
  if (action === 'dismantle') {
    const asset = owned(s, principal, a.asset);
    demand(asset.busy === null && asset.locked === null && asset.deployed === null, 'ASSET_BUSY');
    for (const raw of MATERIALS) s.inventory[principal][raw] += asset.embodied[raw];
    s.retiredAssets[a.asset] = { owner: principal, content: asset.content, tick: s.tick };
    delete s.assets[a.asset];
    return { returned: clone(asset.embodied), note: 'Recovered embodied material only; no monetary reward.' };
  }
  demand(false, 'UNKNOWN_ACTION');
}
export function finishIndustryTick(s) {
  for (const id of Object.keys(s.jobs).sort()) {
    const job = s.jobs[id]; if (job.status !== 'running' || job.end > s.tick) continue;
    const r = s.recipes[job.recipe].definition;
    if (r.output.type === 'raw') s.inventory[job.owner][r.output.raw] += r.output.amount;
    else {
      demand(!Object.hasOwn(s.assets, id) && !Object.hasOwn(s.retiredAssets, id), 'ALREADY_EXISTS');
      s.assets[id] = { owner: job.owner, kind: r.output.kind, content: r.output.content,
        embodied: clone(job.inputs), machineClass: r.output.machineClass, busy: null, deployed: null, locked: null };
    }
    s.assets[job.machine].busy = null; job.status = 'complete';
  }
}
export function assertIndustry(s) {
  demand(s.v === 2 || s.v === 3, 'RULES_VERSION');
  demand(Object.keys(s.recipes).length <= MAX_RECIPES, 'RECIPE_LIMIT');
  for (const [key, entry] of Object.entries(s.recipes)) {
    fields(entry, ['author', 'definition']); validateRecipe(entry.definition);
    demand(Object.hasOwn(s.identities, entry.author) && key === hash(entry.definition), 'RECIPE_INTEGRITY');
  }
  for (const [id, provider] of Object.entries(s.executionProviders)) {
    demand(Object.hasOwn(s.identities, id), 'UNKNOWN_ACCOUNT'); validateProvider(provider);
    demand(Object.values(s.jobs).filter(j => j.status === 'running' && j.provider === id).length <= provider.maxConcurrent, 'PROVIDER_CAPACITY');
  }
  for (const [id, asset] of Object.entries(s.assets)) {
    demand(!Object.hasOwn(s.retiredAssets, id), 'RETIRED_ASSET'); quantities(asset.embodied);
    if (asset.kind === 'machine') {
      machineClass(asset.machineClass);
      for (const raw of MATERIALS) demand(asset.embodied[raw] >= MACHINE_COST[asset.machineClass][raw], 'MACHINE_INPUT_FLOOR');
    } else demand(asset.machineClass === null && asset.busy === null, 'BAD_MACHINE_OUTPUT');
    if (asset.busy !== null) {
      const j = s.jobs[asset.busy];
      demand(j?.status === 'running' && j.machine === id && j.owner === asset.owner && asset.locked === null, 'BAD_CAPACITY');
    }
  }
  const runningMachines = new Set();
  for (const [id, job] of Object.entries(s.jobs)) {
    demand(['running', 'complete', 'cancelled'].includes(job.status), 'BAD_JOB');
    demand(Object.hasOwn(s.recipes, job.recipe), 'UNKNOWN_RECIPE');
    quantities(job.inputs); quantities(job.extracted); integer(job.end); integer(job.fee);
    if (job.status !== 'running') continue;
    const machine = s.assets[job.machine], recipe = s.recipes[job.recipe].definition;
    demand(!runningMachines.has(job.machine), 'BAD_CAPACITY'); runningMachines.add(job.machine);
    demand(machine?.busy === id && machine.owner === job.owner && machine.machineClass === recipe.machineClass, 'BAD_CAPACITY');
    demand(Object.hasOwn(s.executionProviders, job.provider) && s.executionProviders[job.provider].classes.includes(recipe.machineClass), 'PROVIDER_CAPABILITY');
    demand(hash(job.inputs) === hash(recipe.inputs) && job.end > s.tick, 'BAD_JOB');
    const expected = { ore: 0, wood: 0 };
    if (recipe.output.type === 'raw') expected[recipe.output.raw] = recipe.output.amount;
    demand(hash(expected) === hash(job.extracted), 'BAD_EXTRACTION');
  }
  return true;
}
