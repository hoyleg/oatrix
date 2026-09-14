# Verification — scoped work candidate

Author verification only. Fresh review of the integrated candidate remains required before merge. Node 22.16.0/Linux locally; no dependencies installed, paid models, external services or deployment.

## Executed

`npm run verify` passed with **165 unit/integration tests and eight separate process-level HTTP E2E tests**, seven archived event scenarios, the isolated work-grant demo, all 36 parameter comparisons with exact reproduction, and static export. The earlier 2,500 generated candidates remain; the new grant tests add 1,000 candidates (20 seeds × 50 actions). No earlier invariant or adversarial test was removed.

The 31 new unit/integration tests cover strict scope validation, exact references, counters, cancellation/dismantling, zero fees, failed admissions, role escalation, races, revocation/expiry/regrant, rotation, machine sale, independently authorised overlapping grants, malformed persisted counters, legacy grants, replay and the executable demo. Two new E2E workflows use actual child-process hosts and HTTP with no direct state mutation.

One existing version-discovery test now uses unsupported version 4 instead of 3. This is the explicit addition of v3 vocabulary, not a weakening of v1/v2 checks. v1/v2 reject `delegateWork`; the ordinary fixture stays v2.

A temporary mutation removed the material input-cap check. The targeted rejection tests failed as expected. The mutation was reverted, the targeted suite passed again, and final integrated verification was rerun before publication. This is a targeted test-sensitivity check, not an exhaustive mutation score.

## Compatibility evidence

All pinned v1 traces remain unchanged. Default P0.3 report hash remains:

`1886a5aaecdd2b9058469d180be45dd324b894293f4186d86e32aa24caa6888f`

The repeatable work-demo head is:

`b3327d864a90b8490b79c88dc4cb5915f02492b494fde2ddfa42ef72c57b10c8`

The final Git tree must match the locally verified tree. Remote CI and exact commit/tree are recorded on the PR after publication, rather than inferred from configuration.

## Limits

No new UI was introduced; P0.3's recorded offline presentation check remains the relevant browser evidence. Process HTTP tests are real; no independent validators, durable restart or live browser-signing path is claimed. Existing grant semantics and post-grant obligations remain as stated in `docs/work-mandates-v0.1.md`. These are experimental authority rules, not production assurance.
