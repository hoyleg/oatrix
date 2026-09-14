const $ = id => document.getElementById(id);
const columns = {
  economy: [['completedProducts', 'Completed'], ['soldProducts', 'Sold'], ['unsoldProducts', 'Unsold'], ['executionFeesMinorU', 'Execution fees'], ['levyMinorU', 'Levies'], ['unfundedPlannedPublicSpendMinorU', 'Unfunded public plans'], ['productiveCapacityHhiBps', 'Capacity HHI (bps)']],
  property: [['lostUniqueBytes', 'Bytes lost'], ['recoverableUniqueBytesAtFailure', 'Recoverable bytes'], ['reactivationDelayTicks', 'Return delay (ticks)'], ['titlePreserved', 'Title retained'], ['occupiedSlotRejected', 'Blocked re-entry'], ['relocated', 'Relocated']],
  service: [['settledRequests', 'Acknowledged'], ['unmetBudgetRequests', 'Over budget'], ['unavailableRequests', 'Provider offline'], ['acknowledgedMinorU', 'Paid'], ['refundedMinorU', 'Unused refund'], ['paidExposureAfterFailureMinorU', 'Paid exposure']]
};
let report, selected;
const display = x => x === null ? 'Not recovered' : typeof x === 'boolean' ? (x ? 'Yes' : 'No') : typeof x === 'number' ? x.toLocaleString('en-GB') : String(x);
function details(run) {
  selected = run; $('run-title').textContent = run.label + ' · seed ' + run.seed;
  $('run-meta').textContent = `${run.eventCount} accepted events · ${display(run.journalBytes)} journal bytes · replay checked: ${display(run.replayVerified)} · ${run.head}`;
  $('run-inputs').textContent = JSON.stringify(run.config, null, 2); $('run-metrics').textContent = JSON.stringify(run.metrics, null, 2);
  $('run-assumptions').replaceChildren(...run.assumptions.map(text => { const li = document.createElement('li'); li.textContent = text; return li; }));
  $('run-observations').textContent = JSON.stringify({ rejected: run.rejected, observations: run.observations, configHash: run.configHash, genesisHash: run.genesisHash, resultHash: run.resultHash }, null, 2);
  for (const b of $('comparison-body').querySelectorAll('button')) b.setAttribute('aria-pressed', String(b.dataset.run === run.caseId + ':' + run.seed));
}
function render() {
  const kind = $('kind').value, cols = columns[kind], runs = report.runs.filter(r => r.kind === kind);
  const tr = document.createElement('tr');
  for (const name of ['Case', 'Seed', ...cols.map(([, label]) => label)]) { const th = document.createElement('th'); th.scope = 'col'; th.textContent = name; tr.append(th); }
  $('comparison-head').replaceChildren(tr);
  $('comparison-body').replaceChildren(...runs.map(run => {
    const row = document.createElement('tr'), title = document.createElement('td'), button = document.createElement('button');
    button.textContent = run.caseId; button.dataset.run = run.caseId + ':' + run.seed; button.setAttribute('aria-pressed', 'false'); button.addEventListener('click', () => details(run)); title.append(button); row.append(title);
    for (const value of [run.seed, ...cols.map(([key]) => run.metrics[key])]) { const td = document.createElement('td'); td.textContent = display(value); row.append(td); }
    return row;
  }));
  if (runs.length) details(runs.find(r => r.caseId === selected?.caseId && r.seed === selected?.seed) ?? runs[0]);
  else { $('run-title').textContent = 'No runs of this kind in this suite'; for (const id of ['run-meta', 'run-inputs', 'run-metrics', 'run-observations']) $(id).textContent = ''; $('run-assumptions').replaceChildren(); }
}
$('kind').addEventListener('change', render);
try {
  const response = await fetch('./sweeps.json'); if (!response.ok) throw new Error(`Report request failed (${response.status}).`);
  report = await response.json();
  if (report.v !== 1 || report.engine !== 'oatrix-sweep-1' || !Array.isArray(report.runs) || !report.runs.length || report.runs.length > 64) throw new Error('Unsupported or empty sweep report.');
  $('kind').disabled = false; $('caution').textContent = report.caution; $('report-hash').textContent = `${report.runs.length} runs · ${report.reportHash}`; render();
} catch (error) { $('error').textContent = 'Unable to load comparisons: ' + error.message; }
