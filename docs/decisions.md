# Confirmed decisions and architecture records

Status date: 13 September 2026. The latest founder decisions override conflicting recommendations in the earlier green papers. Proposed engineering choices below do not silently settle production policy.

## Confirmed by the founder

| Decision | Consequence |
|---|---|
| Participants may use any compatible host | Identity, keys, citizenship and ownership do not belong to a node; a host can still refuse to provide its own service. |
| Storage may be separately contracted or self-managed | Online replication, offline cold backups and deliberate risk of real loss are legitimate choices. |
| Eventual use case is unknown | Start with a creation environment grounded in industrial inputs/capacity, not a forced software-market business model. |
| Bounded deterministic experiments are valid | A non-chain laboratory can test rules before constructing expensive infrastructure. |
| Leases follow agreed terms; freehold implies durable ownership | Never silently apply lease expiry to freehold title. Separate renewable public placement from title. |
| Dormant deployments may relinquish placement without destroying the creation | A returning owner reasserts at a presently available, newly agreed location; no automatic eviction of a successor. |
| Failed providers need not be automatically bailed out by unrelated providers | Make contractual exposure explicit. This is an internal risk-allocation goal, not established legal immunity. |
| Secret content should eventually be possible below the UI | Public-state pilot first; confidential execution and encrypted storage remain distinct future problems. |
| Founder override remains until safe handover is demonstrated | No invented expiry date. Publish intervention and centralisation; define exit evidence. |
| Responsibility and bounded pilot implementation are accepted | No production launch, legal clearance or token offering is inferred. |
| Direct work in hoyleg/oatrix now | Do not invoke OpenClaw/Hermes or spend on model-driven builds in this bootstrap. |

## ADR-001 — P0 deterministic laboratory before P1 ledger

**Decision:** Node.js 22+ ESM, standard library only, pure reducer plus signed-command journal. This can run locally without dependency installation. The browser console is plain HTML/CSS/JavaScript.

**Reason:** Make the invariants executable now, with zero inference and service spend. Multi-node consensus is not needed to discover a material-accounting bug.

**Consequence:** This is not the Besu implementation proposed in v0.5. Besu/QBFT remains the selected first ledger integration experiment, not an installed component. Differential state-transition tests against P0 must precede a claim of implementation parity. No final production-language choice is implied.

## ADR-002 — Portable principal, scoped host login

A stable principal maps to versioned authority, independently of node accounts. Host challenges bind audience, world, principal, nonce, epoch and short real-time expiry. Economic commands instead bind world, principal, controller epoch, action, arguments, nonce and logical validity. A host token alone cannot authorise a transfer.

P0 uses known fixture identities. Production needs independently verifiable identity state, secure signing outside an arbitrary host UI, recovery, issuer policy and key agility. WebAuthn credentials are relying-party scoped: arbitrary unrelated hosts cannot be assumed to share a passkey. See sources.

## ADR-003 — Four separate kinds of persistence

1. Authoritative title and economic state are common protocol responsibilities.
2. Content bytes live with selected providers or the owner.
3. Hosting is a priced service, not an automatic consequence of title.
4. Active placement follows an explicit lease, freehold or separate access/frontage licence.

Cold restoration never rolls back authoritative state. Loss of every content copy and required decryption key can be final even while title remains. Cold copies of global ledger state must not be presented as current merely because their hashes are internally consistent.

## ADR-004 — Dormancy is not destruction

P0 lease expiry clears a placement pointer; it leaves asset ownership and content digest intact. Freehold placement does not expire by inactivity. A later design can make public discovery/frontage revocable, but must label that right separately from permanent parcel title. The exact production prioritisation for reactivation is unresolved.

## ADR-005 — Money accounts for exchange, not self-reported effort

Pilot U has a fixed disclosed test supply. Extraction moves defined raw reserves. Manufacturing preserves embodied materials. Commission payments and service receipts transfer existing U. A settlement levy is not a profit tax. Fractional levy carry prevents one payer avoiding a levy by splitting a receipt into tiny pieces.

Production issuance, market convertibility, reserves, founder allocation and financial regulation are NOT fixed. Spending on a useless artefact does not establish its value. The pilot's commission acceptance and customer purchases are scripted.

## ADR-006 — Bootstrap authority with evidence-based retirement

The founder retains an explicit safety role for an unknown period. Inside P0 this includes pause/resume with reasons, bounded treasury transfers, manual logical time and final release-receipt recording after independent-identity approval. All are journalled. There is no generic seize/mint/rewind action.

This is narrower than the founder's actual ability to change a deployment. Emergency recovery outside these APIs must publish what changed and whether history/reset rights were affected. This is a centrally governed bootstrap, not a trustless democracy.

Exit evidence: independent operators; replicated recovery without founder access; tested incident handling; review capacity independent of the founder; a working successor clock/upgrade authority; clear contracts and reserves for common obligations. The retirement action is tested only on disposable state. It must not be invoked on an operating network without those successors.

## ADR-007 — Failure liability is not mutual insurance by default

Separate direct prepayment, escrow, delivery acceptance, unused balances and optional insurance. P0 returns only unspent escrow after its deadline. Acknowledged payments are not confiscated from a provider or socialised to other providers. This does not decide consumer claims, fraud liability, the platform's own duties or cross-border jurisdiction. Obtain qualified advice before actual value or customers are involved.

## ADR-008 — Source openness and production commitments remain decisions

No software licence has been chosen on the founder's behalf. Public visibility is not described as open-source licensing. Do not lock in irreversible monetary promises, external deployments, validator economics or property sales during this test bed.

Primary technical and legal references are in [sources](sources.md). Their capabilities do not certify this implementation.
