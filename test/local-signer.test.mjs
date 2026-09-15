import test from 'node:test';
import assert from 'node:assert/strict';
import { Journal } from '../src/journal.mjs';
import { industrialGenesis } from '../src/industrial-genesis.mjs';
import { fixtureKey, publicKey, verifyPayload } from '../src/identity.mjs';
import { PortableSigner, restorePortableSigner } from '../src/local-signer.mjs';

const world = 'oatrix-lab-v2';
function lab() {
  const journal = new Journal(industrialGenesis());
  const signer = new PortableSigner({ principal: 'alice', world, privateKey: fixtureKey('alice'),
    audiences: ['http://127.0.0.1:8787', 'http://127.0.0.1:8788'], now: () => 1_000 });
  return { journal, signer };
}

test('portable signer descriptor exposes no private key material', () => {
  const { signer } = lab(), d = signer.descriptor();
  assert.deepEqual(Object.keys(d).sort(), ['audiences', 'principal', 'publicKey', 'v', 'world']);
  assert.equal(d.publicKey, publicKey(fixtureKey('alice'))); assert.equal(JSON.stringify(d).includes('PRIVATE'), false);
});

test('login signature is bound to identity and an explicitly allowed host origin', () => {
  const { signer } = lab();
  const challenge = { v: 1, world, audience: 'http://127.0.0.1:8787', principal: 'alice', epoch: 1, nonce: 'abc', expiresAt: 61_000 };
  const signature = signer.signLogin(challenge);
  assert.equal(verifyPayload('OATRIX-LOGIN-1', challenge, signature, signer.publicKey), true);
  assert.throws(() => signer.signLogin({ ...challenge, audience: 'https://evil.example' }), /AUDIENCE_NOT_ALLOWED/);
  assert.throws(() => signer.signLogin({ ...challenge, principal: 'bob' }), /LOGIN_IDENTITY/);
  assert.throws(() => signer.signLogin({ ...challenge, expiresAt: 999 }), /LOGIN_EXPIRES/);
});

test('signIntent pins principal, action, destination, amount and exact observed head', () => {
  const { journal, signer } = lab(); const snapshot = { head: journal.head, state: journal.state };
  const envelope = signer.signIntent(snapshot, { action: 'transfer', args: { to: 'bob', amount: 25 }, expectedHead: journal.head, expiresIn: 20 });
  assert.equal(envelope.body.principal, 'alice'); assert.equal(envelope.body.controller, 'root');
  assert.deepEqual(envelope.body.args, { to: 'bob', amount: 25 });
  const changed = structuredClone(envelope); changed.body.args.to = 'founder';
  assert.throws(() => journal.submit(changed), /BAD_SIGNATURE/); assert.equal(journal.state.balances.bob, 10_000);
  journal.submit(envelope); assert.equal(journal.state.balances.bob, 10_025);
  assert.throws(() => signer.signIntent(snapshot, { action: 'transfer', args: { to: 'bob', amount: 1 }, expectedHead: journal.head, expiresIn: 20 }), /HEAD_CHANGED/);
});

test('signer uses local protocol vocabulary and rejects malformed intent before signing', () => {
  const { journal, signer } = lab(); const snapshot = { head: journal.head, state: journal.state };
  assert.throws(() => signer.signIntent(snapshot, { action: 'transfer', args: { to: 'bob', amount: 1, injected: 1 }, expectedHead: journal.head, expiresIn: 10 }), /BAD_FIELDS/);
  assert.throws(() => signer.signIntent(snapshot, { action: 'inventLaw', args: {}, expectedHead: journal.head, expiresIn: 10 }), /UNKNOWN_ACTION/);
});

test('sealed recovery restores the same principal/key and tampering or wrong passphrase fails', () => {
  const { journal, signer } = lab(); const vault = signer.seal('correct horse battery staple');
  const restored = restorePortableSigner(vault, 'correct horse battery staple', { audiences: ['http://127.0.0.1:8788'], now: () => 1_000 });
  assert.equal(restored.principal, 'alice'); assert.equal(restored.publicKey, signer.publicKey);
  const snapshot = { head: journal.head, state: journal.state };
  journal.submit(restored.signIntent(snapshot, { action: 'transfer', args: { to: 'bob', amount: 2 }, expectedHead: journal.head, expiresIn: 10 }));
  assert.equal(journal.state.balances.bob, 10_002);
  assert.throws(() => restorePortableSigner(vault, 'incorrect password here', { audiences: ['http://127.0.0.1:8788'] }), /VAULT_DECRYPT/);
  const tampered = structuredClone(vault); tampered.principal = 'bob';
  assert.throws(() => restorePortableSigner(tampered, 'correct horse battery staple', { audiences: ['http://127.0.0.1:8788'] }), /VAULT_DECRYPT/);
});

test('root rotation preserves principal but makes an old recovered vault stale', () => {
  const { journal, signer } = lab(); const vault = signer.seal('correct horse battery staple');
  const before = { head: journal.head, state: journal.state }, nextKey = fixtureKey('alice_rotated');
  journal.submit(signer.signIntent(before, { action: 'rotateKey', args: { publicKey: publicKey(nextKey) }, expectedHead: before.head, expiresIn: 10 }));
  const old = restorePortableSigner(vault, 'correct horse battery staple', { audiences: ['http://127.0.0.1:8787'], now: () => 1_000 });
  assert.throws(() => old.signIntent({ head: journal.head, state: journal.state }, { action: 'transfer', args: { to: 'bob', amount: 1 }, expectedHead: journal.head, expiresIn: 10 }), /SIGNER_NOT_CURRENT/);
  const fresh = new PortableSigner({ principal: 'alice', world, privateKey: nextKey, audiences: ['http://127.0.0.1:8787'], now: () => 1_000 });
  journal.submit(fresh.signIntent({ head: journal.head, state: journal.state }, { action: 'transfer', args: { to: 'bob', amount: 1 }, expectedHead: journal.head, expiresIn: 10 }));
  assert.equal(journal.state.balances.bob, 10_001);
});
