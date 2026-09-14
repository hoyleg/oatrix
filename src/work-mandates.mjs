/** Opt-in rules v3 work mandates. Limits live outside prompts; no subdelegation.
 * Cumulative admission consumption is NOT refunded by cancellation/dismantling.
 */
import { demand, fields, integer, identifier, digest, hash, clone } from './canonical.mjs';
import { validatePublicKey } from './identity.mjs';
export const WORK_FIELDS = Object.freeze({ delegateWork: Object.freeze(['id', 'publicKey', 'budget', 'until', 'scope']) });
const raws = ['ore', 'wood'];
function amounts(value) { fields(value, raws); for (const raw of raws) integer(value[raw], 0, 1_000_000); }
function uniqueList(values, check) {
  demand(Array.isArray(values) && values.length >= 1 && values.length <= 32 && new Set(values.map(x => hash(x))).size === values.length, 'WORK_SCOPE_LIST');
  for (const value of values) check(value);
}
function validateScope(scope) {
  fields(scope, ['recipes', 'machines', 'providers', 'inputs', 'extraction', 'jobs']);
  uniqueList(scope.recipes, digest); uniqueList(scope.machines, identifier);
  uniqueList(scope.providers, p => { fields(p, ['id', 'termsHash']); identifier(p.id); digest(p.termsHash); });
  amounts(scope.inputs); amounts(scope.extraction); integer(scope.jobs, 1, 1_000);
}
export function grantWork(state, principal, args) {
  demand(state.v === 3, 'RULES_VERSION'); fields(args, WORK_FIELDS.delegateWork);
  const identity = state.identities[principal]; identifier(args.id); demand(args.id !== 'root', 'RESERVED_ID');
  demand(!Object.hasOwn(identity.delegates, args.id), 'ALREADY_EXISTS'); validatePublicKey(args.publicKey);
  integer(args.budget, 0, 1_000_000_000_000); integer(args.until, state.tick + 1, state.tick + 1_000); validateScope(args.scope);
  for (const r of args.scope.recipes) demand(Object.hasOwn(state.recipes, r), 'UNKNOWN_RECIPE');
  for (const id of args.scope.machines) demand(state.assets[id]?.owner === principal && state.assets[id].kind === 'machine', 'NOT_OWNED_MACHINE');
  for (const p of args.scope.providers) demand(Object.hasOwn(state.executionProviders, p.id) && hash(state.executionProviders[p.id]) === p.termsHash, 'TERMS_CHANGED');
  const policy = clone(args.scope); policy.recipes.sort(); policy.machines.sort();
  policy.providers.sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : (a.termsHash < b.termsHash ? -1 : a.termsHash > b.termsHash ? 1 : 0));
  identity.delegates[args.id] = { publicKey: args.publicKey, actions: ['startJob'], budget: args.budget,
    until: args.until, epoch: identity.nextDelegateEpoch++, work: { policy, used: { inputs: { ore: 0, wood: 0 }, extraction: { ore: 0, wood: 0 }, jobs: 0 } } };
  return { controller: args.id, scopeHash: hash(policy), note: 'Limits authorise bounded job admission, not useful judgement or reserved inventory.' };
}
/** Called only inside the cloned transition after ordinary ownership/provider checks. */
export function consumeWork(authority, args, recipe) {
  const { policy, used } = authority.work;
  demand(policy.recipes.includes(args.recipe), 'WORK_RECIPE'); demand(policy.machines.includes(args.machine), 'WORK_MACHINE');
  demand(policy.providers.some(p => p.id === args.provider && p.termsHash === args.termsHash), 'WORK_PROVIDER');
  demand(used.jobs < policy.jobs, 'WORK_JOBS');
  const extraction = { ore: 0, wood: 0 };
  if (recipe.output.type === 'raw') extraction[recipe.output.raw] = recipe.output.amount;
  for (const raw of raws) {
    demand(used.inputs[raw] + recipe.inputs[raw] <= policy.inputs[raw], 'WORK_INPUTS');
    demand(used.extraction[raw] + extraction[raw] <= policy.extraction[raw], 'WORK_EXTRACTION');
  }
  used.jobs++;
  for (const raw of raws) { used.inputs[raw] += recipe.inputs[raw]; used.extraction[raw] += extraction[raw]; }
}
export function assertWorkMandates(state) {
  demand(state.v === 3, 'RULES_VERSION');
  for (const identity of Object.values(state.identities)) for (const grant of Object.values(identity.delegates)) {
    if (!Object.hasOwn(grant, 'work')) continue; // Legacy U-only grants are still explicitly available.
    fields(grant, ['publicKey', 'actions', 'budget', 'until', 'epoch', 'work']);
    demand(Array.isArray(grant.actions) && grant.actions.length === 1 && grant.actions[0] === 'startJob', 'WORK_ACTION');
    validatePublicKey(grant.publicKey); integer(grant.budget, 0, 1_000_000_000_000); integer(grant.until); integer(grant.epoch, 1);
    fields(grant.work, ['policy', 'used']); const { policy, used } = grant.work; validateScope(policy);
    fields(used, ['inputs', 'extraction', 'jobs']); amounts(used.inputs); amounts(used.extraction); integer(used.jobs, 0, policy.jobs);
    for (const raw of raws) demand(used.inputs[raw] <= policy.inputs[raw] && used.extraction[raw] <= policy.extraction[raw], 'WORK_BUDGET');
    // Referenced assets may be sold or retired after grant; normal job ownership checks remain decisive.
  }
  return true;
}
