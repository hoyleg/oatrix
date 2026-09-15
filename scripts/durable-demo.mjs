/** Runnable local fault demonstration. Reuses the process test harness, not a second implementation. */
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { DurableJournal } from '../src/durable-journal.mjs';
import { industrialGenesis } from '../src/industrial-genesis.mjs';
import { PortableSigner } from '../src/local-signer.mjs';
import { fixtureKey } from '../src/identity.mjs';
import { hash } from '../src/canonical.mjs';
import { hostProcess, request } from '../e2e/durable-client.mjs';
if (process.argv.length !== 2) throw new Error('Usage: npm run demo:durable');
const parent = resolve('.oatrix/durable-demo'); mkdirSync(parent, { recursive: true });
const root = mkdtempSync(join(parent, 'run-')), cleanup = [], results = [], context = { after: fn => cleanup.push(fn) };
try {
  for (const phase of ['before-commit', 'after-commit']) {
    const directory = join(root, phase), marker = join(root, phase + '.json');
    const initial = DurableJournal.initialize(directory, industrialGenesis()); initial.close();
    const first = await hostProcess(context, directory, { phase, marker });
    const before = (await request(first.urls[0], '/api/state')).data;
    const signer = new PortableSigner({ principal: 'alice', world: before.state.world, privateKey: fixtureKey('alice'), audiences: first.urls });
    const envelope = signer.signIntent(before, { action: 'transfer', args: { to: 'bob', amount: 9 }, expectedHead: before.head, expiresIn: 20 });
    await assert.rejects(request(first.urls[0], '/api/commands', envelope)); await first.exit;
    assert.equal(JSON.parse(readFileSync(marker)).phase, phase);
    const second = await hostProcess(context, directory);
    const receipt = (await request(second.urls[0], '/api/receipt?commandHash=' + hash(envelope))).data.record;
    assert.equal(Boolean(receipt), phase === 'after-commit');
    const retry = await request(second.urls[1], '/api/commands', envelope);
    assert.equal(retry.status, phase === 'before-commit' ? 200 : 400);
    const after = (await request(second.urls[0], '/api/state')).data;
    assert.equal(after.state.balances.bob - before.state.balances.bob, 9);
    const checkpoint = (await request(second.urls[0], '/api/checkpoint')).data;
    results.push({ phase, replyLost: true, committedBeforeRestart: Boolean(receipt), retryStatus: retry.status,
      transfersApplied: checkpoint.sequence, receiverIncreaseMinorU: 9, commandHash: hash(envelope), checkpoint });
    await second.stop();
  }
  const report = { v: 1, modelCalls: 0, results, limitation: 'Real process termination and local SQLite recovery; not physical power-loss testing or distributed consensus.' };
  writeFileSync(join(root, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2)); console.log('Saved isolated lab evidence to ' + root);
} finally { for (const fn of cleanup.reverse()) await fn(); }
