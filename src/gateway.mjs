/** Host-neutral identity with host-specific login challenges. Two instances may serve one lab
 * journal. This demonstrates gateway failover, NOT independent validation or a live federation.
 * Session tokens provide identity context; every economic action still needs its own signature.
 */
import { randomBytes } from 'node:crypto';
import { clone, demand, fields, hash, text } from './canonical.mjs';
import { verifyPayload } from './identity.mjs';
export class Gateway {
  #journal; #challenges = new Map(); #sessions = new Map(); #now; #online = true;
  constructor(journal, audience, now = () => Date.now()) {
    const url = new URL(audience);
    demand(['http:', 'https:'].includes(url.protocol) && url.origin === audience, 'BAD_AUDIENCE');
    this.#journal = journal; this.audience = audience; this.#now = now;
  }
  close() { this.#online = false; this.#challenges.clear(); this.#sessions.clear(); }
  #check() { demand(this.#online, 'HOST_OFFLINE'); }
  #prune() {
    const now = this.#now();
    for (const [k, v] of this.#challenges) if (v.expiresAt <= now) this.#challenges.delete(k);
    for (const [k, v] of this.#sessions) if (v.expiresAt <= now) this.#sessions.delete(k);
  }
  challenge(principal) {
    this.#check(); this.#prune(); const state = this.#journal.state, identity = state.identities[principal];
    demand(Object.hasOwn(state.identities, principal), 'UNKNOWN_PRINCIPAL');
    demand(this.#challenges.size < 500, 'CHALLENGE_LIMIT');
    const challenge = { v: 1, world: state.world, audience: this.audience, principal, epoch: identity.epoch,
      nonce: randomBytes(32).toString('base64url'), expiresAt: this.#now() + 60_000 };
    this.#challenges.set(challenge.nonce, challenge); return clone(challenge);
  }
  login(challenge, signature) {
    this.#check(); this.#prune(); fields(challenge, ['v', 'world', 'audience', 'principal', 'epoch', 'nonce', 'expiresAt']);
    const saved = this.#challenges.get(challenge.nonce);
    demand(saved && hash(saved) === hash(challenge), 'CHALLENGE_INVALID');
    const identity = this.#journal.state.identities[challenge.principal];
    demand(identity && identity.epoch === challenge.epoch && challenge.audience === this.audience, 'STALE_LOGIN');
    demand(verifyPayload('OATRIX-LOGIN-1', challenge, signature, identity.publicKey), 'BAD_SIGNATURE');
    demand(this.#sessions.size < 500, 'SESSION_LIMIT');
    this.#challenges.delete(challenge.nonce);
    const token = randomBytes(32).toString('base64url');
    this.#sessions.set(token, { principal: challenge.principal, epoch: identity.epoch, expiresAt: this.#now() + 300_000 });
    return { token, principal: challenge.principal, expiresAt: this.#sessions.get(token).expiresAt };
  }
  session(token) {
    this.#check(); this.#prune(); text(token, 100); const session = this.#sessions.get(token);
    demand(session && this.#journal.state.identities[session.principal]?.epoch === session.epoch, 'SESSION_INVALID');
    return clone(session);
  }
  submit(token, envelope) {
    const session = this.session(token);
    demand(envelope?.body?.principal === session.principal, 'SESSION_PRINCIPAL');
    return this.#journal.submit(envelope);
  }
  /** Root/delegate signed envelopes are also directly relayable; host sessions cannot add authority. */
  relay(envelope) { this.#check(); return this.#journal.submit(envelope); }
  snapshot() { this.#check(); return { head: this.#journal.head, state: this.#journal.state }; }
}
