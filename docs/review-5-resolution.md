# PR #5 review disposition

The founder supplied a fresh local review against `6daf80ad6c3bed63c1bbedb8d6f1caa68b2267d1` in PR #5, then explicitly authorised continued implementation and integration until a genuine intervention is required. That review reported 96 tests and six E2E checks passing, no high/medium defect and no conservation/capacity counterexample. A separate Copilot review identified client-discovery defects. These are fresh review passes, not an organisational security audit. Issue #2's broader independent assurance remains open; it is not represented as completed by this note.

## Corrected now

- `actionFieldsFor(state.v)` exposes the exact accepted vocabulary/argument fields; `actionsFor` provides names. `ACTIONS` stays explicitly v1-only for backwards compatibility. Validators and the new read-only `/api/protocol` endpoint use the same immutable vocabulary.
- Fixture CLI resolves existing recipe digests first, then unique names. `id:` and `hash:` prefixes disambiguate; legal 64-hex names now work. A regression runs the real CLI against an HTTP host.
- v2 tick processing no longer walks the legacy job loop after finishing v2 jobs. This removes redundant work without changing accounting or completion order.

## Pilot policies retained, not made permanent

Cancellation returns reserved inputs/extraction reserves, not the already settled admission fee. Machines need not be spatially deployed. These remain the explicit bounded-lab model; no real service or property terms are being issued. The founder's continuation authority permits proceeding with these reversible experiments rather than demanding another decision on each fixture assumption.

Legacy `delegate` budgets limit **U only**, not raw materials, machine access or recipes. Do not give that grant to an untrusted worker and describe it as material-safe. A separate scoped-work mandate should enforce cumulative inputs/extraction, allowed recipes/machines/providers and job admissions, without pretending personality or money limits provide those protections.

Jobs, retired-asset tombstones and the journal remain life-of-world data. No history-pruning policy or production durability is implied. Parameter sweeps must impose their own run/step limits rather than increase protocol bounds.

## Verification of the correction

`npm run verify` passed locally: 101 unit/integration tests, six process E2E tests, seven scenarios and static export. Added five regression tests; no existing test or limit was removed/weakened. Prior 2,500 generated candidates remain. Author self-verification of this small correction is distinguished from the earlier fresh review. Remote CI and final commit/tree are recorded on the PR after publication.
