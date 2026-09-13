import { hash, clone } from './canonical.mjs';
import { fixtureKey, publicKey } from './identity.mjs';
export const LAB_PEOPLE = ['founder', 'alice', 'bob', 'host_a', 'host_b', 'reviewer'];
export const SWORD_CONTENT = Buffer.from('Oatrix lab sword: two ore units, one wood unit. Inspectable placeholder geometry.\n');
export function labGenesis() {
  const identities = Object.fromEntries(LAB_PEOPLE.map(id => [id, {
    publicKey: publicKey(fixtureKey(id)), epoch: 1, delegates: {}, nextDelegateEpoch: 1
  }]));
  const slots = {
    commons_a: { owner: 'treasury', tenure: 'lease', rate: 10, maxTerm: 20, policy: 'lab-lease-v1' },
    commons_b: { owner: 'treasury', tenure: 'lease', rate: 8, maxTerm: 20, policy: 'lab-lease-v1' },
    alice_freehold: { owner: 'alice', tenure: 'freehold', rate: 0, maxTerm: 0, policy: 'lab-freehold-v1' }
  };
  return {
    v: 1, world: 'oatrix-lab-v1', founder: 'founder', reviewers: ['reviewer'],
    tick: 0, paused: false, retired: false,
    identities, nonces: {}, balances: { treasury: 100_000, founder: 0, alice: 10_000, bob: 10_000, host_a: 0, host_b: 0, reviewer: 0 },
    supply: 120_000, levyBps: 200, levyRemainders: {}, rawTotal: { ore: 1_000, wood: 1_000 }, reserve: { ore: 1_000, wood: 1_000 },
    inventory: Object.fromEntries(LAB_PEOPLE.map(id => [id, { ore: 0, wood: 0 }])),
    executionProviders: { host_a: { mine_ore: 1, mine_wood: 1, sword: 5 }, host_b: { mine_ore: 2, mine_wood: 2, sword: 4 } },
    slots, occupancy: {}, assets: {}, jobs: {}, offers: {}, services: {}, releases: {}, emergencyLog: []
  };
}
export function slotTerms(state, slot) { return hash(clone(state.slots[slot])); }
