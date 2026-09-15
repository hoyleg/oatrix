/** Explicit local operations. Never overwrites a ledger or backup, never auto-resets. */
import { readFileSync, lstatSync, openSync, closeSync, writeFileSync, fsyncSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { DurableJournal, LEDGER_LIMITS } from '../src/durable-journal.mjs';
import { industrialGenesis } from '../src/industrial-genesis.mjs';
import { hash, demand } from '../src/canonical.mjs';
const usage = 'Usage: ledger.mjs init [directory] | check [directory] [checkpoint.json] | checkpoint directory new-output.json | export directory new-output.json | restore new-directory journal.json trusted-checkpoint.json';
function readJSON(path, max) {
  const s = lstatSync(path); demand(s.isFile() && !s.isSymbolicLink() && s.size <= max, 'INPUT_FILE_LIMIT');
  const data = readFileSync(path); demand(data.length <= max, 'INPUT_FILE_LIMIT'); return JSON.parse(data.toString('utf8'));
}
function writeNew(path, value) {
  const fd = openSync(path, 'wx', 0o600);
  try { writeFileSync(fd, JSON.stringify(value, null, 2) + '\n'); fsyncSync(fd); } finally { closeSync(fd); }
}
let j;
try {
  const [action, arg, output, pin] = process.argv.slice(2);
  demand(process.argv.length <= 6 && ['init', 'check', 'checkpoint', 'export', 'restore'].includes(action), 'USAGE', usage);
  const dir = resolve(arg ?? '.oatrix/ledger'), genesis = industrialGenesis(), expectedGenesis = hash(genesis);
  if (action === 'init') {
    demand(!output && !pin, 'USAGE', usage); mkdirSync(dirname(dir), { recursive: true });
    j = DurableJournal.initialize(dir, genesis);
  } else if (action === 'restore') {
    demand(arg && output && pin, 'USAGE', usage);
    const checkpoint = readJSON(pin, 4096); demand(checkpoint.genesisHash === expectedGenesis, 'UNTRUSTED_GENESIS');
    const bundle = readJSON(output, 2 * LEDGER_LIMITS.logicalBytes + LEDGER_LIMITS.genesisBytes);
    j = DurableJournal.restore(dir, bundle, checkpoint);
  } else {
    demand(!pin, 'USAGE', usage);
    if (action !== 'check') demand(arg && output, 'USAGE', usage);
    j = new DurableJournal(dir, expectedGenesis, { minimumCheckpoint: action === 'check' && output ? readJSON(output, 4096) : null });
    if (action === 'checkpoint') writeNew(output, j.checkpoint());
    if (action === 'export') writeNew(output, j.export());
  }
  console.log(JSON.stringify({ action, directory: dir, checkpoint: j.checkpoint(),
    note: 'Local replay verified. Retain a checkpoint independently; these bytes alone do not establish latest canonical history.' }, null, 2));
} catch (error) { console.error(`${error.code ?? 'LEDGER_ERROR'}: ${error.message}`); process.exitCode = 1; }
finally { j?.close(); }
