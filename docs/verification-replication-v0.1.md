# P0.7 verification record

Author verification, not independent approval. Candidate is based on exact reviewed P0.6 source tree `82650ab0fc5eea71715ddc069728e6a79efe56ff` / commit `e6bc135fc5519bd83c7244bd1020bd6b175ed496`. Local Node 22.16.0/Linux. No dependencies installed, model calls, real credentials, service purchases or external deployment.

## Executed locally

- Syntax checks passed.
- `npm test`: 231 unit/integration tests, 231 passed, no failures/skips.
- `npm run test:e2e`: 28 separate process tests, all passed, no skips.
- Existing deterministic demos and the new `demo:replication` completed.
- All 36 economic comparison results reproduced exactly; report hash remains `1886a5aaecdd2b9058469d180be45dd324b894293f4186d86e32aa24caa6888f`.
- `npm run build:web` passed separately.
- `node --test test/replication.test.mjs e2e/replication.e2e.mjs`: 30 targeted cases passed (24 unit/integration and 6 subprocess cases).

The aggregate `npm run verify` was attempted twice but the execution environment cut off at the final static-build stage. It is NOT recorded as a completed exit-zero local invocation. Its earlier stages passed; the final build was then run and passed separately. Native CI results are reported on the PR only after execution.

A temporary mutation removed the exact target-head check from durable suffix import. The valid-but-differently-ordered-fork test failed as intended. The mutation was reverted and all 30 targeted tests rerun successfully. No existing assertion was removed or relaxed.

## What the new tests establish

Separate processes use separate database directories. A follower accepts a whole verified suffix, can serve that suffix to another follower after the original source is killed, and retains it after restart. Exact receipt lookup survives. Source loss never promotes a replica to a writer.

Hard-kill cases cover before and after whole-suffix COMMIT. The destination has either its earlier checkpoint or the entire new target, never an accepted first-page prefix. Repeated catch-up to an installed target is a no-op. An uncertain COMMIT invalidates the instance until reopening. Current jobs, an asset sale, root rotation and old signature rejection are exercised.

Adversarial cases cover replayed/reordered/altered records, valid alternative ordering with equal balances, foreign genesis, target/base substitution, source rollback/unavailability, a bad later HTTP page, streamed body overrun, bad content type/JSON, deadline, cross-origin redirect, source URL credentials/paths, concurrent local writes, quota failures, and direct/HTTP replica mutation rejection. Protocol export is opt-in and query keys/bounds are checked.

No new UI was added or browser testing claimed. Existing scenes are still archived examples, not a live ledger dashboard. Loopback HTTP and filesystem process tests are real. This is not real-world WAN, NFS, physical-power-loss, hostile OS, production wallet, cryptographic audit or consensus evidence.

## Review brief

Review the exact PR head against `e6bc135fc5519bd83c7244bd1020bd6b175ed496` in a separate worktree. Read `AGENTS.md` and `docs/replication-v0.1.md`. Run `npm run verify` and `npm run demo:replication` using Node 22.16+.

Challenge trusted-target provenance, all-or-nothing import, current-base recheck, signed-event/sequence/effect validation, malformed or huge responses, redirects/deadlines, poisoned commits and hard-kill recovery, read-only role enforcement, stale views and competing sync processes. Check that a source cannot select its own canonical target or grant itself economic authority. Distinguish owner-controlled software/configuration from adversarial network data. Add minimal counterexamples without weakening old tests. Report exact commit, commands/results, findings by severity and residual assumptions. Do not merge this new critical change solely because its tests pass.

PRs #9 and #10 received no-defect fresh reviews. A connected-tool safety block prevented the attempted PR #9 merge during this delivery; main was not changed through another path. This new candidate is stacked on #10's reviewed source, not silently integrated into main.
