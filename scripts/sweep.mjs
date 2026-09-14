import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { runSuite } from '../experiments/sweeps.mjs';
import { readJSONFile, reportCSV, reportMarkdown } from './sweep-io.mjs';
import { demand } from '../src/canonical.mjs';
try {
  let input = 'examples/experiments/default.json', out = '.oatrix/sweeps', journals = false;
  const args = process.argv.slice(2), seen = new Set();
  for (let i = 0; i < args.length; i++) {
    const flag = args[i]; demand(!seen.has(flag), 'DUPLICATE_OPTION'); seen.add(flag);
    if (flag === '--journals') journals = true;
    else {
      demand(['--input', '--out'].includes(flag) && typeof args[i + 1] === 'string' && !args[i + 1].startsWith('--'), 'BAD_OPTION');
      if (flag === '--input') input = args[++i]; else out = args[++i];
    }
  }
  const suite = await readJSONFile(input), bundles = [];
  const report = runSuite(suite, { onRun: run => { if (journals) bundles.push(run); } });
  const dir = resolve(out); await mkdir(dir, { recursive: true });
  await writeFile(join(dir, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  await writeFile(join(dir, 'summary.md'), reportMarkdown(report));
  for (const kind of ['economy', 'property', 'service']) await writeFile(join(dir, kind + '.csv'), reportCSV(report, kind));
  if (journals) {
    await mkdir(join(dir, 'journals'), { recursive: true });
    for (const { result, journal } of bundles) await writeFile(join(dir, 'journals', result.caseId + '-' + result.seed + '.json'), JSON.stringify(journal) + '\n');
  }
  console.log(`Oatrix: ${report.runs.length} bounded runs; all journals replayed; zero model calls.`);
  console.log(`Report: ${join(dir, 'report.json')}\nHash: ${report.reportHash}`);
  console.log('JSON, separate CSV tables and summary.md written. Scripted demand is not evidence of adoption.');
} catch (error) {
  console.error('Sweep failed: ' + error.message);
  console.error('Usage: npm run sweep -- [--input examples/experiments/default.json] [--out .oatrix/sweeps] [--journals]'); process.exitCode = 1;
}
