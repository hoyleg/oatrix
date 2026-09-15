import { Journal } from '../src/journal.mjs';
import { industrialGenesis } from '../src/industrial-genesis.mjs';
import { fixtureKey } from '../src/identity.mjs';
import { PortableSigner } from '../src/local-signer.mjs';

const journal = new Journal(industrialGenesis());
const signer = new PortableSigner({
  principal: 'alice', world: journal.state.world, privateKey: fixtureKey('alice'),
  audiences: ['http://127.0.0.1:8787'], now: () => 1_000
});
const before = { head: journal.head, state: journal.state };
const envelope = signer.signIntent(before, {
  action: 'transfer', args: { to: 'bob', amount: 7 }, expectedHead: before.head, expiresIn: 20
});
const accepted = journal.submit(envelope);
console.log(JSON.stringify({
  signer: signer.descriptor(),
  intent: { action: envelope.body.action, args: envelope.body.args, expectedHead: before.head },
  accepted: { event: accepted.hash, head: journal.head, bob: journal.state.balances.bob }
}, null, 2));
