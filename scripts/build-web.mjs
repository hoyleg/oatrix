import { cp, mkdir, writeFile } from 'node:fs/promises';
import { runExperiments } from '../experiments/scenarios.mjs';
import { runSuite } from '../experiments/sweeps.mjs';
import { readJSONFile } from './sweep-io.mjs';
await mkdir('dist', { recursive: true });
for (const file of ['index.html', 'app.mjs', 'style.css', 'sweeps.html', 'sweeps.mjs']) await cp('web/' + file, 'dist/' + file);
await writeFile('dist/report.json', JSON.stringify(runExperiments().report) + '\n');
await writeFile('dist/sweeps.json', JSON.stringify(runSuite(await readJSONFile('examples/experiments/default.json'))) + '\n');
console.log('Static, read-only experiment console exported to dist/. No wallet, server keys or paid API access included.');
