/** Off-ledger, owner-keyed asset packs. No balances, titles or placements are restored.
 * Binary framing: ASCII OATPACK1 | 12-byte IV | 16-byte GCM tag | ciphertext.
 * The random 32-byte pack key is separate from root signing keys and never stored by archives.
 */
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { ContentStore } from './storage.mjs';
import { demand, fields, identifier, digest, text, integer, hashBytes } from './canonical.mjs';
import { signPayload, verifyPayload } from './identity.mjs';
const MAGIC = Buffer.from('OATPACK1');
const DOMAIN = 'OATRIX-PACK-RESTORE-1';
export const PACK_LIMITS = Object.freeze({ assets: 32, blobBytes: 1_000_000, uniqueBytes: 8_000_000, packBytes: 11_000_000 });
function keyCheck(key) { demand(Buffer.isBuffer(key) && key.length === 32, 'PACK_KEY'); }
export function validatePackFrame(pack) {
  demand(Buffer.isBuffer(pack) && pack.length > 36 && pack.length <= PACK_LIMITS.packBytes, 'PACK_SIZE');
  demand(pack.subarray(0, 8).equals(MAGIC), 'PACK_VERSION'); return hashBytes(pack);
}
function payloadCheck(payload) {
  fields(payload, ['v', 'world', 'sourceHead', 'assets', 'blobs']);
  demand(payload.v === 1, 'PACK_PAYLOAD_VERSION'); text(payload.world, 200); digest(payload.sourceHead);
  demand(Array.isArray(payload.assets) && payload.assets.length > 0 && payload.assets.length <= PACK_LIMITS.assets, 'PACK_ASSETS');
  demand(Array.isArray(payload.blobs) && payload.blobs.length > 0 && payload.blobs.length <= PACK_LIMITS.assets, 'PACK_BLOBS');
  const ids = new Set(), needed = new Set(), blobs = new Map(); let total = 0;
  for (const asset of payload.assets) {
    fields(asset, ['id', 'content']); identifier(asset.id); digest(asset.content);
    demand(!ids.has(asset.id), 'PACK_DUPLICATE_ASSET'); ids.add(asset.id); needed.add(asset.content);
  }
  for (const blob of payload.blobs) {
    fields(blob, ['hash', 'bytes']); digest(blob.hash);
    demand(!blobs.has(blob.hash) && needed.has(blob.hash), 'PACK_BLOB_SET');
    demand(typeof blob.bytes === 'string' && blob.bytes.length <= 4 * Math.ceil(PACK_LIMITS.blobBytes / 3), 'PACK_BLOB_SIZE');
    const bytes = Buffer.from(blob.bytes, 'base64');
    demand(bytes.length <= PACK_LIMITS.blobBytes && bytes.toString('base64') === blob.bytes && hashBytes(bytes) === blob.hash, 'PACK_CONTENT');
    total += bytes.length; demand(total <= PACK_LIMITS.uniqueBytes, 'PACK_TOTAL_SIZE'); blobs.set(blob.hash, bytes);
  }
  demand(blobs.size === needed.size, 'PACK_BLOB_SET');
  return { blobs, total };
}
/** The source snapshot is context, NOT a certificate of ownership or canonical state. */
export function sealAssetPack(snapshot, owner, assetIds, store) {
  fields(snapshot, ['head', 'state']); digest(snapshot.head); identifier(owner);
  demand(Array.isArray(assetIds) && assetIds.length > 0 && assetIds.length <= PACK_LIMITS.assets && new Set(assetIds).size === assetIds.length, 'PACK_ASSETS');
  const assets = [], blobs = new Map();
  for (const id of [...assetIds].sort()) {
    identifier(id); const asset = snapshot.state.assets[id];
    demand(asset && asset.owner === owner, 'NOT_CURRENT_OWNER'); digest(asset.content);
    assets.push({ id, content: asset.content });
    if (!blobs.has(asset.content)) blobs.set(asset.content, store.read(asset.content).toString('base64'));
  }
  const payload = { v: 1, world: snapshot.state.world, sourceHead: snapshot.head, assets,
    blobs: [...blobs].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([id, bytes]) => ({ hash: id, bytes })) };
  payloadCheck(payload);
  const plaintext = Buffer.from(JSON.stringify(payload)), key = randomBytes(32), iv = randomBytes(12);
  try {
    const cipher = createCipheriv('aes-256-gcm', key, iv, { authTagLength: 16 }); cipher.setAAD(MAGIC);
    const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    const pack = Buffer.concat([MAGIC, iv, cipher.getAuthTag(), encrypted]);
    return { pack, key, id: validatePackFrame(pack) };
  } catch (error) { key.fill(0); throw error; }
  finally { plaintext.fill(0); } // Best effort only: strings/engine copies may remain in memory.
}
/** Key possession can decrypt a retained copy even after a sale. This is not DRM. */
export function openAssetPack(pack, key) {
  validatePackFrame(pack); keyCheck(key);
  let partial, plaintext;
  try {
    const decipher = createDecipheriv('aes-256-gcm', key, pack.subarray(8, 20), { authTagLength: 16 });
    decipher.setAAD(MAGIC); decipher.setAuthTag(pack.subarray(20, 36));
    partial = decipher.update(pack.subarray(36));
    plaintext = Buffer.concat([partial, decipher.final()]); // Authenticate before parsing/returning anything.
    let payload;
    try { payload = JSON.parse(plaintext.toString('utf8')); } catch { demand(false, 'PACK_JSON'); }
    payloadCheck(payload); return payload;
  } catch (error) {
    if (error?.name === 'RuleError') throw error;
    demand(false, 'PACK_DECRYPT');
  } finally { partial?.fill(0); plaintext?.fill(0); }
}
/** Dedicated, off-ledger approval. It cannot be submitted as a monetary command. */
export function approvePackRestore(journal, principal, packId, destination, privateKey) {
  identifier(principal); digest(packId); identifier(destination);
  const identity = journal.state.identities[principal]; demand(identity, 'UNKNOWN_PRINCIPAL');
  const body = { v: 1, world: journal.state.world, principal, epoch: identity.epoch, head: journal.head, pack: packId, destination };
  const approval = { body, signature: signPayload(DOMAIN, body, privateKey) };
  demand(verifyPayload(DOMAIN, body, approval.signature, identity.publicKey), 'RESTORE_SIGNATURE'); return approval;
}
/** Use an actual trusted journal, not an arbitrary host snapshot presented as current truth.
 * Validate every association first, then return a fresh in-memory store. No external writes,
 * key transfers, charges, deployment, ledger rollback or partial activation occur here.
 */
export function restoreAssetPack(pack, key, journal, approval, destination) {
  const packId = validatePackFrame(pack); identifier(destination);
  fields(approval, ['body', 'signature']); const b = approval.body;
  fields(b, ['v', 'world', 'principal', 'epoch', 'head', 'pack', 'destination']);
  identifier(b.principal); integer(b.epoch, 1); digest(b.head); digest(b.pack); identifier(b.destination);
  const state = journal.state;
  demand(b.v === 1 && b.world === state.world, 'WRONG_WORLD');
  demand(b.head === journal.head, 'RESTORE_HEAD');
  demand(b.pack === packId && b.destination === destination, 'RESTORE_TARGET');
  const identity = state.identities[b.principal];
  demand(identity && identity.epoch === b.epoch && verifyPayload(DOMAIN, b, approval.signature, identity.publicKey), 'RESTORE_SIGNATURE');
  const payload = openAssetPack(pack, key);
  demand(payload.world === state.world, 'WRONG_WORLD');
  for (const item of payload.assets) {
    const current = state.assets[item.id];
    demand(current && current.owner === b.principal, 'NOT_CURRENT_OWNER');
    demand(current.content === item.content, 'CONTENT_VERSION_CHANGED');
  }
  const { blobs, total } = payloadCheck(payload), store = new ContentStore();
  for (const bytes of blobs.values()) store.put(bytes);
  return { store, receipt: { v: 1, pack: packId, world: state.world, principal: b.principal, destination,
    checkedHead: journal.head, sourceHead: payload.sourceHead, assetIds: payload.assets.map(x => x.id),
    uniqueBlobs: blobs.size, uniqueBytes: total, ledgerChanged: false } };
}
