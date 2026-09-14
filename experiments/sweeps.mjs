/** Bounded, deterministic experiments over the real reducer. Not an agent economy forecast.
 * Initial allocations/policies are declared fixtures; after genesis all ledger writes are signed.
 * Availability is an off-ledger experiment input, never a purported network-failure detector.
 */
import { fields, demand, integer, identifier, text, hash, hashBytes, clone, canonical, RuleError } from '../src/canonical.mjs';
import { industrialGenesis, plaqueRecipe } from '../src/industrial-genesis.mjs';
import { fixtureKey, publicKey, command, signPayload } from '../src/identity.mjs';
import { Journal } from '../src/journal.mjs';
import { ContentStore } from '../src/storage.mjs';

export const SWEEP_ENGINE = 'oatrix-sweep-1';
const common = ['id', 'label', 'kind'];
const economyFields = ['ticks', 'demandBps', 'maxBuysPerTick', 'price', 'maxPrice', 'fee', 'levyBps', 'providerSlots', 'concentrated', 'buyerBudget', 'workingCapital', 'stockPerMachine', 'publicBudget', 'publicSpendPerTick'];
const propertyFields = ['tenure', 'backup', 'failure', 'leaseTerm', 'returnAt', 'successorTerm', 'restoreDelay', 'returnPolicy'];
const serviceFields = ['requests', 'price', 'budget', 'failureAt', 'levyBps'];
const bps = (a, b) => b === 0 ? 0 : Math.floor(a * 10_000 / b);
// Counter-based draws: changing a participant's success/failure cannot shift future demand draws.
const draw = (seed, channel, tick) => Number.parseInt(hash([seed, channel, tick]).slice(0, 8), 16);

export function validateSuite(suite) {
  fields(suite, ['v', 'id', 'seeds', 'cases']); demand(suite.v === 1, 'SUITE_VERSION'); identifier(suite.id);
  demand(Array.isArray(suite.seeds) && suite.seeds.length > 0 && suite.seeds.length <= 8 && new Set(suite.seeds).size === suite.seeds.length, 'BAD_SEEDS');
  for (const seed of suite.seeds) integer(seed, 0, 0xffff_ffff);
  demand(Array.isArray(suite.cases) && suite.cases.length > 0 && suite.cases.length <= 32 && suite.cases.length * suite.seeds.length <= 64, 'SWEEP_LIMIT');
  demand(new Set(suite.cases.map(c => c?.id)).size === suite.cases.length, 'DUPLICATE_CASE');
  for (const c of suite.cases) {
    const extra = c?.kind === 'economy' ? economyFields : c?.kind === 'property' ? propertyFields : c?.kind === 'service' ? serviceFields : null;
    demand(extra !== null, 'CASE_KIND'); fields(c, [...common, ...extra]); identifier(c.id); text(c.label, 120);
    if (c.kind === 'economy') {
      integer(c.ticks, 1, 48); integer(c.demandBps, 0, 10_000); integer(c.maxBuysPerTick, 1, 4);
      integer(c.price, 1, 1_000); integer(c.maxPrice, 0, 1_000); integer(c.fee, 0, 1_000); integer(c.levyBps, 0, 10_000);
      integer(c.providerSlots, 1, 8); demand(typeof c.concentrated === 'boolean', 'BAD_CONCENTRATION');
      integer(c.buyerBudget, 0, 20_000); integer(c.workingCapital, 0, 20_000); integer(c.stockPerMachine, 0, 100);
      integer(c.publicBudget, 0, 20_000); integer(c.publicSpendPerTick, 0, 1_000);
    } else if (c.kind === 'property') {
      demand(['lease', 'freehold'].includes(c.tenure), 'TENURE'); demand(['none', 'cold', 'replica'].includes(c.backup), 'BACKUP');
      demand(['primary', 'correlated'].includes(c.failure), 'FAILURE_MODE'); demand(['relocate', 'wait'].includes(c.returnPolicy), 'RETURN_POLICY');
      integer(c.leaseTerm, 1, 10); integer(c.returnAt, c.leaseTerm + 1, 30); integer(c.successorTerm, 1, 20); integer(c.restoreDelay, 0, 10);
    } else {
      integer(c.requests, 1, 32); integer(c.price, 1, 1_000); integer(c.budget, 0, 10_000);
      if (c.failureAt !== null) integer(c.failureAt, 0, c.requests - 1);
      integer(c.levyBps, 0, 10_000);
    }
  }
  return true;
}
function rig(c, seed, configure = () => {}) {
  const genesis = industrialGenesis(); genesis.world = 'oatrix-sweep-' + hash([SWEEP_ENGINE, c, seed]).slice(0, 24); configure(genesis);
  const j = new Journal(genesis), rejected = {};
  function act(p, action, args) { return j.submit(command(j.state, p, action, args, fixtureKey(p))); }
  function attempt(p, action, args, allowed) {
    const before = j.head;
    try { return act(p, action, args); }
    catch (e) {
      if (!(e instanceof RuleError) || !allowed.includes(e.code)) throw e;
      demand(j.head === before, 'REJECTION_MUTATED_STATE'); rejected[e.code] = (rejected[e.code] ?? 0) + 1; return null;
    }
  }
  function advanceTo(tick) { while (j.state.tick < tick) act('founder', 'advance', { ticks: Math.min(100, tick - j.state.tick) }); }
  function finish(metrics, assumptions, observations = []) {
    const bundle = j.export(), replay = Journal.restore(bundle, j.genesisHash, j.head);
    demand(hash(replay.state) === hash(j.state), 'REPLAY_DIVERGENCE');
    const result = { caseId: c.id, label: c.label, kind: c.kind, seed, config: clone(c), configHash: hash(c),
      genesisHash: j.genesisHash, head: j.head, eventCount: bundle.events.length,
      journalBytes: Buffer.byteLength(canonical(bundle)), modelCalls: 0, replayVerified: true,
      metrics, rejected, assumptions, observations };
    return { result: { ...result, resultHash: hash(result) }, journal: bundle };
  }
  return { j, act, attempt, advanceTo, finish };
}
function runEconomy(c, seed) {
  const l = rig(c, seed, s => {
    s.identities.buyer = { publicKey: publicKey(fixtureKey('buyer')), epoch: 1, delegates: {}, nextDelegateEpoch: 1 };
    s.inventory.buyer = { ore: 0, wood: 0 }; s.levyBps = c.levyBps;
    for (const id of Object.keys(s.balances)) s.balances[id] = 0;
    s.balances.buyer = c.buyerBudget; s.balances.treasury = c.publicBudget;
    s.balances.alice = c.workingCapital * (c.concentrated ? 2 : 1); s.balances.bob = c.concentrated ? 0 : c.workingCapital;
    s.balances.founder = s.supply - Object.values(s.balances).reduce((a, b) => a + b, 0);
    if (c.concentrated) s.assets.bob_workbench.owner = 'alice';
    for (const id of ['alice_workbench', 'bob_workbench']) for (const raw of ['ore', 'wood']) {
      s.reserve[raw] -= c.stockPerMachine; s.inventory[s.assets[id].owner][raw] += c.stockPerMachine;
    }
    s.executionProviders.host_a.pricePerTick = c.fee; s.executionProviders.host_a.maxConcurrent = c.providerSlots;
  });
  const initial = l.j.state, recipe = plaqueRecipe(); l.act('alice', 'publishRecipe', { recipe });
  const recipeDigest = hash(recipe), machineIds = ['alice_workbench', 'bob_workbench'];
  let sequence = 0, sold = 0, grossSales = 0, paidMaintenance = 0, unfundedMaintenance = 0, demanded = 0, unmetDemand = 0, unaffordable = 0, overpriced = 0;
  const observations = [];
  for (let tick = 0; tick < c.ticks; tick++) {
    // Completed products are offered at a declared fixed price, not valued by an AI or an oracle.
    for (const [id, a] of Object.entries(l.j.state.assets).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)) {
      if (a.kind === 'plaque' && a.owner !== 'buyer' && a.locked === null)
        l.act(a.owner, 'offer', { id: 'sale_' + id, asset: id, price: c.price, until: c.ticks + 1 });
    }
    const buyers = draw(seed, 'demand', tick) % 10_000 < c.demandBps ? c.maxBuysPerTick : 0; demanded += buyers;
    for (let n = 0; n < buyers; n++) {
      const offers = Object.entries(l.j.state.offers).filter(([, o]) => o.status === 'open');
      offers.sort(([a], [b]) => draw(seed, 'offer:' + a, tick) - draw(seed, 'offer:' + b, tick) || (a < b ? -1 : a > b ? 1 : 0));
      if (!offers.length) { unmetDemand++; continue; }
      if (c.price > c.maxPrice) { overpriced++; unmetDemand++; continue; }
      const [id, offer] = offers[0];
      const event = l.attempt('buyer', 'buy', { offer: id, termsHash: hash(offer) }, ['INSUFFICIENT_FUNDS']);
      if (event) { sold++; grossSales += c.price; } else { unaffordable++; unmetDemand++; }
    }
    if (c.publicSpendPerTick) {
      const paid = l.attempt('founder', 'commission', { to: 'host_b', amount: c.publicSpendPerTick,
        deliverable: hash(['declared-public-maintenance', tick]), reason: 'Scripted public maintenance acceptance, not measured service quality' }, ['INSUFFICIENT_FUNDS']);
      if (paid) paidMaintenance += c.publicSpendPerTick; else unfundedMaintenance += c.publicSpendPerTick;
    }
    const ordered = draw(seed, 'admission-order', tick) % 2 ? [...machineIds].reverse() : machineIds;
    for (const machine of ordered) {
      const s = l.j.state, a = s.assets[machine]; if (a.busy !== null) continue;
      l.attempt(a.owner, 'startJob', { id: 'product_' + sequence++, recipe: recipeDigest, machine,
        provider: 'host_a', termsHash: hash(s.executionProviders.host_a) }, ['INSUFFICIENT_FUNDS', 'MISSING_INPUTS', 'PROVIDER_CAPACITY']);
    }
    l.advanceTo(tick + 1);
    const s = l.j.state;
    observations.push({ tick: s.tick, sold, completed: Object.values(s.jobs).filter(j => j.status === 'complete').length,
      running: Object.values(s.jobs).filter(j => j.status === 'running').length, treasury: s.balances.treasury, demandOpportunities: demanded });
  }
  const s = l.j.state, jobs = Object.values(s.jobs), counts = {};
  for (const id of machineIds) counts[s.assets[id].owner] = (counts[s.assets[id].owner] ?? 0) + 1;
  const tax = l.j.events.reduce((n, e) => n + (e.event.details.levy ?? 0), 0);
  demand(s.balances.treasury === c.publicBudget + tax - paidMaintenance, 'TREASURY_RECONCILIATION');
  return l.finish({ completedProducts: jobs.filter(j => j.status === 'complete').length, runningJobs: jobs.filter(j => j.status === 'running').length,
    soldProducts: sold, unsoldProducts: Object.values(s.assets).filter(a => a.kind === 'plaque' && a.owner !== 'buyer').length,
    demandOpportunities: demanded, unmetDemand, unaffordablePurchases: unaffordable, overpricedPurchases: overpriced,
    grossSalesMinorU: grossSales, executionFeesMinorU: jobs.reduce((n, j) => n + j.fee, 0), levyMinorU: tax,
    publicSpendMinorU: paidMaintenance, unfundedPlannedPublicSpendMinorU: unfundedMaintenance, treasuryEndMinorU: s.balances.treasury,
    producerNetCashMinorU: { alice: s.balances.alice - initial.balances.alice, bob: s.balances.bob - initial.balances.bob },
    productiveCapacityHhiBps: bps(Object.values(counts).reduce((n, x) => n + x * x, 0), machineIds.length ** 2),
    machineUtilisationBps: bps(jobs.reduce((n, j) => n + Math.min(recipe.duration, c.ticks - (j.end - recipe.duration)), 0), machineIds.length * c.ticks),
    currencyConserved: true, materialsConserved: true }, [
    'Two endowed workbenches and fixed total working capital/material stock; concentration changes their allocation, not their global totals.',
    'Controllers keep manufacturing until inputs, funds or capacity stop them; no optimisation or endogenous market price is claimed.',
    'Counter-based seeded demand and buyer willingness/budget are imposed assumptions, not observations of adoption.',
    'Only host_a supplies execution in this test. host_b receives explicitly scripted public-maintenance payments, not automatic subsidies.',
    'Unsold includes completed products at the horizon; in-flight jobs are reported separately. Net cash is not accounting profit and does not value endowments.',
    'Unfunded public spend is a skipped planned commission, not a booked debt. Invariants apply to every accepted action; no post-genesis issuance occurs.'
  ], observations);
}
function runProperty(c, seed) {
  const l = rig(c, seed), asset = 'alice_workbench', bytes = Buffer.from('Oatrix bootstrap workbench\n');
  const primary = new ContentStore(), replica = new ContentStore(), replacement = new ContentStore(); primary.put(bytes);
  const digest = l.j.state.assets[asset].content; demand(hashBytes(bytes) === digest, 'FIXTURE_CONTENT');
  const cold = c.backup === 'cold' ? primary.backup(l.j.state, 'alice', asset) : null;
  if (c.backup === 'replica') replica.put(bytes);
  const original = c.tenure === 'freehold' ? 'alice_freehold' : 'commons_a';
  const deploy = (p, id, slot, term) => l.attempt(p, 'deploy', { asset: id, slot, term, termsHash: hash(l.j.state.slots[slot]) }, ['SLOT_BUSY', 'NOT_FREEHOLDER']);
  demand(deploy('alice', asset, original, c.tenure === 'freehold' ? 0 : c.leaseTerm) !== null, 'INITIAL_PLACEMENT');
  l.advanceTo(c.leaseTerm); primary.delete(digest); if (c.failure === 'correlated') replica.delete(digest);
  const observations = [{ tick: l.j.state.tick, event: 'declared-storage-failure', survivingReplica: replica.has(digest), offlineCopy: cold !== null }];
  let successorInstalled = false;
  if (c.tenure === 'lease') successorInstalled = deploy('bob', 'bob_workbench', original, c.successorTerm) !== null;
  else demand(deploy('bob', 'bob_workbench', original, 0) === null, 'FREEHOLD_CONFISCATED');
  const availableBytes = replica.has(digest) || cold !== null ? bytes.length : 0;
  const retainedBytesAtFailure = (replica.has(digest) ? bytes.length : 0) + (cold !== null ? bytes.length : 0);
  l.advanceTo(c.returnAt);
  let readyAt = null, relocated = false, occupiedSlotRejected = false;
  const titleBefore = l.j.state.assets[asset].owner, balancesBefore = clone(l.j.state.balances), headBeforeRestore = l.j.head;
  if (cold) replacement.restore(cold, l.j.state, 'alice');
  else if (replica.has(digest)) replacement.put(replica.read(digest));
  demand(l.j.head === headBeforeRestore && l.j.state.assets[asset].owner === titleBefore && hash(l.j.state.balances) === hash(balancesBefore), 'RESTORE_CHANGED_LEDGER');
  if (replacement.has(digest)) {
    l.advanceTo(c.returnAt + c.restoreDelay);
    if (l.j.state.assets[asset].deployed === original) readyAt = l.j.state.tick;
    else {
      if (deploy('alice', asset, original, c.leaseTerm)) readyAt = l.j.state.tick;
      else {
        occupiedSlotRejected = true;
        demand(l.j.state.occupancy[original]?.owner === 'bob', 'SUCCESSOR_EVICTED');
        if (c.returnPolicy === 'relocate') {
          demand(deploy('alice', asset, 'commons_b', c.leaseTerm) !== null, 'RELOCATION_FAILED'); relocated = true;
        } else {
          l.advanceTo(c.leaseTerm + c.successorTerm); demand(deploy('alice', asset, original, c.leaseTerm) !== null, 'RETURN_FAILED');
        }
        readyAt = l.j.state.tick;
      }
    }
  }
  const s = l.j.state;
  return l.finish({ titlePreserved: s.assets[asset].owner === 'alice', freeholdPreserved: c.tenure !== 'freehold' || s.slots.alice_freehold.owner === 'alice',
    successorInstalled, occupiedSlotRejected, relocated, originalSlotOwnerAtEnd: s.occupancy[original]?.owner ?? null,
    reactivationDelayTicks: readyAt === null ? null : readyAt - c.returnAt,
    uniqueContentBytes: bytes.length, retainedCopyBytesAtFailure: retainedBytesAtFailure,
    recoverableUniqueBytesAtFailure: availableBytes, lostUniqueBytes: bytes.length - availableBytes,
    restoredBytes: replacement.has(digest) ? bytes.length : 0, offlineBackupBytes: cold !== null ? bytes.length : 0,
    currencyConserved: true, materialsConserved: true }, [
    'Failure and backup independence are declared scenario inputs, not measured storage SLAs or proof that providers are independent.',
    'Correlated failure destroys both online copies. A separately retained offline copy survives this particular fixture failure.',
    'Retention measures actual fixture-buffer bytes, not promised capacity; replicated bytes and unique recoverable bytes are different metrics.',
    'restoreDelay is an imposed service-delay assumption. A deed can survive with no remaining copy; null reactivation means never recovered in this run.',
    'Freehold is never expired. A returning lessee must use a vacant alternative or wait for the successor lease; backups cannot change title or balances.'
  ], observations);
}
function runService(c, seed) {
  const l = rig(c, seed, s => { s.levyBps = c.levyBps; }), termsHash = hash(['fixture-service', c.price]);
  let settled = 0, unmetBudget = 0, unmetOffline = 0, paid = 0;
  const unrelatedBefore = l.j.state.balances.host_b, observations = [];
  if (c.budget > 0) l.act('alice', 'openService', { id: 'service', provider: 'host_a', budget: c.budget, until: c.requests + 1, termsHash });
  for (let i = 0; i < c.requests; i++) {
    if (c.failureAt !== null && i >= c.failureAt) unmetOffline++;
    else if (c.budget === 0) unmetBudget++;
    else {
      const receipt = { world: l.j.state.world, service: 'service', request: 'request_' + i,
        amount: c.price, termsHash, outputHash: hash(['declared-output', i]) };
      const result = l.attempt('alice', 'settleService', { receipt, providerSignature: signPayload('OATRIX-SERVICE-1', receipt, fixtureKey('host_a')) }, ['ESCROW_LIMIT']);
      if (result) { settled++; paid += c.price; } else unmetBudget++;
    }
    l.advanceTo(i + 1); observations.push({ tick: l.j.state.tick, settled, unmetBudget, unmetOffline });
  }
  const refund = c.budget > 0 ? l.j.state.services.service.remaining : 0;
  l.advanceTo(c.requests + 1);
  if (c.budget > 0) l.act('alice', 'refundService', { id: 'service' });
  demand(paid + refund === c.budget && l.j.state.balances.host_b === unrelatedBefore, 'SERVICE_RECONCILIATION');
  return l.finish({ requests: c.requests, settledRequests: settled, unmetBudgetRequests: unmetBudget, unavailableRequests: unmetOffline,
    acknowledgedMinorU: paid, refundedMinorU: refund, paidExposureAfterFailureMinorU: c.failureAt === null ? 0 : paid,
    unrelatedProviderChargedMinorU: 0, levyMinorU: l.j.events.reduce((n, e) => n + (e.event.details.levy ?? 0), 0),
    currencyConserved: true, materialsConserved: true }, [
    'Requests and service availability are scripted; signed acknowledgements establish authorised payment, not correct inference or actual delivery.',
    'No acknowledgement is created after declared failure. Only unused escrow returns at expiry; acknowledged payments are not silently reversed.',
    'Paid exposure is the already-acknowledged amount if the provider fails, not a finding that every past delivery was worthless or legally refundable.',
    'Unrelated providers do not insure the failed provider. This experiment is not a real-world liability determination.'
  ], observations);
}
export function runSweepCase(c, seed) {
  validateSuite({ v: 1, id: 'single', seeds: [seed], cases: [c] });
  return c.kind === 'economy' ? runEconomy(c, seed) : c.kind === 'property' ? runProperty(c, seed) : runService(c, seed);
}
export function runSuite(suite, { onRun = () => {} } = {}) {
  validateSuite(suite); const runs = [];
  for (const c of suite.cases) for (const seed of suite.seeds) { const run = runSweepCase(c, seed); runs.push(run.result); onRun(run); }
  const result = { v: 1, engine: SWEEP_ENGINE, suite: clone(suite), inputHash: hash(suite), runs,
    caution: 'Bounded counterfactual fixtures. Scripted demand, endowments and failure assumptions are not evidence of adoption, production durability or a self-sustaining economy.' };
  return { ...result, reportHash: hash(result) };
}
/** Recompute using current code; consistency proof only, not independent economic validation. */
export function verifySweepReport(report) {
  fields(report, ['v', 'engine', 'suite', 'inputHash', 'runs', 'caution', 'reportHash']);
  demand(report.v === 1 && report.engine === SWEEP_ENGINE, 'REPORT_VERSION');
  validateSuite(report.suite);
  demand(Array.isArray(report.runs) && report.runs.length <= 64, 'SWEEP_LIMIT');
  const rebuilt = runSuite(report.suite);
  demand(canonical(rebuilt) === canonical(report), 'SWEEP_REPORT_MISMATCH'); return true;
}
