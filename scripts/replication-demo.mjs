/** Three real processes and distinct SQLite files. Checkpoint trust is supplied by this owner-run harness. */
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { DurableJournal } from '../src/durable-journal.mjs';
import { industrialGenesis } from '../src/industrial-genesis.mjs';
import { command, fixtureKey } from '../src/identity.mjs';
import { hash } from '../src/canonical.mjs';
import { replicaProcess } from '../e2e/replica-client.mjs';
import { request } from '../e2e/durable-client.mjs';
if (process.argv.length !== 2) throw new Error('Usage: npm run demo:replication');
const parent = resolve('.oatrix/replication-demo'); mkdirSync(parent, { recursive: true });
const root = mkdtempSync(join(parent, 'run-')), cleanup = [], context = { after: fn => cleanup.push(fn) };
const dirs = Object.fromEntries(['source', 'a', 'b'].map(n => { const path = join(root, n), j = DurableJournal.initialize(path, industrialGenesis()); j.close(); return [n, path]; }));
try {
  const source = await replicaProcess(context, dirs.source, 'source'), a = await replicaProcess(context, dirs.a, 'replica'), b = await replicaProcess(context, dirs.b, 'replica');
  const before = (await request(source.url, '/api/state')).data;
  let last;
  for (let i = 0; i < 5; i++) {
    const s = (await request(source.url, '/api/state')).data;
    last = command(s.state, 'alice', 'transfer', { to: 'bob', amount: i + 1 }, fixtureKey('alice'));
    assert.equal((await request(source.url, '/api/commands', last)).status, 200);
  }
  // This control path is the demo trust policy, not evidence from an untrusted source promoted to truth.
  const target = (await request(source.url, '/api/checkpoint')).data, expected = (await request(source.url, '/api/state')).data;
  writeFileSync(join(root, 'owner-trusted-target.json'), JSON.stringify(target, null, 2) + '\n');
  const first = await a.sync({ source: source.url, target, pageSize: 2 }); assert.equal(first.error, undefined);
  await source.stop(true);
  const second = await b.sync({ source: a.url, target, pageSize: 2 }); assert.equal(second.error, undefined);
  assert.deepEqual((await request(b.url, '/api/state')).data, expected);
  const rejected = await request(b.url, '/api/commands', command(expected.state, 'alice', 'transfer', { to: 'bob', amount: 100 }, fixtureKey('alice')));
  assert.equal(rejected.status, 403);
  await a.stop(true); const restarted = await replicaProcess(context, dirs.a, 'replica');
  assert.deepEqual((await request(restarted.url, '/api/state')).data, expected);
  const receipt = (await request(b.url, '/api/receipt?commandHash=' + hash(last))).data.record; assert.deepEqual(receipt.envelope, last);
  const report = { v: 1, modelCalls: 0, originalProcesses: 3, separateDatabaseFiles: 3,
    ownerTrustedTarget: target, firstCatchUp: first.result, peerCatchUpAfterSourceLoss: second.result,
    originalSourceKilled: true, followerRestartPreservedState: true, rootWriteRejectedStatus: rejected.status,
    receiverIncreaseMinorU: expected.state.balances.bob - before.state.balances.bob, exactReceiptAvailable: true,
    limitation: 'Manual owner-trusted target. Replication does not elect a leader or prove global freshness. Followers remain read-only after source loss.' };
  writeFileSync(join(root, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2)); console.log('Saved isolated experiment to ' + root);
} finally { for (const fn of cleanup.reverse()) await fn(); }
