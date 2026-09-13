/** A bounded reference-runtime evidence model, not a universal truth or propaganda detector.
 * Sources are grouped only by DECLARED derivation. Hidden coordination remains unresolved.
 */
import { demand, digest, identifier, text, clone } from './canonical.mjs';
export class EvidenceNotebook {
  #claims = new Map();
  constructor(limit = 100) { this.limit = limit; }
  record({ id, proposition, source, root, kind = 'claim' }) {
    identifier(id); identifier(source); identifier(root); text(proposition, 2_000);
    demand(['claim', 'observation', 'preference'].includes(kind), 'NOT_AUTHORITY');
    demand(!this.#claims.has(id), 'DUPLICATE_CLAIM'); demand(this.#claims.size < this.limit, 'ATTENTION_LIMIT');
    this.#claims.set(id, { id, proposition, source, root, kind });
  }
  retrieve(proposition, maximum = 5) {
    const roots = new Set(), result = [];
    for (const claim of this.#claims.values()) {
      if (claim.proposition === proposition && !roots.has(claim.root)) { roots.add(claim.root); result.push(clone(claim)); }
      if (result.length >= maximum) break;
    }
    return { claims: result, verified: false, warning: 'Repetition is not independent evidence. Query authoritative state for rules and balances.' };
  }
  authoritativeReference(stateHash) { digest(stateHash); return { stateHash, note: 'A hash must be checked against a trusted ledger, not accepted as self-authenticating truth.' }; }
}
