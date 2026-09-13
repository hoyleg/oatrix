import { cp, mkdir, writeFile } from 'node:fs/promises';
import { runExperiments } from '../experiments/scenarios.mjs';
await mkdir('dist', { recursive: true });
for (const file of ['index.html', 'app.mjs', 'style.css']) await cp('web/' + file, 'dist/' + file);
await writeFile('dist/report.json', JSON.stringify(runExperiments().report) + '\n');
console.log('Static, read-only experiment console exported to dist/. No wallet, server keys or paid API access included.');
