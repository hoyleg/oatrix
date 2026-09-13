/** A single-writer, hash-linked event journal. Hash linkage is NOT Byzantine consensus.
 * Recovery requires the expected genesis and a separately trusted final checkpoint.
 */
import { clone, demand, hash, fields } from './canonical.mjs';
import { assertInvariants, transition } from './world.mjs';
export class Journal {
  #state; #genesis; #events = []; #head;
  constructor(genesis) {
    assertInvariants(genesis); this.#genesis = clone(genesis); this.#state = clone(genesis); this.#head = hash(genesis);
  }
  get state() { return clone(this.#state); }
  get events() { return clone(this.#events); }
  get head() { return this.#head; }
  get genesisHash() { return hash(this.#genesis); }
  submit(envelope) {
    const { state, event } = transition(this.#state, envelope);
    const record = { sequence: this.#events.length + 1, previous: this.#head, envelope: clone(envelope), event, stateHash: hash(state) };
    const entry = { ...record, hash: hash(record) };
    this.#state = state; this.#events.push(entry); this.#head = entry.hash;
    return clone(entry);
  }
  export() { return { v: 1, genesis: clone(this.#genesis), events: this.events, head: this.#head }; }
  static restore(bundle, trustedGenesisHash, trustedHead) {
    fields(bundle, ['v', 'genesis', 'events', 'head']);
    demand(bundle.v === 1 && hash(bundle.genesis) === trustedGenesisHash, 'UNTRUSTED_GENESIS');
    demand(Array.isArray(bundle.events) && bundle.events.length <= 100_000, 'BAD_JOURNAL');
    const result = new Journal(bundle.genesis);
    for (const recorded of bundle.events) {
      const replayed = result.submit(recorded.envelope);
      demand(hash(replayed) === hash(recorded), 'JOURNAL_MISMATCH');
    }
    demand(result.head === bundle.head && result.head === trustedHead, 'CHECKPOINT_MISMATCH');
    return result;
  }
}
