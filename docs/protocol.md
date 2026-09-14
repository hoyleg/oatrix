# Laboratory protocol: envelope v1, rules v1/v2

This is an executable-specification protocol, not a reviewed network standard. The complete vocabulary is `actionFieldsFor(state.v)` in `src/world.mjs`: it returns action names and exact argument fields for that rules version. `actionsFor(state.v)` returns names only; the legacy `ACTIONS` export remains v1-only for compatibility. `GET /api/protocol` publishes the active vocabulary. Command-envelope `v: 1` is independent of rules/state `v: 2`. Tests exercise both accepted and rejected cases.

## Command envelope

```json
{
  "body": {
    "v": 1,
    "world": "oatrix-lab-v1",
    "principal": "alice",
    "controller": "root",
    "epoch": 1,
    "nonce": 1,
    "expires": 100,
    "action": "transfer",
    "args": { "to": "bob", "amount": 10 }
  },
  "signature": "<Ed25519 base64url signature>"
}
```

Sign `OATRIX-COMMAND-1`, newline, and the restricted canonical JSON of `body`. Economic commands have no gateway audience: a correct command is relayable through any host on this world. Login uses the separate `OATRIX-LOGIN-1` domain and a host audience. Service provider receipts use `OATRIX-SERVICE-1`.

Canonical data uses sorted object keys, bounded nesting, integers, strings, arrays, booleans and null. No NaN, infinities, negative zero, dates, prototypes or undefined. This is not RFC 8785 and must not be silently replaced by an incompatible serializer. No current command accepts floating-point economic quantities. Keys use Node's Ed25519 SPKI DER import/export; signatures are not quantum resistant.

`nonce` increases per principal/controller/epoch. Regranting a delegate uses a new monotonically assigned epoch. Root rotation increments its epoch and clears delegates. Expiry in an economic command is logical time; login expiry uses the host's real clock. These different semantics are intentional in P0 and require explicit production review.

## Principal and controller permissions

Root authority is bound to a stable genesis principal, not a provider username. Delegates can be granted only a subset of `transfer`, `startJob`, `buy` and `settleService`, with expiry and a cumulative **currency** spending cap. This legacy grant does not cap material inputs, restrict recipe/provider/machine choices, or guarantee a useful outcome. Do not treat a small U budget as a material-safety boundary. A separate scoped-grant extension is required before untrusted production workers. They cannot delegate further, rotate the root, approve a release, pause the world or transfer asset title directly. A human takes control by revoking the relevant delegation; prior finalised obligations remain.

A login session supplies identity context but cannot create a valid command signature. Direct signed relay remains possible without a session. Hosting, root control, real-world identity and citizenship are not assumed to be the same thing.

## Economic and industrial actions

| Action | Important checks/effect |
|---|---|
| `transfer` | Positive integer amount, sufficient funds, authority; no automatic sales levy on a generic transfer |
| `commission` | Founder accepts a named digest and reason; transfers existing treasury units; subjective acceptance is not independently proved |
| `startJob` | Unique ID, available principal capacity, known recipe, exact provider terms hash, inputs/reserve and funds |
| `advance` | Founder-only P0 clock; 1–100 ticks; finishes due jobs and expires placements/offers deterministically |
| `deploy` | Current owner, free asset/slot, exact terms hash, lease term/rent or matching freehold ownership |
| `undeploy` | Current owner; clears placement, not title or materials |
| `offer` / `buy` | Lock a non-deployed asset, exact current offer digest, atomic ownership and settlement; expiry and duplicate protection |
| `openService` | Payer reserves a maximum budget for a named provider, terms digest and deadline |
| `settleService` | Payer's command and provider's receipt signature, matching world/terms, unique request ID, remaining escrow and mandate cap |
| `refundService` | Payer retrieves only unused escrow at/after deadline; already acknowledged payments stay paid |

The provider choice for primitive jobs is from a genesis table, not a live marketplace or performance attestation. The service contract begins with payer-selected bounded terms; provider acceptance occurs through its receipt. No provider is deemed bound to supply service merely because a stranger opens escrow naming it. Key rotation means outstanding receipts need the provider's current accepted key in this pilot; historical key-attestation policy is deferred.

Currency conservation includes escrow. Raw conservation includes reserves, loose inventory, unfinished jobs and materials embodied in completed assets. Levies use integer arithmetic with per-payer fractional carry. A sale levy is not profit taxation; direct/off-platform transactions create avoidance and classification questions not resolved by this lab.

## Property and content

Title identifies the current owner and content digest. The digest is not the bytes and does not prove availability. Leases expire at the recorded tick and clear occupancy; assets remain dormant. Freehold is not automatically expired. Restoration verifies current association before storing content, but does not prove licences or prevent people retaining copied bytes.

An asset locked for sale cannot be deployed or offered twice. Selling a currently deployed asset is intentionally disallowed until it is undocked; the pilot avoids silently assigning an existing tenancy to a buyer.

## Governance receipts and founder intervention

`pause` and `resume` require the founder's authority and a published reason. The pause freezes normal activity and logical time. Key rotation/revocation and release-receipt actions remain available. It does not give a new seizure, arbitrary mint or state-rewind API.

`proposeRelease` binds source, artefact, tests and migration digests. `approveRelease` requires a separately admitted reviewer who is not the author. `recordRelease` requires an exact manifest match, review and founder authority. It does NOT execute that artefact. No automatic GitHub merge, binary download or code loading exists.

`retireFounder` is irreversible within the current protocol but leaves no successor clock in P0. It is an experimental terminal handover condition, not an operator step for the running lab.

## HTTP surface (loopback development only)

- `GET /api/protocol`: world, state/rules version, envelope version and exact action fields.
- `GET /api/health`, `/api/state`, `/api/events?after=0`: public fixture state and paginated events.
- `POST /api/challenges`: `{ "principal": "alice" }` returns a short-lived audience-bound challenge.
- `POST /api/sessions`: `{ "challenge": ..., "signature": ... }` returns an opaque host-local token.
- `POST /api/commands`: signed envelope; optional `Authorization: Bearer <token>` additionally checks session identity.
- `GET /`, `/index.html`, `/app.mjs`, `/style.css`, `/report.json`: read-only experiment viewer.
- `GET /sweeps.html`, `/sweeps.mjs`, `/sweeps.json`: optional read-only precomputed comparison report; no submission endpoint or live economy mutation.

All POSTs require JSON. Requests are capped at 32 KiB, with host/origin checks and a simple local mutation rate limit. The service returns structured rule error codes, not internal stack traces. There is no TLS termination, production authentication UI, general blob API or private-data endpoint.

## Rules v2 industry and CLI references

Rules v2 adds `publishRecipe`, `cancelJob`, `dismantle`, and replaces the `startJob` fields with `id`, `recipe`, `machine`, `provider`, `termsHash`. See `docs/machinery-v0.2.md` for semantics. Signed jobs always carry an exact recipe digest; a name is never authoritative.

The public-fixture CLI resolves an existing digest before a unique recipe name. `hash:<digest>` requires an existing digest; `id:<name>` forces name lookup. Thus a legal 64-character hexadecimal recipe name is supported, and collisions or duplicate names can be resolved explicitly rather than guessed.

## Experimental rules v3 (review candidate, not default activation)

`actionFieldsFor(3)` adds `delegateWork`. Its exact fields and cumulative work-only permissions are specified in `docs/work-mandates-v0.1.md`. Rules v1/v2 keep their previous vocabularies, semantics and histories; no implicit migration is implemented. Default server/comparison fixtures remain v2. `workMandateGenesis()` explicitly selects v3. A legacy `delegate` grant stays U-only; integrations must not silently fall back to it when material-aware delegation was requested.
