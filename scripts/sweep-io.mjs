/** File/report helpers, kept outside the deterministic simulation. No dependencies or network. */
import { readFile, stat } from 'node:fs/promises';
import { demand } from '../src/canonical.mjs';
export async function readJSONFile(path, maxBytes = 1_000_000) {
  demand((await stat(path)).size <= maxBytes, 'INPUT_FILE_LIMIT');
  const data = await readFile(path); demand(data.length <= maxBytes, 'INPUT_FILE_LIMIT'); return JSON.parse(data.toString('utf8'));
}
const cell = x => {
  let s = typeof x === 'object' && x !== null ? JSON.stringify(x) : x === null ? '' : String(x);
  if (/^[\s]*[=+\-@]/.test(s) && typeof x !== 'number') s = "'" + s;
  return '"' + s.replaceAll('"', '""') + '"';
};
export function reportCSV(report, kind) {
  const runs = report.runs.filter(r => r.kind === kind); if (!runs.length) return '';
  const metrics = Object.keys(runs[0].metrics), header = ['caseId', 'label', 'seed', ...metrics, 'configHash', 'head', 'resultHash'];
  return [header, ...runs.map(r => [r.caseId, r.label, r.seed, ...metrics.map(k => r.metrics[k]), r.configHash, r.head, r.resultHash])]
    .map(row => row.map(cell).join(',')).join('\r\n') + '\r\n';
}
export function reportMarkdown(report) {
  const clean = x => String(x).replaceAll('|', '/').replaceAll('\n', ' ').replaceAll('\r', ' ');
  return '# Oatrix bounded comparison\n\n' + report.caution + '\n\n' +
    `Engine: ${report.engine}. Runs: ${report.runs.length}. Report hash: \`${report.reportHash}\`.\n\n` +
    '| Case | Seed | Outcome |\n|---|---:|---|\n' + report.runs.map(r => {
      const m = r.metrics, outcome = r.kind === 'economy' ? `${m.completedProducts} complete; ${m.soldProducts} sold; ${m.unsoldProducts} unsold; treasury ${m.treasuryEndMinorU} minor U` :
        r.kind === 'property' ? `${m.lostUniqueBytes} bytes lost; reactivation ${m.reactivationDelayTicks === null ? 'not achieved' : m.reactivationDelayTicks + ' ticks'}` :
          `${m.settledRequests}/${m.requests} acknowledged; ${m.refundedMinorU} minor U refunded`;
      return `| ${clean(r.caseId)} | ${r.seed} | ${outcome} |`;
    }).join('\n') + '\n\nAll outcomes are conditional on the attached input configuration. Every ledger trace was replayed; bytes/availability observations are off-ledger fixtures. See report.json for assumptions, rejected actions and exact metrics.\n';
}
