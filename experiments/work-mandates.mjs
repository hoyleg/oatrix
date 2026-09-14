/** Explicit v3 demonstration; never silently replaces the default v2 laboratory. */
import { Journal } from '../src/journal.mjs';
import { workMandateGenesis, recipeHash, plaqueRecipe } from '../src/industrial-genesis.mjs';
import { command, fixtureKey, publicKey } from '../src/identity.mjs';
import { hash, demand, RuleError } from '../src/canonical.mjs';
export function runWorkMandateDemo() {
  const j = new Journal(workMandateGenesis()), key = fixtureKey('demo_worker'), frames = [];
  const act = (action, args, p = 'alice') => j.submit(command(j.state, p, action, args, fixtureKey(p)));
  const capture = label => frames.push({ label, head: j.head, tick: j.state.tick, balances: j.state.balances,
    inventory: j.state.inventory.alice, grant: j.state.identities.alice.delegates.worker ?? null });
  for (const [i, raw] of ['ore', 'wood'].entries()) {
    act('startJob', { id: 'input_' + i, recipe: recipeHash(j.state, 'mine_' + raw), machine: 'alice_extractor', provider: 'host_a', termsHash: hash(j.state.executionProviders.host_a) });
    act('advance', { ticks: 1 }, 'founder');
  }
  const recipe = plaqueRecipe(); act('publishRecipe', { recipe });
  act('delegateWork', { id: 'worker', publicKey: publicKey(key), budget: 100, until: 100,
    scope: { recipes: [hash(recipe)], machines: ['alice_workbench'], providers: [{ id: 'host_a', termsHash: hash(j.state.executionProviders.host_a) }],
      inputs: { ore: 1, wood: 1 }, extraction: { ore: 0, wood: 0 }, jobs: 2 } });
  capture('Owner authorises one material allocation, not unlimited use of a 100-minor-U budget.');
  const args = id => ({ id, recipe: hash(recipe), machine: 'alice_workbench', provider: 'host_a', termsHash: hash(j.state.executionProviders.host_a) });
  const work = id => command(j.state, 'alice', 'startJob', args(id), key, { controller: 'worker' });
  j.submit(work('first')); capture('Worker starts one permitted job.');
  act('cancelJob', { id: 'first' }); capture('Owner cancels: materials return; cumulative allowance and paid fee do not.');
  const unchanged = j.head; let rejected = null;
  try { j.submit(work('second')); } catch (e) { if (!(e instanceof RuleError)) throw e; rejected = e.code; }
  demand(rejected === 'WORK_INPUTS' && unchanged === j.head, 'DEMO_BOUNDARY_FAILED');
  capture('A second admission is rejected even though the worker still has U and the material is back.');
  act('revoke', { id: 'worker' }); capture('Owner revokes the worker; root authority is unchanged.');
  // The owner may still decide to use its own resources directly.
  act('startJob', args('owner_job')); act('advance', { ticks: 2 }, 'founder');
  capture('Owner completes the product directly; limiting a worker does not destroy property rights.');
  const journal = j.export(), replay = Journal.restore(journal, j.genesisHash, j.head);
  demand(hash(replay.state) === hash(j.state) && j.state.assets.owner_job.owner === 'alice', 'DEMO_REPLAY_FAILED');
  return { report: { v: 1, world: j.state.world, rules: 3, modelCalls: 0, head: j.head, rejected, frames,
    caution: 'Experimental opt-in authority candidate. The ordinary server and economic comparisons remain on rules v2. No independent review of this change is implied.' }, journal };
}
