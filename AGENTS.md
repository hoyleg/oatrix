# Instructions for contributors and coding agents

## Mission and boundaries

Build Oatrix incrementally as an industrial shared-reality laboratory. Preserve the confirmed decisions in `docs/decisions.md`; the eventual dominant use case is OPEN. Do not quietly turn the project into a token sale, generic content-generation farm or an autonomous government.

Work directly on a bounded issue/PR. Do not launch OpenClaw, Hermes, cloud coding agents, recurring jobs, paid models or extra agent swarms without explicit authorisation. No background monitoring, token-consuming schedules or service purchases are part of this bootstrap.

## Engineering rules

1. The reducer has no network, model calls, wall-clock reads or random choices. Logical time is explicit. Use bounded integers and canonical encoding; no floating-point economic state.
2. Preserve total settlement units, including escrow, and raw-material accounting, including work in progress and embodied assets. Production is not monetary issuance.
3. Verify authority independently of login hosts and model output. Never accept a caller-supplied principal name, role, karma or text claim as authorisation.
4. Do not put credentials, private agent memories, real identities or private content on the ledger. Never send a private signing key to a host.
5. A cold backup restores permitted bytes only. It cannot restore old balances, resurrect spent inputs, rewind title or steal an occupied location.
6. Freehold title and renewable placement are different promises. Do not expire freehold by reusing lease rules.
7. Approved manifests bind exact artefacts. A PR, role prompt, test badge or signing key does not prove efficacy or probity.
8. Keep secrets out of untrusted PR execution. No `pull_request_target` checkout of contributor code. CI gets read-only permissions; preserve pinned action revisions.
9. No third-party runtime or development dependencies without an explicit reviewed decision. The first lab must run with Node alone.
10. Never claim decentralisation, production privacy, post-quantum security or an independent review that did not happen.

## Required checks

Run `npm run check`, `npm test`, `npm run demo`, and `npm run build:web`. Add regression tests for changed semantics and failure modes. Review the generated console where UI changes occur. Inspect the final integrated diff, not just an earlier patch.

If a test fails, investigate. Do not weaken invariants, remove adversarial cases or increase a limit merely to make your candidate pass. Record any test-policy change separately for human review.

## Handoff

Report the scope, files changed, actual commands and results, material caveats, and one concrete next bounded step. Label proposals as proposals. Do not merge a critical change merely because you authored and tested it. Future high-impact contributions need review by a different accountable control group.

Do not alter repository permissions, branch protection, licensing, monetary issuance, founder rights or external deployments without specific authority. GitHub governance is not yet enforced by the in-world approval model.
