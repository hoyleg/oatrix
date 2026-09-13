# Security status: experimental only

**Do not use real funds, private data or production credentials.** The HTTP server is a loopback-only development service using publicly known deterministic test keys. The Ed25519 signatures are genuine cryptographic checks, but the fixture identities are intentionally NOT secret or trustworthy. They are not post-quantum.

## Trust boundaries and known limitations

- One in-memory writer orders commands. Hash chaining and replay are not consensus, fault tolerance or independently guaranteed history. Recovery requires a trusted genesis and a separately retained current checkpoint.
- Both local gateways share that writer. A malicious writer can censor or fork history; a malicious host can lie about a read. The CLI trusts its local fixture environment.
- Identity admission, unique-person assurance, KYC, real recovery and external-wallet UX are not implemented. Node control is not membership independence.
- The founder can pause/resume and issue public-fund commission payments in the model. Maintainer control of deployed code is a broader out-of-model power. Do not claim the model prevents a software operator replacing the model.
- Pause stops logical time and therefore affects job completion, leases and escrow expiry. Production needs an explicit wall-clock/emergency policy. `retireFounder` is an irreversible lab experiment that also disables the current clock; do not use it before providing a successor clock/governance mechanism.
- The content adapter is in-memory, unencrypted and has no availability guarantee. A former holder can keep copied bytes; restore ownership checks do not implement DRM or erase backups. Private rooms, operator confidentiality and secret economic execution are future work.
- A receipt proves signatures and accepted settlement terms, not actual inference, storage or quality. Colluding parties can sign lies. No call-based subsidy or automatic useful-work mint exists.
- Explicit actions can be valid and still foolish. Permission checks do not solve persuasion, prompt injection, hidden coordination or bad review. The evidence notebook only groups declared derivations.
- One job per principal is an experimental capacity quota, not a proof of real work or robust Sybil resistance. Raw locations are public, and no genuine secret exploration is claimed.
- No arbitrary code execution, WASM runtime, external bridges, network-supplied plug-ins or automated release installation is implemented.
- HTTP origin/host checks, body limits, nonce checks and local rate limits reduce specific errors. They are not a production API-security claim. Do not tunnel the server publicly.
- Genesis configuration is an explicitly trusted laboratory fixture, not an untrusted user-editable production genesis format. Economic experiments use fixed rules and public keys.

## Required assurance before public use

Independent security review; production key custody/recovery and issuer policy; real validator fault tests; durable state/availability guarantees; encrypted content and deletion policy; explicit failure and dispute contracts; malicious UI/signing analysis; supply-chain and migration review; financial/legal assessment; incident contacts and response arrangements.

## Reporting

There is no production bounty programme or promised response SLA. Do not publish private keys, customer data or an actionable exploit against a real deployment in a public issue. For this fixture-only lab, a minimal reproducible failing test is useful. Establish a private reporting channel before production or handling confidential reports.
