# Architecture and data placement

## P0: implemented, single-writer laboratory

```text
Owner / human / agent controller
        | signs exact actions using a locally held key
        +-------------------+-------------------+
        |                   |                   |
   HTTP host A         HTTP host B        direct Journal API
   login audience A    login audience B
        +-------------------+-------------------+
                            |
                  Signature + policy checks
                            |
                  deterministic transition
                            |
            one in-memory hash-linked journal
                            |
            public lab state / replay / console

Separate from that journal:
  ContentStore A -> offline content bundle -> ContentStore B
  Agent memory / model calls -> not implemented, not on-chain
```

The pair of hosts demonstrates interchangeable access paths, not independent validators. The API checks signed actions again even when a session exists. A failed gateway is replaceable because it does not own the account record. A malicious gateway's read responses are not independently authenticated by the browser in P0.

## Where data resides

| Data | P0 location | Production direction |
|---|---|---|
| Principals, authority versions, balances, scarce inventory, title | Journal state in memory | Replicated authoritative ledger with recovery commitments |
| Commands and state hashes | Journal; `.oatrix/journal.json` when explicitly exported | Durable journal plus verifiable checkpoints and retention policy |
| Lease terms, occupancy, offers, escrow, release receipts | Journal | Authoritative, versioned policy and commitments |
| Model prompts, memories, private keys | No model runtime; fixture keys are public test material | Owner-controlled runtime or explicitly trusted agent host; never the public ledger |
| Geometry, scripts, documents, textures | Separate in-memory content adapter | Chosen online providers, content-addressed packs, encryption and cold copies |
| Static experiment viewer | `web/`; generated `dist/` | Any static host, including Cloudflare; independent of authoritative identity |
| Operational indexes and search | Derived directly in the small lab | Rebuildable index services, never an alternative source of ownership truth |
| Privacy-sensitive identity evidence | Not collected | Minimise and separate from common state; scoped issuer attestations, not universal passport replication |

## Identity independent of nodes does not mean trusted universal login screens

Participants can select compatible gateways; providers can still decline service or set disclosed prices. A host must not silently create a new principal when a returning user changes provider. Root rotation and recovery act on the same principal.

The production client needs a signing component whose trust is separate from a random host's JavaScript. Otherwise a host can display a harmless action and ask for a harmful signature. Host-neutral action signing and host-bound login are deliberately different domains. WebAuthn RP scoping must be accounted for; a common signer, wallet or chosen identity service must not accidentally become a compulsory commercial host.

## Industrial state, not narrated outcomes

P0 offers two public raw resources and one manufacturing recipe. Each principal has one active-job capacity slot. Mining reserves one unit and returns it after a logical tick; manufacturing reserves two ore and one wood and completes after three ticks. Both incur disclosed test-service charges chosen from the provider table. Failure is atomic.

This quota is a stand-in for future machines, capacity leases and scheduling. It is NOT proof of electricity consumption, real work or unique humanity. A future machine blueprint does not itself carry free physical resources, unlimited execution or duplicate inventory.

## Transaction and replay boundary

An accepted command produces an event, a post-state hash and a link to the previous journal head. Rejected commands consume neither money nor a protocol nonce. They are not retained in an unbounded authoritative rejection log; an operator can use bounded operational diagnostics instead.

Recovery replays every command under the original rules and compares the trusted genesis and current checkpoint. A self-consistent stale snapshot is not sufficient. Content restore is an entirely different operation and must never import balances or ownership from an old content pack.

## P1: chosen next ledger experiment, not implemented

Use Besu/QBFT on independently operated machines to test ledger-backed ordering and enforceable authoritative transitions. Merely anchoring a trusted server's state hash is NOT parity with validator execution. Specify which predicates are on-chain, what off-chain inputs remain trusted, and how conflicting state is rejected before choosing an adapter.

The first useful P1 test runs the same action traces through P0 and the candidate contracts, compares state, forks/offlines validators and restores without the founder. No fee-token purchase or mining reward is needed for P0; P1 economics remain separate from this unit supply.

## Explicitly deferred

Private economic computation, hidden resource distributions, arbitrary WASM, cross-world bridges, search ranking, real-world KYC, new-member admission, multi-operator consensus, pricing markets, post-quantum migration, anti-censorship availability, wallets and agent hosting. The documents specify boundaries; the code does not pretend these are delivered.
