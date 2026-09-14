import { readJSONFile } from './sweep-io.mjs';
import { verifySweepReport } from '../experiments/sweeps.mjs';
try {
  if (process.argv.length > 3) throw new Error('Expected at most one report path.');
  const report = await readJSONFile(process.argv[2] ?? '.oatrix/sweeps/report.json', 10_000_000);
  verifySweepReport(report);
  console.log(`Reproduced all ${report.runs.length} runs exactly: ${report.reportHash}`);
  console.log('This checks consistency with the current engine and declared inputs, not economic truth or approval of those inputs.');
} catch (error) { console.error('Sweep verification failed: ' + error.message); process.exitCode = 1; }
