import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import { validateSuite, runSuite, runSweepCase, verifySweepReport } from '../experiments/sweeps.mjs';
import { canonical, clone, hash } from '../src/canonical.mjs';
import { Journal } from '../src/journal.mjs';
import { industrialGenesis } from '../src/industrial-genesis.mjs';
import { startHost } from '../src/http.mjs';
import { reportCSV, reportMarkdown, readJSONFile } from '../scripts/sweep-io.mjs';
const input = JSON.parse(await readFile(new URL('../examples/experiments/default.json', import.meta.url), 'utf8'));
const c = id => clone(input.cases.find(c => c.id === id));
const one = (config, seed = 7) => ({ v: 1, id: 'test_suite', seeds: [seed], cases: [config] });
const run = (id, changes = {}, seed = 7) => runSweepCase({ ...c(id), ...changes }, seed);
const metrics = (id, changes = {}, seed = 7) => run(id, changes, seed).result.metrics;
const exec = promisify(execFile), cwd = new URL('..', import.meta.url);
const small = () => one({ ...c('baseline'), ticks: 4 });

test('default suite is strictly bounded, all runs replay, inputs are untouched and checkpoints reproduce', () => {
  const before = canonical(input), report = runSuite(input), again = runSuite(input);
  assert.equal(report.runs.length, 36); assert.equal(canonical(report), canonical(again)); assert.equal(canonical(input), before);
  assert.equal(report.inputHash, hash(input));
  for (const r of report.runs) {
    assert.equal(r.modelCalls, 0); assert.equal(r.replayVerified, true);
    assert.ok(r.eventCount > 0 && r.eventCount < 1_000); assert.ok(r.assumptions.length >= 4);
    const { resultHash, ...rest } = r; assert.equal(resultHash, hash(rest));
    assert.equal(r.metrics.currencyConserved, true); assert.equal(r.metrics.materialsConserved, true);
  }
});
for (const [label, mutate] of [
  ['unknown schema field', s => { s.foo = true; }],
  ['wrong version', s => { s.v = 2; }],
  ['duplicate seeds', s => { s.seeds = [7, 7]; }],
  ['oversized seeds', s => { s.seeds = Array.from({ length: 9 }, (_, i) => i); }],
  ['invalid seed', s => { s.seeds = [-1]; }],
  ['empty cases', s => { s.cases = []; }],
  ['duplicate case ids', s => { s.cases.push(clone(s.cases[0])); }],
  ['too many runs', s => { s.seeds = [1, 2, 3, 4, 5, 6, 7, 8]; s.cases = Array.from({ length: 9 }, (_, i) => ({ ...s.cases[0], id: 'case_' + i })); }],
  ['unknown kind', s => { s.cases[0].kind = 'network'; }],
  ['excess ticks', s => { s.cases[0].ticks = 49; }],
  ['fractional fee', s => { s.cases[0].fee = 1.5; }],
  ['negative fee', s => { s.cases[0].fee = -1; }],
  ['non-boolean concentration', s => { s.cases[0].concentrated = 'false'; }],
  ['unbounded demand', s => { s.cases[0].demandBps = 10_001; }],
  ['executable field', s => { s.cases[0].script = 'process.exit()'; }],
  ['null case', s => { s.cases[0] = null; }]
]) test('suite validation rejects ' + label, () => { const s = small(); mutate(s); assert.throws(() => validateSuite(s)); });

test('economy metrics independently reconcile to replayed actions, holdings and genesis', () => {
  const { result: r, journal: bundle } = run('baseline');
  const state = Journal.restore(bundle, r.genesisHash, r.head).state, m = r.metrics;
  const byAction = action => bundle.events.filter(e => e.envelope.body.action === action);
  const sales = byAction('buy'), starts = byAction('startJob'), commissions = byAction('commission');
  assert.equal(m.soldProducts, sales.length);
  assert.equal(m.grossSalesMinorU, sales.reduce((n, e) => n + e.event.details.gross, 0));
  assert.equal(m.executionFeesMinorU, starts.reduce((n, e) => n + e.event.details.fee, 0));
  assert.equal(m.levyMinorU, [...sales, ...starts].reduce((n, e) => n + e.event.details.levy, 0));
  assert.equal(m.publicSpendMinorU, commissions.reduce((n, e) => n + e.envelope.body.args.amount, 0));
  assert.equal(state.balances.treasury, r.config.publicBudget + m.levyMinorU - m.publicSpendMinorU);
  assert.equal(m.treasuryEndMinorU, state.balances.treasury);
  assert.equal(m.soldProducts + m.unsoldProducts, m.completedProducts);
  assert.equal(m.soldProducts + m.unmetDemand, m.demandOpportunities);
  for (const p of ['alice', 'bob']) assert.equal(m.producerNetCashMinorU[p], state.balances[p] - bundle.genesis.balances[p]);
  assert.equal(Object.values(state.balances).reduce((n, x) => n + x, 0), bundle.genesis.supply);
  assert.ok(m.machineUtilisationBps >= 0 && m.machineUtilisationBps <= 10_000);
});

test('no demand still incurs cost and produces unsold stock, not declared profit', () => {
  const m = metrics('no_demand'); assert.equal(m.soldProducts, 0); assert.equal(m.demandOpportunities, 0);
  assert.ok(m.unsoldProducts > 0 && m.executionFeesMinorU > 0);
  assert.equal(m.completedProducts, m.unsoldProducts);
  assert.equal(m.producerNetCashMinorU.alice + m.producerNetCashMinorU.bob, -m.executionFeesMinorU);
});
test('concentration comparison preserves total capital, materials and productive capacity', () => {
  const shared = run('baseline'), concentrated = run('concentrated');
  const a = shared.journal.genesis, b = concentrated.journal.genesis;
  assert.equal(a.balances.alice + a.balances.bob, b.balances.alice + b.balances.bob);
  for (const r of ['ore', 'wood']) {
    assert.equal(a.inventory.alice[r] + a.inventory.bob[r], b.inventory.alice[r] + b.inventory.bob[r]);
    assert.equal(a.reserve[r], b.reserve[r]);
  }
  assert.equal(shared.result.metrics.completedProducts, concentrated.result.metrics.completedProducts);
  assert.equal(shared.result.metrics.productiveCapacityHhiBps, 5_000); assert.equal(concentrated.result.metrics.productiveCapacityHhiBps, 10_000);
  assert.equal(concentrated.result.metrics.producerNetCashMinorU.bob, 0);
  assert.equal(shared.result.metrics.producerNetCashMinorU.alice + shared.result.metrics.producerNetCashMinorU.bob,
    concentrated.result.metrics.producerNetCashMinorU.alice);
});
test('horizon separates work in progress, last-tick production and unsold products', () => {
  const early = metrics('baseline', { ticks: 1 }); assert.equal(early.runningJobs, 2); assert.equal(early.completedProducts, 0); assert.equal(early.unsoldProducts, 0);
  const end = metrics('baseline', { ticks: 2 }); assert.equal(end.runningJobs, 0); assert.equal(end.completedProducts, 2); assert.equal(end.soldProducts, 0); assert.equal(end.unsoldProducts, 2);
  assert.equal(end.machineUtilisationBps, 10_000);
});
test('zero-stock, zero-fee, zero-liquidity and unwilling-buyer boundaries remain explicit', () => {
  assert.equal(metrics('baseline', { stockPerMachine: 0 }).completedProducts, 0);
  const free = metrics('baseline', { fee: 0, workingCapital: 0 }); assert.ok(free.soldProducts > 0); assert.equal(free.executionFeesMinorU, 0);
  assert.equal(metrics('baseline', { workingCapital: 0 }).completedProducts, 0);
  const unwilling = metrics('baseline', { maxPrice: 0 }); assert.equal(unwilling.soldProducts, 0); assert.ok(unwilling.overpricedPurchases > 0);
  const poor = metrics('baseline', { buyerBudget: 0 }); assert.equal(poor.soldProducts, 0); assert.ok(poor.unaffordablePurchases > 0);
});
test('public funding shortfall is skipped expenditure, not negative treasury or invented debt', () => {
  const m = metrics('public_shortfall'); assert.ok(m.unfundedPlannedPublicSpendMinorU > 0);
  assert.equal(m.publicSpendMinorU + m.unfundedPlannedPublicSpendMinorU, c('public_shortfall').ticks * c('public_shortfall').publicSpendPerTick);
  assert.equal(m.treasuryEndMinorU, m.levyMinorU - m.publicSpendMinorU); assert.ok(m.treasuryEndMinorU >= 0);
});
test('different seeds preserve reproducibility; equal demand totals may hide different arrival times', () => {
  const a = run('stochastic_demand', {}, 7).result, b = run('stochastic_demand', {}, 19).result;
  assert.notDeepEqual(a.observations.map(x => x.demandOpportunities), b.observations.map(x => x.demandOpportunities));
  assert.deepEqual(a, run('stochastic_demand', {}, 7).result);
  assert.deepEqual(metrics('cold_relocate', {}, 7), metrics('cold_relocate', {}, 19));
});
test('cold restore relocates without evicting the successor, wait returns after expiry', () => {
  const move = metrics('cold_relocate'), wait = metrics('cold_wait');
  assert.equal(move.titlePreserved, true); assert.equal(move.occupiedSlotRejected, true); assert.equal(move.relocated, true);
  assert.equal(move.originalSlotOwnerAtEnd, 'bob'); assert.equal(move.reactivationDelayTicks, 1);
  assert.equal(wait.originalSlotOwnerAtEnd, 'alice'); assert.equal(wait.relocated, false); assert.equal(wait.reactivationDelayTicks, 5);
  assert.equal(move.recoverableUniqueBytesAtFailure, move.uniqueContentBytes); assert.equal(move.lostUniqueBytes, 0);
});
test('loss with no backup and correlated replica failure preserves deeds but cannot restore bytes', () => {
  for (const id of ['no_backup', 'correlated_loss']) {
    const m = metrics(id); assert.equal(m.titlePreserved, true); assert.equal(m.reactivationDelayTicks, null);
    assert.equal(m.restoredBytes, 0); assert.equal(m.recoverableUniqueBytesAtFailure, 0); assert.equal(m.lostUniqueBytes, m.uniqueContentBytes);
  }
  const replica = metrics('replica'); assert.equal(replica.lostUniqueBytes, 0); assert.equal(replica.offlineBackupBytes, 0);
});
test('freehold does not expire and a zero-delay return is not mistaken for never recovered', () => {
  const f = metrics('freehold', { restoreDelay: 0 });
  assert.equal(f.freeholdPreserved, true); assert.equal(f.originalSlotOwnerAtEnd, 'alice'); assert.equal(f.successorInstalled, false);
  assert.equal(f.reactivationDelayTicks, 0); assert.equal(f.relocated, false);
  const afterSuccessor = metrics('cold_wait', { returnAt: 12, restoreDelay: 0 });
  assert.equal(afterSuccessor.reactivationDelayTicks, 0); assert.equal(afterSuccessor.occupiedSlotRejected, false);
});
test('service budget, default exposure and refunds reconcile to the ledger without a bailout', () => {
  for (const id of ['funded_service', 'service_budget', 'service_failure']) {
    const { result: r, journal: j } = run(id), m = r.metrics;
    const s = Journal.restore(j, r.genesisHash, r.head).state;
    assert.equal(m.acknowledgedMinorU + m.refundedMinorU, r.config.budget);
    assert.equal(m.settledRequests + m.unmetBudgetRequests + m.unavailableRequests, m.requests);
    assert.equal(s.balances.alice, j.genesis.balances.alice - m.acknowledgedMinorU);
    assert.equal(s.balances.host_b, j.genesis.balances.host_b); assert.equal(s.services.service.remaining, 0);
  }
  const failure = metrics('service_failure'); assert.equal(failure.acknowledgedMinorU, 20); assert.equal(failure.refundedMinorU, 40);
  assert.equal(failure.paidExposureAfterFailureMinorU, 20); assert.equal(failure.unrelatedProviderChargedMinorU, 0);
});
test('zero service budget, immediate default and levy boundary need no special hidden subsidy', () => {
  const zero = metrics('service_budget', { budget: 0 }); assert.equal(zero.settledRequests, 0); assert.equal(zero.unmetBudgetRequests, zero.requests); assert.equal(zero.refundedMinorU, 0);
  const immediate = metrics('service_failure', { failureAt: 0 }); assert.equal(immediate.acknowledgedMinorU, 0); assert.equal(immediate.refundedMinorU, c('service_failure').budget);
  const levy = metrics('funded_service', { levyBps: 10_000 }); assert.equal(levy.levyMinorU, levy.acknowledgedMinorU);
});
test('verification recomputes the result, rejects rewritten metrics even with a new outer hash', () => {
  const report = runSuite(small()); assert.equal(verifySweepReport(report), true);
  const altered = clone(report); altered.runs[0].metrics.soldProducts++;
  const { reportHash, ...other } = altered; altered.reportHash = hash(other);
  assert.throws(() => verifySweepReport(altered), /SWEEP_REPORT_MISMATCH/);
  const wrongVersion = { ...report, engine: 'other' }; assert.throws(() => verifySweepReport(wrongVersion), /REPORT_VERSION/);
});
test('CSV protects text formula prefixes, quotes fields, and keeps numeric values and null distinct', () => {
  const s = small(); s.cases[0].label = '=HYPERLINK("evil")';
  const report = runSuite(s), csv = reportCSV(report, 'economy');
  assert.ok(csv.includes('"\'=HYPERLINK(""evil"")"')); assert.ok(csv.includes('"caseId","label","seed"'));
  assert.equal(reportCSV(report, 'service'), ''); assert.ok(reportMarkdown(report).includes(report.reportHash));
});
test('CLI writes repeatable reports and verifiable journals, fails invalid inputs without output', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'oatrix-sweeps-')); t.after(() => rm(dir, { recursive: true, force: true }));
  const source = join(dir, 'suite.json'); await writeFile(source, JSON.stringify(small()));
  const invoke = out => exec(process.execPath, ['scripts/sweep.mjs', '--input', source, '--out', out, '--journals'], { cwd, timeout: 30_000 });
  await invoke(join(dir, 'a')); await invoke(join(dir, 'b'));
  for (const file of ['report.json', 'summary.md', 'economy.csv', 'property.csv', 'service.csv', 'journals/baseline-7.json'])
    assert.equal(await readFile(join(dir, 'a', file), 'utf8'), await readFile(join(dir, 'b', file), 'utf8'));
  const report = await readJSONFile(join(dir, 'a', 'report.json'));
  const bundle = await readJSONFile(join(dir, 'a', 'journals', 'baseline-7.json'));
  assert.equal(Journal.restore(bundle, report.runs[0].genesisHash, report.runs[0].head).head, report.runs[0].head);
  await exec(process.execPath, ['scripts/sweep-verify.mjs', join(dir, 'a', 'report.json')], { cwd, timeout: 30_000 });
  await assert.rejects(() => exec(process.execPath, ['scripts/sweep.mjs', '--bad'], { cwd }), /BAD_OPTION/);
  await assert.rejects(() => readJSONFile(source, 2), /INPUT_FILE_LIMIT/);
  const bad = small(); bad.cases[0].ticks = 49; await writeFile(source, JSON.stringify(bad));
  await assert.rejects(() => invoke(join(dir, 'bad')), /BAD_INTEGER/);
  await assert.rejects(() => readFile(join(dir, 'bad', 'report.json')), { code: 'ENOENT' });
});
test('comparison HTTP endpoint is read-only and absent without a report; assets keep CSP', async t => {
  const report = runSuite(small()), j = new Journal(industrialGenesis());
  const h = await startHost(j, { sweepReport: report }); t.after(() => h.close());
  const before = j.head;
  const response = await fetch(h.url + '/sweeps.json'); assert.equal(response.status, 200); assert.deepEqual(await response.json(), report);
  for (const path of ['/sweeps.html', '/sweeps.mjs', '/index.html']) {
    const r = await fetch(h.url + path); assert.equal(r.status, 200); assert.ok(r.headers.get('content-security-policy').includes("script-src 'self'"));
  }
  assert.equal(j.head, before);
  const absent = await startHost(j); t.after(() => absent.close());
  const noReport = await fetch(absent.url + '/sweeps.json'); assert.equal(noReport.status, 404);
});
