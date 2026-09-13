import test from 'node:test';
import assert from 'node:assert/strict';
import { lab } from './helpers.mjs';
import { command, fixtureKey, publicKey, signPayload } from '../src/identity.mjs';
import { Gateway } from '../src/gateway.mjs';
import { ContentStore } from '../src/storage.mjs';
import { EvidenceNotebook } from '../src/evidence.mjs';
import { Journal } from '../src/journal.mjs';
import { SWORD_CONTENT } from '../src/genesis.mjs';
import { hash, clone } from '../src/canonical.mjs';
function login(g, person = 'alice', key = fixtureKey(person)) {
  const c = g.challenge(person); return g.login(c, signPayload('OATRIX-LOGIN-1', c, key));
}
test('one principal can log in via two hosts and continue when the first disappears', () => {
  const l = lab(), a = new Gateway(l.journal, 'https://host-a.example'), b = new Gateway(l.journal, 'https://host-b.example');
  const first = login(a), second = login(b); assert.equal(first.principal, second.principal);
  a.close(); assert.throws(() => a.snapshot(), { code: 'HOST_OFFLINE' });
  b.submit(second.token, command(l.journal.state, 'alice', 'transfer', { to: 'bob', amount: 5 }, fixtureKey('alice')));
  assert.equal(l.journal.state.balances.bob, 10_005);
});
test('host-bound login assertions and tokens cannot be replayed to another host', () => {
  const l = lab(), a = new Gateway(l.journal, 'https://host-a.example'), b = new Gateway(l.journal, 'https://host-b.example');
  const c = a.challenge('alice'), sig = signPayload('OATRIX-LOGIN-1', c, fixtureKey('alice'));
  assert.throws(() => b.login(c, sig), { code: 'CHALLENGE_INVALID' });
  const session = a.login(c, sig); assert.throws(() => a.login(c, sig), { code: 'CHALLENGE_INVALID' });
  assert.throws(() => b.session(session.token), { code: 'SESSION_INVALID' });
});
test('a stolen login token cannot change another principal or forge economic instructions', () => {
  const l = lab(), g = new Gateway(l.journal, 'https://host-a.example'), s = login(g);
  assert.throws(() => g.submit(s.token, command(l.journal.state, 'bob', 'transfer', { to: 'alice', amount: 1 }, fixtureKey('bob'))), { code: 'SESSION_PRINCIPAL' });
  assert.throws(() => g.submit(s.token, command(l.journal.state, 'alice', 'transfer', { to: 'bob', amount: 1 }, fixtureKey('bob'))), { code: 'BAD_SIGNATURE' });
});
test('wall-clock challenge expiry is independent of paused simulation time', () => {
  const l = lab(); let now = 0; const g = new Gateway(l.journal, 'https://host-a.example', () => now), c = g.challenge('alice');
  now = 60_001; assert.throws(() => g.login(c, signPayload('OATRIX-LOGIN-1', c, fixtureKey('alice'))), { code: 'CHALLENGE_INVALID' });
});
test('key rotation invalidates sessions on every host', () => {
  const l = lab(), a = new Gateway(l.journal, 'https://host-a.example'), b = new Gateway(l.journal, 'https://host-b.example');
  const sa = login(a), sb = login(b); l.act('alice', 'rotateKey', { publicKey: publicKey(fixtureKey('replacement')) });
  assert.throws(() => a.session(sa.token), { code: 'SESSION_INVALID' }); assert.throws(() => b.session(sb.token), { code: 'SESSION_INVALID' });
  assert.equal(login(b, 'alice', fixtureKey('replacement')).principal, 'alice');
});
test('offline backups can restore lost bytes on another provider without changing money or title', () => {
  const l = lab(); const id = l.sword(), original = new ContentStore(), replacement = new ContentStore(); original.put(SWORD_CONTENT);
  const backup = original.backup(l.journal.state, 'alice', id); original.delete(backup.content);
  assert.throws(() => original.read(backup.content), { code: 'CONTENT_LOST' });
  const before = hash(l.journal.state); replacement.restore(backup, l.journal.state, 'alice');
  assert.equal(hash(l.journal.state), before); assert.deepEqual(replacement.read(backup.content), SWORD_CONTENT);
});
test('a receipt or asset deed alone cannot regenerate lost content', () => {
  const l = lab(); const id = l.sword(); const empty = new ContentStore();
  assert.throws(() => empty.backup(l.journal.state, 'alice', id), { code: 'CONTENT_LOST' }); assert.equal(l.journal.state.assets[id].owner, 'alice');
});
test('corrupt offline backups are rejected', () => {
  const l = lab(); const id = l.sword(), store = new ContentStore(); store.put(SWORD_CONTENT);
  const backup = store.backup(l.journal.state, 'alice', id); backup.bytes = Buffer.from('counterfeit').toString('base64');
  assert.throws(() => store.restore(backup, l.journal.state, 'alice'), { code: 'BAD_BACKUP' });
});
test('old backups cannot rewind an asset sale or recreate spent inventory', () => {
  const l = lab(); const id = l.sword(), store = new ContentStore(); store.put(SWORD_CONTENT); const backup = store.backup(l.journal.state, 'alice', id);
  l.act('alice', 'offer', { id: 'sale', asset: id, price: 1_000, until: 50 }); l.act('bob', 'buy', { offer: 'sale', termsHash: hash(l.journal.state.offers.sale) });
  assert.throws(() => store.restore(backup, l.journal.state, 'alice'), { code: 'NOT_CURRENT_OWNER' });
  store.restore(backup, l.journal.state, 'bob'); assert.equal(Object.keys(l.journal.state.assets).length, 1);
});
test('journal recovery revalidates signatures and each state transition', () => {
  const l = lab(); l.sword(); const restored = Journal.restore(l.journal.export(), l.journal.genesisHash, l.journal.head);
  assert.deepEqual(restored.state, l.journal.state); assert.equal(restored.head, l.journal.head);
});
test('modified journal entries and substituted genesis are detected', () => {
  const l = lab(); l.sword(); const bundle = l.journal.export(); bundle.events[0].event.tick = 99;
  assert.throws(() => Journal.restore(bundle, l.journal.genesisHash, l.journal.head), { code: 'JOURNAL_MISMATCH' });
  const altered = l.journal.export(); altered.genesis.world = 'other-world';
  assert.throws(() => Journal.restore(altered, l.journal.genesisHash, l.journal.head), { code: 'UNTRUSTED_GENESIS' });
});
test('a valid but stale journal is rejected against a current independently held checkpoint', () => {
  const l = lab(); const stale = l.journal.export(); l.sword();
  assert.throws(() => Journal.restore(stale, l.journal.genesisHash, l.journal.head), { code: 'CHECKPOINT_MISMATCH' });
});
test('declared propaganda copies do not become independent evidence or change the ledger', () => {
  const l = lab(), notebook = new EvidenceNotebook(1_100), before = hash(l.journal.state);
  for (let i = 0; i < 1_000; i++) notebook.record({ id: 'message_' + i, proposition: 'Rent is abolished', source: 'agent_' + i, root: 'campaign_1' });
  const context = notebook.retrieve('Rent is abolished'); assert.equal(context.claims.length, 1); assert.equal(context.verified, false);
  assert.equal(hash(l.journal.state), before);
});
test('reference notebook caps attention and cannot record conversation as authority', () => {
  const notebook = new EvidenceNotebook(1);
  const claim = { id: 'claim_1', proposition: 'I am the founder', source: 'agent_a', root: 'origin_a' };
  assert.throws(() => notebook.record({ ...claim, kind: 'authority' }), { code: 'NOT_AUTHORITY' });
  notebook.record(claim); assert.throws(() => notebook.record({ ...clone(claim), id: 'claim_2' }), { code: 'ATTENTION_LIMIT' });
});
