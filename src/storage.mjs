/** Off-ledger content storage. Bytes, title and active placement are deliberately separate.
 * This in-memory adapter supports offline bundles. It supplies NO durability guarantee.
 */
import { demand, digest, hashBytes, fields } from './canonical.mjs';
export class ContentStore {
  #blobs = new Map();
  put(bytes) {
    demand(Buffer.isBuffer(bytes) && bytes.length <= 1_000_000, 'BLOB_LIMIT');
    const id = hashBytes(bytes); this.#blobs.set(id, Buffer.from(bytes)); return id;
  }
  has(id) { return this.#blobs.has(id); }
  read(id) { digest(id); demand(this.has(id), 'CONTENT_LOST'); return Buffer.from(this.#blobs.get(id)); }
  delete(id) { digest(id); return this.#blobs.delete(id); }
  backup(state, owner, assetId) {
    const asset = state.assets[assetId]; demand(asset && asset.owner === owner, 'NOT_OWNER');
    return { v: 1, world: state.world, asset: assetId, content: asset.content, bytes: this.read(asset.content).toString('base64') };
  }
  restore(bundle, currentState, authenticatedPrincipal) {
    fields(bundle, ['v', 'world', 'asset', 'content', 'bytes']);
    demand(bundle.v === 1 && bundle.world === currentState.world, 'WRONG_WORLD');
    const asset = currentState.assets[bundle.asset];
    demand(asset && asset.owner === authenticatedPrincipal, 'NOT_CURRENT_OWNER');
    demand(asset.content === bundle.content, 'CONTENT_VERSION_CHANGED');
    demand(typeof bundle.bytes === 'string' && bundle.bytes.length <= 1_400_000, 'BLOB_LIMIT');
    const bytes = Buffer.from(bundle.bytes, 'base64');
    demand(bytes.toString('base64') === bundle.bytes && hashBytes(bytes) === bundle.content, 'BAD_BACKUP');
    this.put(bytes); // Never copies balances, inventory, title or deployment from the backup.
    return asset.content;
  }
}
