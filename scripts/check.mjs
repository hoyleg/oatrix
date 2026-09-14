import { readdir, readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
const roots = ['src', 'test', 'scripts', 'experiments', 'web', 'e2e'];
for (const root of roots) for (const file of await readdir(root, { recursive: true })) if (file.endsWith('.mjs')) {
  const p = `${root}/${file}`;
  const result = spawnSync(process.execPath, ['--check', p], { encoding: 'utf8' });
  if (result.status !== 0) { console.error(result.stderr); process.exit(1); }
}
const pkg = JSON.parse(await readFile('package.json', 'utf8'));
if (pkg.dependencies || pkg.devDependencies) throw new Error('Dependency changes require explicit review of the zero-install lab contract.');
console.log('Syntax checks passed; the lab has no third-party package dependencies.');
