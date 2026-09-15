import test from 'node:test';
import assert from 'node:assert/strict';
import { createCipheriv, randomBytes } from 'node:crypto';
import { Journal } from '../src/journal.mjs';
import { industrialGenesis } from '../src/industrial-genesis.mjs';
import { fixtureKey, command, publicKey, signPayload } from '../src/identity.mjs';
import { ContentStore } from '../src/storage.mjs';
import { hash, hashBytes } from '../src/canonical.mjs';
import { PACK_LIMITS, sealAssetPack, openAssetPack, approvePackRestore, restoreAssetPack } from '../src/asset-packs.mjs';
const destination = 'replacement_store';
function rig() {
  const j = new Journal(industrialGenesis()), store = new ContentStore();
  store.put(Buffer.from('Oatrix bootstrap workbench\n')); store.put(Buffer.from('Oatrix bootstrap extractor\n'));
  const act = (principal, action, args) => j.submit(command(j.state, principal, action, args, fixtureKey(principal)));
  const seal = (ids = ['alice_workbench']) => sealAssetPack({ head: j.head, state: j.state }, 'alice', ids, store);
  const approval = (p, principal = 'alice') => approvePackRestore(j, principal, p.id, destination, fixtureKey(principal));
  const restore = (p, a = approval(p)) => restoreAssetPack(p.pack, p.key, j, a, destination);
  return { j, store, act, seal, approval, restore };
}
function forge(payload, key = randomBytes(32)) {
  const magic = Buffer.from('OATPACK1'), iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', key, iv, { authTagLength: 16 });
  cipher.setAAD(magic); const encrypted = Buffer.concat([cipher.update(Buffer.from(JSON.stringify(payload))), cipher.final()]);
  const pack = Buffer.concat([magic, iv, cipher.getAuthTag(), encrypted]); return { pack, key, id: hashBytes(pack) };
}
function rejectsWithoutLedgerChange(l, fn, code) { const before = l.j.export(); assert.throws(fn, code); assert.deepEqual(l.j.export(), before); }

test('encrypted pack round trip restores bytes without changing any ledger field', () => {
  const l = rig(), p = l.seal(['alice_workbench', 'alice_extractor']), before = l.j.export();
  assert.equal(p.id, hashBytes(p.pack)); assert.equal(p.key.length, 32);
  for (const text of ['alice_workbench', 'oatrix-lab-v2', 'Oatrix bootstrap']) assert.equal(p.pack.includes(Buffer.from(text)), false);
  const r = l.restore(p); assert.deepEqual(l.j.export(), before); assert.equal(r.receipt.ledgerChanged, false);
  assert.deepEqual(r.store.read(l.j.state.assets.alice_workbench.content), l.store.read(l.j.state.assets.alice_workbench.content));
  assert.equal(r.receipt.uniqueBlobs, 2);
});
test('repeated encryption uses independent keys and ciphertext; repeated restore is bytes-only', () => {
  const l = rig(), a = l.seal(), b = l.seal(); assert.notEqual(a.id, b.id); assert.ok(!a.key.equals(b.key));
  assert.deepEqual(openAssetPack(a.pack, a.key), openAssetPack(b.pack, b.key));
  const receipt = l.restore(a).receipt; assert.deepEqual(l.restore(a).receipt, receipt);
});
test('same-content assets deduplicate blobs without duplicating ownership or capacity', () => {
  const l = rig(); l.act('bob', 'offer', { id: 'sale', asset: 'bob_workbench', price: 1, until: 10 });
  l.act('alice', 'buy', { offer: 'sale', termsHash: hash(l.j.state.offers.sale) });
  const p = l.seal(['bob_workbench', 'alice_workbench']), r = l.restore(p);
  assert.equal(r.receipt.assetIds.length, 2); assert.equal(r.receipt.uniqueBlobs, 1);
  assert.equal(r.receipt.uniqueBytes, Buffer.byteLength('Oatrix bootstrap workbench\n'));
});
test('an expired lease and occupied successor are untouched by cold restore; freehold persists', () => {
  const l = rig();
  l.act('alice', 'deploy', { asset: 'alice_workbench', slot: 'commons_a', term: 1, termsHash: hash(l.j.state.slots.commons_a) });
  l.act('alice', 'deploy', { asset: 'alice_extractor', slot: 'alice_freehold', term: 0, termsHash: hash(l.j.state.slots.alice_freehold) });
  const p = l.seal(['alice_workbench', 'alice_extractor']); l.act('founder', 'advance', { ticks: 1 });
  l.act('bob', 'deploy', { asset: 'bob_workbench', slot: 'commons_a', term: 10, termsHash: hash(l.j.state.slots.commons_a) });
  const before = l.j.export(); l.restore(p); assert.deepEqual(l.j.export(), before);
  assert.equal(l.j.state.occupancy.commons_a.owner, 'bob'); assert.equal(l.j.state.assets.alice_workbench.deployed, null);
  assert.equal(l.j.state.assets.alice_extractor.deployed, 'alice_freehold');
});
test('seller retains decryptable bytes but cannot restore sold ownership; buyer needs key and own approval', () => {
  const l = rig(), p = l.seal(); l.act('alice', 'offer', { id: 'sale', asset: 'alice_workbench', price: 20, until: 10 });
  l.act('bob', 'buy', { offer: 'sale', termsHash: hash(l.j.state.offers.sale) });
  assert.equal(openAssetPack(p.pack, p.key).assets[0].id, 'alice_workbench');
  rejectsWithoutLedgerChange(l, () => l.restore(p), /NOT_CURRENT_OWNER/);
  const before = l.j.export(), restored = l.restore(p, l.approval(p, 'bob'));
  assert.equal(restored.receipt.principal, 'bob'); assert.deepEqual(l.j.export(), before);
});
test('retired assets cannot be resurrected and a mixed invalid pack has no partial activation', () => {
  const l = rig(), p = l.seal(['alice_workbench', 'alice_extractor']);
  l.act('alice', 'dismantle', { asset: 'alice_extractor' });
  rejectsWithoutLedgerChange(l, () => l.restore(p), /NOT_CURRENT_OWNER/);
  assert.ok(l.j.state.retiredAssets.alice_extractor); assert.equal(l.j.state.assets.alice_extractor, undefined);
});
test('content version, world and signature domain are checked independently', () => {
  const l = rig(), p = l.seal(), payload = openAssetPack(p.pack, p.key);
  const changed = structuredClone(payload), bytes = Buffer.from('not the authorised representation');
  changed.assets[0].content = hashBytes(bytes); changed.blobs = [{ hash: hashBytes(bytes), bytes: bytes.toString('base64') }];
  rejectsWithoutLedgerChange(l, () => l.restore(forge(changed)), /CONTENT_VERSION_CHANGED/);
  const wrongWorld = structuredClone(payload); wrongWorld.world = 'another-world';
  rejectsWithoutLedgerChange(l, () => l.restore(forge(wrongWorld)), /WRONG_WORLD/);
  const a = l.approval(p); a.signature = signPayload('OATRIX-COMMAND-1', a.body, fixtureKey('alice'));
  rejectsWithoutLedgerChange(l, () => l.restore(p, a), /RESTORE_SIGNATURE/);
});
test('fresh restore consent pins current head, ciphertext and chosen destination', () => {
  const l = rig(), p = l.seal(), a = l.approval(p);
  for (const mutate of [x => { x.body.destination = 'attacker_store'; }, x => { x.body.pack = 'f'.repeat(64); }, x => { x.body.principal = 'bob'; }]) {
    const bad = structuredClone(a); mutate(bad); rejectsWithoutLedgerChange(l, () => l.restore(p, bad), /RESTORE_TARGET|RESTORE_SIGNATURE/);
  }
  l.act('bob', 'transfer', { to: 'founder', amount: 1 });
  rejectsWithoutLedgerChange(l, () => l.restore(p, a), /RESTORE_HEAD/);
  l.restore(p); // The old *backup* is valid; the old *approval* is not.
});
test('root rotation requires a new approval but does not destroy independently retained pack keys', () => {
  const l = rig(), p = l.seal(), next = fixtureKey('alice_next');
  l.act('alice', 'rotateKey', { publicKey: publicKey(next) });
  assert.throws(() => l.approval(p), /RESTORE_SIGNATURE/);
  const a = approvePackRestore(l.j, 'alice', p.id, destination, next); l.restore(p, a);
  assert.equal(l.j.state.identities.alice.epoch, 2);
});
test('wrong or lost keys and authentication failures release no restored store', () => {
  const l = rig(), p = l.seal();
  for (const key of [null, Buffer.alloc(31), Buffer.alloc(33)]) assert.throws(() => openAssetPack(p.pack, key), /PACK_KEY/);
  assert.throws(() => openAssetPack(p.pack, randomBytes(32)), /PACK_DECRYPT/);
  for (const offset of [8, 20, 36, p.pack.length - 1]) {
    const bytes = Buffer.from(p.pack); bytes[offset] ^= 1; assert.throws(() => openAssetPack(bytes, p.key), /PACK_DECRYPT/);
  }
  const wrong = Buffer.from(p.pack); wrong[7] = 0x32; assert.throws(() => openAssetPack(wrong, p.key), /PACK_VERSION/);
  assert.throws(() => openAssetPack(p.pack.subarray(0, 36), p.key), /PACK_SIZE/);
  assert.throws(() => openAssetPack(Buffer.alloc(PACK_LIMITS.packBytes + 1), p.key), /PACK_SIZE/);
});
test('malicious authenticated manifests reject extra authority, duplicate/missing blobs and unsafe IDs', () => {
  const l = rig(), p = l.seal(), original = openAssetPack(p.pack, p.key);
  for (const mutate of [
    x => { x.balances = { alice: 99999 }; }, x => { x.v = 2; }, x => { x.assets.push(x.assets[0]); },
    x => { x.blobs.push(x.blobs[0]); }, x => { x.blobs = []; }, x => { x.assets[0].id = '../escape'; },
    x => { x.blobs[0].bytes = 'not base64!'; }, x => { x.assets[0].owner = 'alice'; },
    x => { x.assets[0].content = 'a'.repeat(64); }, x => { x.sourceHead = 'not-a-digest'; }
  ]) { const data = structuredClone(original); mutate(data); const invalid = forge(data); assert.throws(() => openAssetPack(invalid.pack, invalid.key)); }
});
test('binary, empty and maximum-size content work without compression or filesystem path extraction', () => {
  for (const bytes of [Buffer.alloc(0), Buffer.from([0, 255, 128, 13]), Buffer.alloc(1_000_000, 7)]) {
    const l = rig(), s = l.j.state, content = l.store.put(bytes); s.assets.alice_workbench.content = content;
    const j = new Journal(s), p = sealAssetPack({ head: j.head, state: j.state }, 'alice', ['alice_workbench'], l.store);
    const a = approvePackRestore(j, 'alice', p.id, destination, fixtureKey('alice'));
    assert.deepEqual(restoreAssetPack(p.pack, p.key, j, a, destination).store.read(content), bytes);
  }
});
test('batch size, source ownership and total unique bytes have explicit limits', () => {
  const l = rig(); for (const ids of [[], ['alice_workbench', 'alice_workbench'], ['bob_workbench'], ['../x'], Array(33).fill('alice_workbench')]) assert.throws(() => l.seal(ids));
  const assets = [], blobs = [];
  for (let i = 0; i < 9; i++) {
    const bytes = Buffer.alloc(1_000_000, i), id = hashBytes(bytes);
    assets.push({ id: 'a' + i, content: id }); blobs.push({ hash: id, bytes: bytes.toString('base64') });
  }
  // Nine full blobs exceed the encoded-frame cap or the decoded unique-byte budget.
  const oversized = forge({ v: 1, world: l.j.state.world, sourceHead: l.j.head, assets, blobs });
  assert.throws(() => openAssetPack(oversized.pack, oversized.key), /PACK_SIZE|PACK_TOTAL_SIZE/);
});
