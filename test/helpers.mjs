import { hash } from '../src/canonical.mjs';
import { Journal } from '../src/journal.mjs';
import { labGenesis } from '../src/genesis.mjs';
import { command, fixtureKey } from '../src/identity.mjs';
export function lab() {
  const journal = new Journal(labGenesis());
  const act = (principal, action, args, key = fixtureKey(principal), options = {}) => {
    if (action === 'startJob') { const provider = args.provider ?? 'host_a'; args = { provider, termsHash: hash(journal.state.executionProviders[provider]), ...args }; }
    return journal.submit(command(journal.state, principal, action, args, key, options));
  };
  const tick = (ticks = 1) => act('founder', 'advance', { ticks });
  const sword = (owner = 'alice', id = 'sword_1') => {
    for (const [i, recipe] of ['mine_ore', 'mine_ore', 'mine_wood'].entries()) {
      act(owner, 'startJob', { id: id + '_raw_' + i, recipe }); tick();
    }
    act(owner, 'startJob', { id, recipe: 'sword' }); tick(3); return id;
  };
  return { journal, act, tick, sword };
}
