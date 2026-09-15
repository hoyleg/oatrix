# Bounded implementation backlog

This is an ordered set of work packages, not a promise of background execution. The founder has authorised the current repository bootstrap; no paid hosting, model spend or public token distribution is implied.

## P0 — executable foundations (this bootstrap)

Implemented: deterministic transitions, authority, root rotation/delegation, host-neutral signed relay, primitive industrial jobs, sale/levy/escrow, title versus placement, content backup adapter, replay, safety brake, manifest receipts, reference evidence notebook, local API and six-scenario viewer.

Not claimed: independently secure source, real provider delivery, Byzantine consensus, encrypted storage, economic adoption, a live agent society or production licensing.

## P0.1 — independent review and stronger model boundaries

**Deliverable:** external review of the actual integrated commit, not this author's assurance.
**Acceptance:** new failure tests for raw conservation, escrow/levies, signer epochs, signed-price races, pause semantics, journal replay and restoration; document accepted residual risks. Do not merge code and self-approve the same critical decision.
**Exclude:** changing licence, issuing money, registering real identities or buying services.

## P0.2 — explicit industry and capacity model (implemented, PR #5 merged)

**Deliverable:** versioned declarative recipe definitions and machine-capacity ownership, with deterministically enforced metering and human-readable documentation.
**Acceptance:** copying a blueprint does not copy materials, active capacity or inventory; no production/dismantling loop mints U; generated recipes cannot expand authority; scarcity/demand assumptions are exposed.
**Exclude:** arbitrary native code, new language invention as a prerequisite, open-ended model workers.

## P0.3 — economic and retention sweeps (merged, PR #6)

**Deliverable:** deterministic scenario runner with parameter files, predeclared demand assumptions and machine-readable metrics.
**Acceptance:** compare fees, levy rules, capacity concentration, storage losses and reactivation policies; distinguish accounting validity from artificial demand. Repeated seeds reproduce results.
**Exclude:** claims about market adoption from scripted purchases.

## Scoped-work mandate follow-up — reviewed and merged, PR #7

The PR #5 review confirmed that legacy delegation caps U, not material use. Add a separate, explicitly opted-in work grant for cumulative materials/extraction, recipe/machine/provider scope and admission count. Preserve old replay semantics. Test rejected actions, cancellation/regrant churn, races and key rotation. This is a critical authority change and requires fresh review; do not silently substitute it into the reviewed baseline.

## P0.4 — narrow signer and signed-state approval (reviewed, PR #8 merged)

**Deliverable:** host-neutral identity/authority specification and independent transaction signer with origin-bound login.
**Acceptance:** a hostile gateway cannot substitute a principal, action or destination; key rotation/recovery preserve identity across hosts; passkey RP scope is explicitly handled; no private key is given to a provider; recovery does not create extra citizenship.
**Exclude:** real KYC collection or an assumption that any host can use an unrelated origin's passkey.

## P0.5 — portable encrypted asset packs

**Deliverable:** versioned manifests, encryption/key custody choices, provider-independent import/export and measured cold restores.
**Acceptance:** test byte loss, corruption, version change, sale while offline, key loss, depleted hosting budget and restore elsewhere; no old snapshot restores title or inventory; publish what remains unrecoverable.
**Exclude:** claiming that encryption solves confidential economic validation.

## P0.6 — durable local ledger before federation (review candidate)

**Deliverable:** opt-in SQLite journal using Node's built-in module; exact replay,
explicit initialization/export/recovery, receipt lookup and real process-crash
checks. See `docs/durable-journal-v0.1.md`.
**Acceptance:** acknowledge only after commit; pre-commit loss leaves no payment;
post-commit lost reply is resolvable without a second payment; jobs, title, keys
and nonces persist; wrong minimum checkpoints/corruption fail closed; no reset
or automatic migration. Reconcile every replay to the existing reference model.
**Exclude:** physical power-loss certification, network filesystem guarantees,
Byzantine consensus, private ledger encryption and unbounded retention.

## P1 — Besu/QBFT enforcement experiment

**Deliverable:** selected ledger-backed authoritative transitions with pinned versions and controlled validator keys.
**Acceptance:** identical valid/invalid traces against P0 and contracts; independent operators replay and reject invalid state; partition/crash tests; no exposure of private content; clear handling of off-chain receipts. An anchor-only oracle is labelled as such, not sold as deterministic on-chain enforcement.
**Exclude:** external token sale, proof-of-work issuance, unsolved quantum guarantees.

## P1.1 — contribution and release integration

**Deliverable:** signed manifest policy, repository review gates and an offline verifier that nodes can use before activation.
**Acceptance:** changing source/build/migration invalidates approval; a candidate cannot weaken its own review policy; CI compromise alone cannot authorise new rules; old rules authorise the transition. Founder emergency paths are explicit and audited.
**Exclude:** installing arbitrary PR code on operators automatically.

## P2 — optional funded provider and agent pilots

Only after P0/P1 outcomes justify them: provider offers and measured SLA, usage receipts, bounded model runtimes, human takeover UI and adversarial review. Choose per-run budgets and kill conditions. Real model calls are not necessary just to populate scenes.

## Decisions before an external launch

Software/content/inbound licences; accountable legal structure; production property and lease templates; monetary issuance and convertibility; founder allocation and intervention powers; secure identity/recovery; data and confidentiality obligations; compensated operator roles; supported liability and dispute contracts; independent security and quantum migration review. None should be invented by a coding agent.
