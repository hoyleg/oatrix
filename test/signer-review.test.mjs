/** Regressions for the PR #8 independent review. Run on the original candidate first. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createPublicKey, createSecretKey, generateKeyPairSync } from 'node:crypto';
import { Journal } from '../src/journal.mjs';
import { industrialGenesis, workMandateGenesis } from '../src/industrial-genesis.mjs';
import { fixtureKey, command, publicKey, signPayload } from '../src/identity.mjs';
import { PortableSigner, restorePortableSigner } from '../src/local-signer.mjs';
import { Gateway } from '../src/gateway.mjs';
import { hash } from '../src/canonical.mjs';
import { transition } from '../src/world.mjs';
function lab(genesis = industrialGenesis()) {
  const journal = new Journal(genesis), signer = new PortableSigner({ principal: 'alice', world: genesis.world,
    privateKey: fixtureKey('alice'), audiences: ['http://127.0.0.1:8787'], now: () => 1000 });
  const snapshot = () => ({ head: journal.head, state: journal.state });
  const sign = () => { const s = snapshot(); return signer.signIntent(s, { action: 'transfer', args: { to: 'bob', amount: 7 }, expectedHead: s.head, expiresIn: 20 }); };
  return { journal, signer, snapshot, sign };
}
test('review: reject non-private, non-Ed25519 and duck-typed keys at construction', () => {
  const rsa = generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey;
  const values = [null, {}, { type: 'private', asymmetricKeyType: 'ed25519' }, createPublicKey(fixtureKey('alice')), rsa, createSecretKey(Buffer.alloc(32))];
  for (const key of values) assert.throws(() => new PortableSigner({ principal: 'alice', world: 'oatrix-lab-v2', privateKey: key, audiences: ['http://127.0.0.1:8787'] }), /BAD_PRIVATE_KEY/);
});
test('review: an unrelated accepted action invalidates a reviewed-head approval without spending its nonce', () => {
  const l = lab(), signed = l.sign();
  l.journal.submit(command(l.journal.state, 'bob', 'transfer', { to: 'founder', amount: 1 }, fixtureKey('bob')));
  const before = l.journal.export();
  assert.throws(() => l.journal.submit(signed), /HEAD_CHANGED/);
  assert.deepEqual(l.journal.export(), before);
  l.journal.submit(l.sign()); assert.equal(l.journal.state.balances.bob, 10006);
});
test('pinned envelopes bind head and state under a distinct signature domain', () => {
  const l = lab(), e = l.sign();
  assert.equal(e.body.v, 2); assert.equal(e.body.expectedHead, l.journal.head); assert.equal(e.body.expectedStateHash, hash(l.journal.state));
  const state = l.journal.state, exported = l.journal.export();
  assert.throws(() => transition(state, e), /HEAD_CONTEXT_REQUIRED/);
  assert.deepEqual(transition(state, e, l.journal.head).state.balances.bob, 10007);
  for (const mutate of [
    x => { x.body.expectedHead = 'a'.repeat(64); }, x => { x.body.expectedStateHash = 'b'.repeat(64); },
    x => { delete x.body.expectedHead; }, x => { delete x.body.expectedStateHash; },
    x => { x.body.v = 1; delete x.body.expectedHead; delete x.body.expectedStateHash; },
    x => { x.body.v = 1; }, x => { x.body.v = 999; }
  ]) {
    const bad = structuredClone(e); mutate(bad); assert.throws(() => l.journal.submit(bad));
    assert.deepEqual(l.journal.export(), exported);
  }
  const wrongDomain = structuredClone(e); wrongDomain.signature = signPayload('OATRIX-COMMAND-1', wrongDomain.body, fixtureKey('alice'));
  assert.throws(() => l.journal.submit(wrongDomain), /BAD_SIGNATURE/);
  const legacy = command(state, 'alice', 'transfer', { to: 'bob', amount: 7 }, fixtureKey('alice'));
  legacy.signature = signPayload('OATRIX-COMMAND-2', legacy.body, fixtureKey('alice'));
  assert.throws(() => l.journal.submit(legacy), /BAD_SIGNATURE/);
  l.journal.submit(e); assert.equal(l.journal.state.balances.bob, 10007);
});
test('a fabricated snapshot retaining the correct head cannot substitute reviewed state', () => {
  const l = lab(), snapshot = l.snapshot(); snapshot.state.balances.alice += 1;
  const e = l.signer.signIntent(snapshot, { action: 'transfer', args: { to: 'bob', amount: 7 }, expectedHead: snapshot.head, expiresIn: 20 });
  const before = l.journal.export(); assert.throws(() => l.journal.submit(e), /STATE_CHANGED/); assert.deepEqual(l.journal.export(), before);
});
test('a gateway cannot rebase an already approved envelope by updating its public pins', () => {
  const l = lab(), e = l.sign();
  l.journal.submit(command(l.journal.state, 'bob', 'transfer', { to: 'founder', amount: 1 }, fixtureKey('bob')));
  e.body.expectedHead = l.journal.head; e.body.expectedStateHash = hash(l.journal.state);
  assert.throws(() => l.journal.submit(e), /BAD_SIGNATURE/);
});
test('mixed old and pinned envelopes replay exactly, including explicit work-rules v3', () => {
  for (const genesis of [industrialGenesis(), workMandateGenesis()]) {
    const l = lab(genesis); l.journal.submit(l.sign());
    l.journal.submit(command(l.journal.state, 'bob', 'transfer', { to: 'founder', amount: 1 }, fixtureKey('bob')));
    l.journal.submit(l.sign());
    const b = l.journal.export(); assert.deepEqual(Journal.restore(b, l.journal.genesisHash, l.journal.head).export(), b);
    const corrupted = structuredClone(b); corrupted.events[0].envelope.body.expectedHead = 'f'.repeat(64);
    assert.throws(() => Journal.restore(corrupted, l.journal.genesisHash, l.journal.head), /HEAD_CHANGED/);
  }
});
test('competing pinned approvals commit once; retrying either cannot duplicate a debit', () => {
  const l = lab(), e = l.sign(), rival = l.sign(); l.journal.submit(e);
  const after = l.journal.export();
  assert.throws(() => l.journal.submit(rival), /HEAD_CHANGED/); assert.throws(() => l.journal.submit(e), /HEAD_CHANGED/);
  assert.deepEqual(l.journal.export(), after);
});
test('legacy v1 is explicitly unpinned, not silently upgraded or removed', () => {
  const l = lab(), e = command(l.journal.state, 'alice', 'transfer', { to: 'bob', amount: 1 }, fixtureKey('alice'));
  l.journal.submit(command(l.journal.state, 'bob', 'transfer', { to: 'founder', amount: 1 }, fixtureKey('bob')));
  l.journal.submit(e); assert.equal(l.journal.state.balances.bob, 10000);
});
test('a stale login may be signed locally but current gateway state rejects it', () => {
  const l = lab(), gateway = new Gateway(l.journal, 'http://127.0.0.1:8787', () => 1000);
  const old = gateway.challenge('alice');
  l.journal.submit(command(l.journal.state, 'alice', 'rotateKey', { publicKey: publicKey(fixtureKey('new_root')) }, fixtureKey('alice')));
  assert.equal(typeof l.signer.signLogin(old), 'string');
  assert.throws(() => gateway.login(old, l.signer.signLogin(old)), /STALE_LOGIN/);
  const fresh = gateway.challenge('alice'); assert.throws(() => gateway.login(fresh, l.signer.signLogin(fresh)), /BAD_SIGNATURE/);
});
test('vault rejects ciphertext, GCM tag, salt and IV tampering', () => {
  const l = lab(), password = 'correct horse battery staple', vault = l.signer.seal(password);
  for (const field of ['ciphertext', 'tag', 'salt', 'iv']) {
    const b = structuredClone(vault), raw = Buffer.from(b[field], 'base64url'); raw[0] ^= 1; b[field] = raw.toString('base64url');
    assert.throws(() => restorePortableSigner(b, password, { audiences: ['https://example.test'] }), /VAULT_DECRYPT/, field);
  }
});
test('vault rejects unsupported versions, KDF amplification and oversized encodings before decryption', () => {
  const l = lab(), password = 'correct horse battery staple', vault = l.signer.seal(password);
  for (const [mutate, code] of [
    [v => { v.v = 2; }, /VAULT_VERSION/], [v => { v.kdf.N *= 64; }, /VAULT_KDF/],
    [v => { v.ciphertext = 'A'.repeat(5463); }, /BAD_VAULT/], [v => { v.tag += '='; }, /BAD_VAULT/]
  ]) { const v = structuredClone(vault); mutate(v); assert.throws(() => restorePortableSigner(v, password, { audiences: ['https://example.test'] }), code); }
});
test('non-loopback HTTP, non-origin audiences and duplicate audiences fail closed', () => {
  for (const audiences of [['http://example.test'], ['https://example.test/path'], ['https://example.test', 'https://example.test'], ['http://127.0.0.1.evil.test']]) {
    assert.throws(() => new PortableSigner({ principal: 'alice', world: 'oatrix-lab-v2', privateKey: fixtureKey('alice'), audiences }));
  }
});
