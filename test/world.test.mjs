import test from 'node:test';
import assert from 'node:assert/strict';
import { lab } from './helpers.mjs';
import { hash, canonical } from '../src/canonical.mjs';
import { command, fixtureKey, publicKey, signPayload } from '../src/identity.mjs';
import { slotTerms } from '../src/genesis.mjs';
import { assertInvariants } from '../src/world.mjs';

function fails(l, code, fn) {
  const before = l.journal.head, snapshot = hash(l.journal.state);
  assert.throws(fn, { code }); assert.equal(l.journal.head, before); assert.equal(hash(l.journal.state), snapshot);
}
function delegate(l, actions = ['transfer', 'startJob'], budget = 100) {
  l.act('alice', 'delegate', { id: 'worker', publicKey: publicKey(fixtureKey('worker')), actions, budget, until: 100 });
}
function service(l, budget = 100, until = 10) {
  l.act('alice', 'openService', { id: 'inference', provider: 'host_b', budget, until, termsHash: hash('fixed service terms') });
}
function receipt(l, request = 'request_1', amount = 100) {
  const r = { world: l.journal.state.world, service: 'inference', request, amount,
    termsHash: hash('fixed service terms'), outputHash: hash('an accepted result') };
  return { receipt: r, providerSignature: signPayload('OATRIX-SERVICE-1', r, fixtureKey('host_b')) };
}

test('production transforms raw inputs into an indivisible product, never money', () => {
  const l = lab(); l.sword(); const s = l.journal.state;
  assert.deepEqual(s.inventory.alice, { ore: 0, wood: 0 });
  assert.deepEqual(s.assets.sword_1.embodied, { ore: 2, wood: 1 });
  assert.equal(s.supply, 120_000); assert.equal(s.balances.alice, 9_992); assertInvariants(s);
});
test('jobs finish on logical time, not number of submitted actions', () => {
  const l = lab(); l.act('alice', 'startJob', { id: 'ore_1', recipe: 'mine_ore' });
  for (let i = 0; i < 20; i++) l.act('bob', 'transfer', { to: 'alice', amount: 1 });
  assert.equal(l.journal.state.inventory.alice.ore, 0); l.tick(); assert.equal(l.journal.state.inventory.alice.ore, 1);
});
test('multiple controllers do not multiply the principal capacity quota', () => {
  const l = lab(); delegate(l); l.act('alice', 'startJob', { id: 'ore_1', recipe: 'mine_ore' });
  fails(l, 'CAPACITY_BUSY', () => l.act('alice', 'startJob', { id: 'ore_2', recipe: 'mine_ore' }, fixtureKey('worker'), { controller: 'worker' }));
});
test('insufficient input failure does not debit fees or consume the nonce', () => {
  const l = lab(); fails(l, 'MISSING_INPUTS', () => l.act('alice', 'startJob', { id: 'sword_1', recipe: 'sword' }));
});
test('negative, fractional and overflowing money are rejected atomically', () => {
  for (const amount of [-1, 0, 0.5, Number.MAX_SAFE_INTEGER + 1]) {
    const l = lab(); assert.throws(() => l.act('alice', 'transfer', { to: 'bob', amount })); assert.equal(l.journal.events.length, 0);
  }
});
test('bad signatures do not authorise a transfer', () => {
  const l = lab(); fails(l, 'BAD_SIGNATURE', () => l.act('alice', 'transfer', { to: 'bob', amount: 1 }, fixtureKey('bob')));
});
test('a signature cannot be replayed on another world', () => {
  const l = lab(); const e = command(l.journal.state, 'alice', 'transfer', { to: 'bob', amount: 1 }, fixtureKey('alice'), { world: 'other-world' });
  fails(l, 'WRONG_WORLD', () => l.journal.submit(e));
});
test('replay and out-of-order nonces are rejected', () => {
  const l = lab(); const e = command(l.journal.state, 'alice', 'transfer', { to: 'bob', amount: 1 }, fixtureKey('alice'));
  l.journal.submit(e); fails(l, 'BAD_NONCE', () => l.journal.submit(e));
  fails(l, 'BAD_NONCE', () => l.act('alice', 'transfer', { to: 'bob', amount: 1 }, fixtureKey('alice'), { nonce: 50 }));
});
test('unknown fields and action coercion are rejected', () => {
  const l = lab(); fails(l, 'BAD_FIELDS', () => l.act('alice', 'transfer', { to: 'bob', amount: 1, administrative: true }));
  fails(l, 'UNKNOWN_ACTION', () => l.act('alice', ['transfer'], { to: 'bob', amount: 1 }));
});
test('prototype-bearing input, non JSON data and ambiguous numbers are refused', () => {
  for (const x of [JSON.parse('{"__proto__":{}}'), { constructor: 'bad' }, NaN, Infinity, -0, undefined, new Date(), [,]]) assert.throws(() => canonical(x));
});
test('expired instructions cannot be executed later', () => {
  const l = lab(); const e = command(l.journal.state, 'alice', 'transfer', { to: 'bob', amount: 1 }, fixtureKey('alice'), { expires: 0 });
  l.tick(); fails(l, 'EXPIRED_COMMAND', () => l.journal.submit(e));
});
test('delegates have action restrictions and a cumulative spending budget', () => {
  const l = lab(); delegate(l, ['transfer'], 10);
  l.act('alice', 'transfer', { to: 'bob', amount: 6 }, fixtureKey('worker'), { controller: 'worker' });
  fails(l, 'MANDATE_BUDGET', () => l.act('alice', 'transfer', { to: 'bob', amount: 5 }, fixtureKey('worker'), { controller: 'worker' }));
  fails(l, 'MANDATE_ACTION', () => l.act('alice', 'pause', { reason: 'Malicious inspection notice' }, fixtureKey('worker'), { controller: 'worker' }));
});
test('human takeover revokes queued agent instructions without rewinding commitments', () => {
  const l = lab(); delegate(l); const e = command(l.journal.state, 'alice', 'transfer', { to: 'bob', amount: 1 }, fixtureKey('worker'), { controller: 'worker' });
  l.act('alice', 'revoke', { id: 'worker' }); fails(l, 'NOT_FOUND', () => l.journal.submit(e));
  l.act('alice', 'transfer', { to: 'bob', amount: 2 }); assert.equal(l.journal.state.balances.bob, 10_002);
});
test('regranting a controller name does not revive old signed instructions', () => {
  const l = lab(); delegate(l); const e = command(l.journal.state, 'alice', 'transfer', { to: 'bob', amount: 1 }, fixtureKey('worker'), { controller: 'worker' });
  l.act('alice', 'revoke', { id: 'worker' }); delegate(l); fails(l, 'STALE_CONTROLLER', () => l.journal.submit(e));
});
test('root rotation preserves identity and holdings while invalidating old authority', () => {
  const l = lab(); delegate(l); const old = command(l.journal.state, 'alice', 'transfer', { to: 'bob', amount: 1 }, fixtureKey('alice'));
  l.act('alice', 'rotateKey', { publicKey: publicKey(fixtureKey('replacement')) });
  fails(l, 'STALE_CONTROLLER', () => l.journal.submit(old));
  l.act('alice', 'transfer', { to: 'bob', amount: 1 }, fixtureKey('replacement'));
  assert.deepEqual(l.journal.state.identities.alice.delegates, {});
});
test('lease expiry reclaims placement, not asset or freehold title', () => {
  const l = lab(); const id = l.sword();
  l.act('alice', 'deploy', { asset: id, slot: 'commons_a', term: 2, termsHash: slotTerms(l.journal.state, 'commons_a') });
  l.tick(2); const s = l.journal.state;
  assert.equal(s.assets[id].owner, 'alice'); assert.equal(s.assets[id].deployed, null);
  assert.equal(s.slots.alice_freehold.owner, 'alice'); assert.equal(s.occupancy.commons_a, undefined);
  l.act('alice', 'deploy', { asset: id, slot: 'commons_b', term: 2, termsHash: slotTerms(l.journal.state, 'commons_b') });
});
test('freehold placement is not silently rescinded for inactivity', () => {
  const l = lab(); const id = l.sword();
  l.act('alice', 'deploy', { asset: id, slot: 'alice_freehold', term: 0, termsHash: slotTerms(l.journal.state, 'alice_freehold') });
  l.tick(100); assert.equal(l.journal.state.assets[id].deployed, 'alice_freehold');
});
test('deployment cannot silently change agreed terms or duplicate an active location', () => {
  const l = lab(); const id = l.sword();
  fails(l, 'TERMS_CHANGED', () => l.act('alice', 'deploy', { asset: id, slot: 'commons_a', term: 1, termsHash: hash('other terms') }));
  l.act('alice', 'deploy', { asset: id, slot: 'commons_a', term: 1, termsHash: slotTerms(l.journal.state, 'commons_a') });
  fails(l, 'ASSET_BUSY', () => l.act('alice', 'deploy', { asset: id, slot: 'commons_b', term: 1, termsHash: slotTerms(l.journal.state, 'commons_b') }));
});
test('a host or founder cannot use normal commands to take someone else\'s property', () => {
  const l = lab(); const id = l.sword();
  for (const principal of ['host_a', 'founder']) fails(l, 'NOT_OWNER', () => l.act(principal, 'offer', { id: 'theft', asset: id, price: 1, until: 50 }));
});
test('atomic sale delivers an indivisible good and deducts a levy from consideration', () => {
  const l = lab(); const id = l.sword();
  l.act('alice', 'offer', { id: 'sale', asset: id, price: 1_000, until: 50 });
  const before = l.journal.state.balances.treasury;
  l.act('bob', 'buy', { offer: 'sale', termsHash: hash(l.journal.state.offers.sale) });
  assert.equal(l.journal.state.assets[id].owner, 'bob'); assert.equal(l.journal.state.balances.alice, 10_972);
  assert.equal(l.journal.state.balances.treasury - before, 20); assertInvariants(l.journal.state);
});
test('selling, deploying or buying the same locked asset twice is rejected', () => {
  const l = lab(); const id = l.sword(); l.act('alice', 'offer', { id: 'sale', asset: id, price: 1_000, until: 50 });
  fails(l, 'ASSET_BUSY', () => l.act('alice', 'offer', { id: 'sale2', asset: id, price: 1_000, until: 50 }));
  l.act('bob', 'buy', { offer: 'sale', termsHash: hash(l.journal.state.offers.sale) });
  fails(l, 'OFFER_CLOSED', () => l.act('alice', 'buy', { offer: 'sale', termsHash: hash(l.journal.state.offers.sale) }));
});
test('expiring an offer unlocks the asset without payment', () => {
  const l = lab(); const id = l.sword(); l.act('alice', 'offer', { id: 'sale', asset: id, price: 1_000, until: 7 });
  l.tick(); assert.equal(l.journal.state.assets[id].locked, null); assert.equal(l.journal.state.offers.sale.status, 'cancelled');
});
test('jointly authorised service receipts transfer funds without minting money', () => {
  const l = lab(); service(l); l.act('alice', 'settleService', receipt(l));
  assert.equal(l.journal.state.balances.host_b, 98); assert.equal(l.journal.state.balances.treasury, 100_002);
  assert.equal(l.journal.state.services.inference.remaining, 0); assertInvariants(l.journal.state);
});
test('forged service receipts, overbilling and replay are rejected', () => {
  const l = lab(); service(l, 200);
  fails(l, 'BAD_PROVIDER_SIGNATURE', () => l.act('alice', 'settleService', { ...receipt(l), providerSignature: 'a'.repeat(86) }));
  fails(l, 'ESCROW_LIMIT', () => l.act('alice', 'settleService', receipt(l, 'too_much', 201)));
  l.act('alice', 'settleService', receipt(l)); fails(l, 'RECEIPT_REPLAY', () => l.act('alice', 'settleService', receipt(l)));
});
test('receipt splitting cannot avoid fractional levies for the same payer', () => {
  const a = lab(), b = lab(); service(a); service(b); a.act('alice', 'settleService', receipt(a));
  for (let i = 0; i < 100; i++) b.act('alice', 'settleService', receipt(b, 'request_' + i, 1));
  assert.deepEqual(a.journal.state.balances, b.journal.state.balances);
});
test('unspent escrow is recoverable after deadline without provider cooperation', () => {
  const l = lab(); service(l); fails(l, 'REFUND_NOT_DUE', () => l.act('alice', 'refundService', { id: 'inference' }));
  l.tick(10); l.act('alice', 'refundService', { id: 'inference' }); assert.equal(l.journal.state.balances.alice, 10_000);
});
test('already acknowledged service payments are not refunded from unrelated balances', () => {
  const l = lab(); service(l); l.act('alice', 'settleService', receipt(l, 'accepted', 40)); l.tick(10);
  const provider = l.journal.state.balances.host_b, treasury = l.journal.state.balances.treasury;
  l.act('alice', 'refundService', { id: 'inference' }); assert.equal(l.journal.state.balances.alice, 9_960);
  assert.equal(l.journal.state.balances.host_b, provider); assert.equal(l.journal.state.balances.treasury, treasury);
});
test('founder pause is disclosed, blocks production and cannot seize assets', () => {
  const l = lab(); l.act('founder', 'pause', { reason: 'Investigating an invariant failure' });
  fails(l, 'WORLD_PAUSED', () => l.act('alice', 'startJob', { id: 'ore_1', recipe: 'mine_ore' }));
  l.act('founder', 'resume', { reason: 'Fix reviewed on a fresh test branch' });
  assert.equal(l.journal.state.emergencyLog.length, 2); l.tick();
});
test('other participants cannot exercise founder intervention', () => {
  const l = lab(); fails(l, 'FOUNDER_ONLY', () => l.act('alice', 'pause', { reason: 'I claim to be the government' }));
});
test('release receipts bind immutable manifests and require an independent reviewer', () => {
  const l = lab(), manifest = { source: hash('source'), artifact: hash('artifact'), tests: hash('tests'), migration: hash('none'), description: 'Private workspaces' };
  l.act('alice', 'proposeRelease', { id: 'release_1', manifest }); const manifestHash = hash(manifest);
  fails(l, 'INDEPENDENT_REVIEW_REQUIRED', () => l.act('founder', 'recordRelease', { id: 'release_1', manifestHash }));
  fails(l, 'INDEPENDENT_REVIEW_REQUIRED', () => l.act('alice', 'approveRelease', { id: 'release_1', manifestHash }));
  fails(l, 'MANIFEST_MISMATCH', () => l.act('reviewer', 'approveRelease', { id: 'release_1', manifestHash: hash('different') }));
  l.act('reviewer', 'approveRelease', { id: 'release_1', manifestHash });
  l.act('founder', 'recordRelease', { id: 'release_1', manifestHash }); assert.equal(l.journal.state.releases.release_1.status, 'recorded');
});
test('commission pays from the existing disclosed public fund', () => {
  const l = lab(); l.act('founder', 'commission', { to: 'alice', amount: 1_000, deliverable: hash('accepted adapter'), reason: 'Lab acceptance of a specified deliverable' });
  assert.equal(l.journal.state.balances.treasury, 99_000); assert.equal(l.journal.state.supply, 120_000);
});
test('retirement cannot be reversed through the protocol; bootstrap clock must first be replaced in a real handover', () => {
  const l = lab(); l.act('founder', 'retireFounder', { reason: 'Test irreversible retirement on a disposable state' });
  fails(l, 'FOUNDER_ONLY', () => l.act('founder', 'pause', { reason: 'Attempted return' }));
});
test('snapshots returned to callers cannot mutate the journal', () => {
  const l = lab(); l.journal.state.balances.alice = 0; assert.equal(l.journal.state.balances.alice, 10_000);
});
test('canonical encoding is independent of object insertion order', () => {
  assert.equal(hash({ b: 1, a: [2, 3] }), hash({ a: [2, 3], b: 1 }));
});
test('execution provider can be selected independently of identity and login host', () => {
  const l = lab(); l.act('alice', 'startJob', { id: 'other_provider', recipe: 'mine_ore', provider: 'host_b' });
  l.tick(); assert.equal(l.journal.state.inventory.alice.ore, 1);
  assert.equal(l.journal.state.balances.host_a, 0); assert.equal(l.journal.state.balances.host_b, 2);
});
test('an execution provider cannot silently change a signed price quote', () => {
  const l = lab(); fails(l, 'TERMS_CHANGED', () => l.act('alice', 'startJob', { id: 'mine', recipe: 'mine_ore', provider: 'host_b', termsHash: hash('old price') }));
});
