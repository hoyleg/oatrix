/** Bounded v2 experiment. Choices and demand are scripted, not observed market behaviour. */
import { Journal } from '../src/journal.mjs';
import { industrialGenesis, recipeHash, plaqueRecipe } from '../src/industrial-genesis.mjs';
import { command, fixtureKey } from '../src/identity.mjs';
import { hash } from '../src/canonical.mjs';
export function runMachineryExperiment() {
  const journal = new Journal(industrialGenesis()), frames = [];
  const capture = (label, detail = '') => frames.push({ label, detail, head: journal.head, state: journal.state });
  const act = (p, action, args, label = action) => { journal.submit(command(journal.state, p, action, args, fixtureKey(p))); capture(label); };
  const tick = n => act('founder', 'advance', { ticks: n }, `Advance ${n} logical tick(s); deterministic machines work without model calls`);
  const start = (id, recipe, machine) => act('alice', 'startJob', {
    id, recipe: recipeHash(journal.state, recipe), machine, provider: 'host_a', termsHash: hash(journal.state.executionProviders.host_a)
  }, `Start ${recipe} on owned machine ${machine}`);
  let seq = 0;
  const mine = (raw, n) => { for (let i = 0; i < n; i++) { start('raw_' + seq++, 'mine_' + raw, 'alice_extractor'); tick(1); } };
  capture('Version 2 genesis: four funded bootstrap machines', 'Their embodied materials are deducted from the reserve. These are explicit test allocations, not blueprint-copy rewards.');
  act('alice', 'publishRecipe', { recipe: plaqueRecipe() }, 'Publish a human-readable workshop plaque recipe');
  capture('Copyable knowledge, scarce execution', 'Publishing the definition changes no balances, inventory, machine ownership or capacity.');
  mine('ore', 4); mine('wood', 2);
  start('alice_forge', 'forge', 'alice_workbench');
  try { start('double_booking', 'forge', 'alice_workbench'); } catch (e) { capture('Same machine cannot be booked twice', e.code); }
  tick(2);
  capture('A manufactured forge becomes a productive asset', 'Four ore and two wood remain embodied in the forge. It provides one job slot, not an unlimited right to host CPU.');
  mine('ore', 3); mine('wood', 2);
  start('sword_1', 'sword', 'alice_forge'); start('plaque_1', 'plaque', 'alice_workbench');
  try { start('overload', 'mine_ore', 'alice_extractor'); } catch (e) { capture('Provider capacity also has a limit', e.code + ': two execution slots are already reserved.'); }
  tick(2); tick(1);
  act('alice', 'offer', { id: 'sword_sale', asset: 'sword_1', price: 1_000, until: 100 }, 'Offer the manufactured sword');
  act('bob', 'buy', { offer: 'sword_sale', termsHash: hash(journal.state.offers.sword_sale) }, 'Atomic sale: 980 to seller, 20 to the public fund');
  act('alice', 'dismantle', { asset: 'plaque_1' }, 'Dismantle the plaque: recover its materials, not money');
  capture('Capacity and ownership remain separate from recipe copies', 'The forge is still owned by Alice. Bob owns the sword. The retired plaque cannot be resurrected from an old backup.');
  return { journal, report: { id: 'machinery', title: 'Build the machines that build',
    question: 'Can inspectable recipes create productive machines without duplicating inputs, capacity or money?', frames, modelCalls: 0,
    findings: ['Recipes are strict, human-readable data; no contributed code is executed.',
      'One principal can operate different machines concurrently. Controllers share, rather than duplicate, owned capacity.',
      'Providers have separately bounded execution slots and explicit per-tick prices.',
      'Production and dismantling preserve money and raw-material totals.',
      'This is rules v2; the six original v1 traces retain their original checkpoints.',
      'The buyer and prices are scripted assumptions. This does not demonstrate demand or independent validation.'] } };
}
