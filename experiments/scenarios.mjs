/** Bounded scenarios: deliberately scripted and repeatable, not evidence of economic demand. */
import { Journal } from '../src/journal.mjs';
import { labGenesis, slotTerms, SWORD_CONTENT } from '../src/genesis.mjs';
import { command, fixtureKey, signPayload } from '../src/identity.mjs';
import { hash } from '../src/canonical.mjs';
import { Gateway } from '../src/gateway.mjs';
import { ContentStore } from '../src/storage.mjs';
import { EvidenceNotebook } from '../src/evidence.mjs';
import { runMachineryExperiment } from './machinery.mjs';

function experiment(id, title, question) {
  const journal = new Journal(labGenesis()), frames = [], findings = [];
  const capture = (label, detail = '') => frames.push({ label, detail, head: journal.head, state: journal.state });
  const act = (principal, action, args, label = action) => {
    if (action === 'startJob') { const provider = args.provider ?? 'host_a'; args = { provider, termsHash: hash(journal.state.executionProviders[provider]), ...args }; }
    journal.submit(command(journal.state, principal, action, args, fixtureKey(principal))); capture(label);
  };
  const tick = (ticks = 1) => act('founder', 'advance', { ticks }, `Advance ${ticks} logical tick(s)`);
  const sword = () => {
    for (const [i, recipe] of ['mine_ore', 'mine_ore', 'mine_wood'].entries()) {
      act('alice', 'startJob', { id: `raw_${i}`, recipe }, `Reserve capacity for ${recipe}`); tick();
    }
    act('alice', 'startJob', { id: 'sword_1', recipe: 'sword' }, 'Reserve ingredients and manufacture'); tick(3);
  };
  capture('Genesis', 'Public test identities; 120,000 minor U; no money issuance from work.');
  return { journal, act, tick, sword, capture, findings, report: () => ({ id, title, question, frames, findings, modelCalls: 0 }) };
}
export function runExperiments() {
  const reports = [];
  const industry = experiment('industry', 'From ore to useful machinery', 'Can production and exchange conserve materials and settle an indivisible product?');
  industry.act('founder', 'commission', { to: 'alice', amount: 500, deliverable: hash('lab workshop design'), reason: 'Scripted acceptance, not an independent quality judgement' }, 'Fund a bounded construction commission');
  industry.sword();
  industry.act('alice', 'offer', { id: 'sword_sale', asset: 'sword_1', price: 1_000, until: 50 }, 'Offer the completed product');
  industry.act('bob', 'buy', { offer: 'sword_sale', termsHash: hash(industry.journal.state.offers.sword_sale) }, 'Buyer pays; seller receives 980; treasury receives 20');
  industry.findings.push('Supply stays at 120,000 minor U.', 'Materials move from reserve to inventory to a single embodied asset.', 'Routine jobs require zero model calls.', 'A scripted buyer is NOT proof of demand or sustainable prices.');
  reports.push(industry.report());

  const mobility = experiment('mobility', 'Identity outlives a gateway', 'Can one identity continue through another host without copying an account?');
  const hostA = new Gateway(mobility.journal, 'https://a.example'), hostB = new Gateway(mobility.journal, 'https://b.example');
  const ca = hostA.challenge('alice'), cb = hostB.challenge('alice');
  hostA.login(ca, signPayload('OATRIX-LOGIN-1', ca, fixtureKey('alice')));
  const session = hostB.login(cb, signPayload('OATRIX-LOGIN-1', cb, fixtureKey('alice')));
  mobility.capture('Same principal, different host sessions', 'Private keys are not uploaded to either gateway.');
  hostA.close(); mobility.capture('First host fails', 'No change of account, title or authority.');
  hostB.submit(session.token, command(mobility.journal.state, 'alice', 'transfer', { to: 'bob', amount: 25 }, fixtureKey('alice')));
  mobility.capture('Second host relays a valid signed action');
  mobility.findings.push('Host authentication is not identity ownership.', 'Sessions are host-bound; world actions are host-neutral.', 'Both gateways use ONE journal here, not a distributed network.'); reports.push(mobility.report());

  const property = experiment('property', 'Dormancy without confiscation', 'Can a deployment expire while its owner preserves and later restores the creation?');
  property.sword(); const original = new ContentStore(), replacement = new ContentStore(); original.put(SWORD_CONTENT);
  const backup = original.backup(property.journal.state, 'alice', 'sword_1');
  property.act('alice', 'deploy', { asset: 'sword_1', slot: 'commons_a', term: 2, termsHash: slotTerms(property.journal.state, 'commons_a') }, 'Accept a two-tick public deployment lease');
  original.delete(backup.content); property.capture('Original provider loses its content copy', 'Title remains. Availability does not. The offline backup is outside the ledger.');
  property.tick(2); property.capture('Lease expires; the asset becomes dormant', 'The old location is released. The freehold title is untouched.');
  replacement.restore(backup, property.journal.state, 'alice'); property.capture('Restore bytes with another provider', 'Current title checked. No balances, inventory or leases restored from backup.');
  property.act('alice', 'deploy', { asset: 'sword_1', slot: 'commons_b', term: 2, termsHash: slotTerms(property.journal.state, 'commons_b') }, 'Return at a newly agreed location');
  property.findings.push('Owner, content and location are separate.', 'Reactivation does not displace the new occupant of an expired location.', 'Without retained bytes and decryption keys, loss can be permanent.'); reports.push(property.report());

  const service = experiment('services', 'Provider failure has bounded exposure', 'Can unused escrow return without socialising money already paid for an acknowledged service?');
  service.act('alice', 'openService', { id: 'inference', provider: 'host_b', budget: 1_000, until: 5, termsHash: hash('bounded model service') }, 'Reserve a capped service budget');
  const r = { world: service.journal.state.world, service: 'inference', request: 'request_1', amount: 100,
    termsHash: hash('bounded model service'), outputHash: hash('accepted output') };
  service.act('alice', 'settleService', { receipt: r, providerSignature: signPayload('OATRIX-SERVICE-1', r, fixtureKey('host_b')) }, 'Acknowledge one jointly signed service receipt');
  service.capture('Provider disappears', 'No further delivery is assumed; unrelated providers are not charged.');
  service.tick(5); service.act('alice', 'refundService', { id: 'inference' }, 'Refund only the 900 unspent minor U');
  service.findings.push('An acknowledged 100-unit payment stays paid.', 'Unspent escrow can return when the ledger is operating and the deadline has passed.', 'Signatures do not prove model execution or remove legal obligations.'); reports.push(service.report());

  const governance = experiment('governance', 'A visible bootstrap safety brake', 'Can the founder pause the lab without gaining an ordinary property-theft command?');
  governance.act('founder', 'pause', { reason: 'Bounded incident rehearsal' }, 'Publish the reason for emergency pause');
  try { governance.act('alice', 'transfer', { to: 'bob', amount: 10 }); }
  catch (e) { governance.capture('Paused transfer rejected', e.code); }
  const manifest = { source: hash('source'), artifact: hash('artifact'), tests: hash('test evidence'), migration: hash('no migration'), description: 'Example approved package; not installed automatically' };
  governance.act('alice', 'proposeRelease', { id: 'release_1', manifest }, 'Bind a proposal to an exact manifest');
  governance.act('reviewer', 'approveRelease', { id: 'release_1', manifestHash: hash(manifest) }, 'A distinct admitted principal records review');
  governance.act('founder', 'recordRelease', { id: 'release_1', manifestHash: hash(manifest) }, 'Record authorisation, without executing downloaded code');
  governance.act('founder', 'resume', { reason: 'Rehearsal complete; review receipt recorded' }, 'Resume with an auditable notice');
  governance.findings.push('Bootstrap authority remains centralised and explicit.', 'A review signature is not proof that the review was good.', 'No automatic PR merge, binary download or production upgrade occurs.'); reports.push(governance.report());

  const evidence = experiment('evidence', 'Conversation is not world state', 'Can declared copies of a rumour avoid turning repetition into protocol authority?');
  const notebook = new EvidenceNotebook(1_100);
  for (let i = 0; i < 1_000; i++) notebook.record({ id: `claim_${i}`, source: `agent_${i}`, root: 'one_campaign', proposition: 'Rent has been abolished' });
  const selected = notebook.retrieve('Rent has been abolished');
  evidence.capture('One thousand messages, one declared source family', `${selected.claims.length} source family selected. The claim remains unverified.`);
  evidence.findings.push('The reference notebook retains provenance and an attention cap.', 'No conversational message can mutate the ledger.', 'Undisclosed coordination and persuasive falsehoods are NOT solved.'); reports.push(evidence.report());
  const machinery = runMachineryExperiment(); reports.push(machinery.report);
  return { report: { schema: 1, name: 'Oatrix bounded lab', version: '0.2.0', experiments: reports }, journal: machinery.journal };
}
