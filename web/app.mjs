const $ = id => document.getElementById(id);
let experiments = [], chosen = 0, step = 0;
const number = n => n.toLocaleString('en-GB');
function rows(id, entries) {
  $(id).replaceChildren(...entries.map(([label, value]) => {
    const row = document.createElement('tr');
    for (const text of [label, String(value)]) { const cell = document.createElement('td'); cell.textContent = text; row.append(cell); }
    return row;
  }));
}
function render() {
  const e = experiments[chosen], f = e.frames[step], s = f.state;
  $('title').textContent = e.title; $('question').textContent = e.question;
  $('label').textContent = f.label; $('detail').textContent = f.detail;
  $('step').max = String(e.frames.length - 1); $('step').value = String(step);
  $('position').textContent = `${step + 1} / ${e.frames.length}`;
  $('previous').disabled = step === 0; $('next').disabled = step === e.frames.length - 1;
  $('tick').textContent = String(s.tick); $('supply').textContent = number(s.supply); $('assets').textContent = String(Object.keys(s.assets).length);
  rows('balances', Object.entries(s.balances).map(([k, v]) => [k, number(v)]).concat([['Unspent service escrow', number(Object.values(s.services).reduce((n, x) => n + x.remaining, 0))]]));
  rows('resources', [
    ['Ore still in reserve', number(s.reserve.ore)], ['Wood still in reserve', number(s.reserve.wood)],
    ['Jobs running', Object.values(s.jobs).filter(x => x.status === 'running').length],
    ['Jobs completed', Object.values(s.jobs).filter(x => x.status === 'complete').length],
    ['Active placements', Object.keys(s.occupancy).length], ['Safety brake', s.paused ? 'PAUSED' : 'Running']
  ]);
  $('property').replaceChildren(...Object.entries(s.assets).map(([id, a]) => {
    const item = document.createElement('div'); item.className = 'asset';
    item.textContent = `${id} · owner: ${a.owner} · ${a.deployed ?? 'dormant / not deployed'}`; return item;
  }));
  if (Object.keys(s.assets).length === 0) $('property').textContent = 'No manufactured assets yet.';
  $('findings').replaceChildren(...e.findings.map(x => { const li = document.createElement('li'); li.textContent = x; return li; }));
  $('head').textContent = f.head;
  $('machinery-panel').hidden = s.v !== 2;
  if (s.v === 2) {
    $('machines').replaceChildren(...Object.entries(s.assets).filter(([, a]) => a.kind === 'machine').map(([id, a]) => {
      const item = document.createElement('div'); item.className = 'asset';
      item.textContent = `${id} · ${a.machineClass} · owner: ${a.owner} · ${a.busy ? 'running ' + a.busy : a.locked ? 'offered for sale' : 'idle'}`; return item;
    }));
    $('recipes').replaceChildren(...Object.entries(s.recipes).map(([digest, entry]) => {
      const details = document.createElement('details'), title = document.createElement('summary'), body = document.createElement('pre');
      title.textContent = `${entry.definition.label} · revision ${entry.definition.revision} · ${entry.definition.duration} tick(s)`;
      body.textContent = `Digest: ${digest}\nAuthor: ${entry.author}\n\n${JSON.stringify(entry.definition, null, 2)}`;
      details.append(title, body); return details;
    }));
  }

}
$('experiment').addEventListener('change', e => { chosen = Number(e.target.value); step = 0; render(); });
$('step').addEventListener('input', e => { step = Number(e.target.value); render(); });
$('previous').addEventListener('click', () => { if (step > 0) { step--; render(); } });
$('next').addEventListener('click', () => { if (step + 1 < experiments[chosen].frames.length) { step++; render(); } });
try {
  const response = await fetch('./report.json'); if (!response.ok) throw new Error(`Report request failed (${response.status}).`);
  const report = await response.json(); experiments = report.experiments;
  if (!Array.isArray(experiments) || !experiments.length) throw new Error('No experiments available. Run npm run build:web or npm start.');
  $('experiment').replaceChildren(...experiments.map((e, i) => { const option = document.createElement('option'); option.value = String(i); option.textContent = e.title; return option; }));
  chosen = Math.max(0, experiments.findIndex(e => e.id === 'machinery')); $('experiment').value = String(chosen); render();
} catch (e) { $('error').textContent = `Unable to load the experiment report: ${e.message}`; }
