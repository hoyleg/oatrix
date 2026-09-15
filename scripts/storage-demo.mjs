/** Isolated demonstration: all identities/content are public fixtures, all files new. */
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { Journal } from '../src/journal.mjs';
import { industrialGenesis, recipeHash, plaqueRecipe, PLAQUE_CONTENT } from '../src/industrial-genesis.mjs';
import { command, fixtureKey } from '../src/identity.mjs';
import { hash, demand } from '../src/canonical.mjs';
import { ContentStore } from '../src/storage.mjs';
import { sealAssetPack, approvePackRestore, restoreAssetPack } from '../src/asset-packs.mjs';
import { DiskArchive } from '../src/disk-archive.mjs';
if (process.argv.length > 3) throw new Error('Usage: npm run demo:storage -- [output-parent]');
const parent = resolve(process.argv[2] ?? '.oatrix/storage-demo'); mkdirSync(parent, { recursive: true, mode: 0o700 });
const directory = mkdtempSync(join(parent, 'run-')), j = new Journal(industrialGenesis()), content = new ContentStore();
const act = (action, args, p = 'alice') => j.submit(command(j.state, p, action, args, fixtureKey(p)));
for (const [i, raw] of ['ore', 'wood'].entries()) {
  act('startJob', { id: 'raw_' + i, recipe: recipeHash(j.state, 'mine_' + raw), machine: 'alice_extractor', provider: 'host_a', termsHash: hash(j.state.executionProviders.host_a) });
  act('advance', { ticks: 1 }, 'founder');
}
const recipe = plaqueRecipe(); act('publishRecipe', { recipe });
act('startJob', { id: 'workshop_plaque', recipe: hash(recipe), machine: 'alice_workbench', provider: 'host_a', termsHash: hash(j.state.executionProviders.host_a) });
act('advance', { ticks: 2 }, 'founder'); content.put(PLAQUE_CONTENT);
act('deploy', { asset: 'workshop_plaque', slot: 'commons_a', term: 1, termsHash: hash(j.state.slots.commons_a) });
const p = sealAssetPack({ head: j.head, state: j.state }, 'alice', ['workshop_plaque'], content);
const a = new DiskArchive(join(directory, 'provider-a')), b = new DiskArchive(join(directory, 'provider-b'));
const cold = new DiskArchive(join(directory, 'cold-copy'));
a.put(p.pack); b.put(a.get(p.id)); cold.put(a.get(p.id));
const keys = join(directory, 'owner-only'); mkdirSync(keys, { mode: 0o700 });
writeFileSync(join(keys, 'demo-pack.key'), p.key, { flag: 'wx', mode: 0o600 });
const staleApproval = approvePackRestore(j, 'alice', p.id, 'restored_store', fixtureKey('alice'));
a.remove(p.id); content.delete(j.state.assets.workshop_plaque.content);
act('advance', { ticks: 1 }, 'founder');
act('deploy', { asset: 'bob_workbench', slot: 'commons_a', term: 5, termsHash: hash(j.state.slots.commons_a) }, 'bob');
let rejected;
try { restoreAssetPack(b.get(p.id), p.key, j, staleApproval, 'restored_store'); } catch (e) { rejected = e.code; }
demand(rejected === 'RESTORE_HEAD', 'DEMO_STALE_APPROVAL');
const before = hash(j.export()), approval = approvePackRestore(j, 'alice', p.id, 'restored_store', fixtureKey('alice'));
const r = restoreAssetPack(b.get(p.id), p.key, j, approval, 'restored_store');
demand(hash(j.export()) === before && r.store.read(j.state.assets.workshop_plaque.content).equals(PLAQUE_CONTENT), 'DEMO_RESTORE');
demand(j.state.occupancy.commons_a.owner === 'bob', 'DEMO_SUCCESSOR');
b.remove(p.id); // Both online copies are now gone; the explicitly retained cold copy survives.
const recovered = restoreAssetPack(cold.get(p.id), p.key, j, approval, 'restored_store');
demand(recovered.store.has(j.state.assets.workshop_plaque.content), 'DEMO_COLD_COPY');
writeFileSync(join(directory, 'journal.json'), JSON.stringify(j.export()), { flag: 'wx', mode: 0o600 });
writeFileSync(join(keys, 'restore-approval.json'), JSON.stringify(approval), { flag: 'wx', mode: 0o600 });
const report = { v: 1, directory, world: j.state.world, genesisHash: j.genesisHash, head: j.head,
  packId: p.id, ciphertextBytes: p.pack.length, uniqueContentBytes: r.receipt.uniqueBytes, asset: 'workshop_plaque',
  onlineCopiesRemaining: a.usage().packs.length + b.usage().packs.length, coldCopies: cold.usage().packs.length,
  recoveredFromCold: true, successorRetained: j.state.occupancy.commons_a.owner === 'bob', rejectedStaleApproval: rejected,
  ledgerUnchangedByRestore: hash(j.export()) === before, receipt: r.receipt,
  caution: 'Public fixture content and demo key only. Random encryption means pack IDs differ each run. No real hosting, payment, confidential ledger or consensus claim.' };
writeFileSync(join(directory, 'report.json'), JSON.stringify(report, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
p.key.fill(0); console.log(JSON.stringify(report, null, 2));
