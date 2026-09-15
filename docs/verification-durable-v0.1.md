# Verification — durable ledger candidate

This is author verification, not independent approval. The source is based on
reviewed main **a9ea19fd36cbc65d64bdd033f7c237452ab189ca**, source tree
**4a0bac9c354ab5c399b9fed231a9e4a713b641b0**. It does not depend on unmerged PR #9.

## Implemented test scope

The new suite contains 24 unit/integration cases and eight process/HTTP cases.
It checks explicit creation; old/new envelope replay equality; invalid/stale
atomic rejection; running jobs, manufactured machines and sales; persisted
rotation/revocation; immutable receipt lookup; independent known-prefix checks;
competing connections and processes; limits; corrupted record/schema/metadata;
SQLite contention and ambiguous failed COMMIT; logical restore to a new path;
links; and startup refusing a missing database.

The process tests kill the actual Node child before COMMIT, after COMMIT before
HTTP reply, and after acknowledged work. The first leaves no action; the second
leaves a discoverable committed receipt; the third retains state. None applies
a second payment on retry. Sessions are ephemeral while roots, counters and
ownership persist. They do not emulate a physical disk power failure.

`demo:durable` reuses the black-box process harness to make the two ambiguous-
reply cases runnable without manual server setup. It is a demonstration of the
same implementation, not independent corroboration or a second validator.

## Local execution

Local Node **22.16.0/Linux**, SQLite from the Node runtime, no npm installation or
external services. The integrated suite is **207 unit/integration tests and22
separate process E2E tests**, including all pre-existing cases, demos, all36
comparison reproductions and static output. A full `npm run verify` invocation
was recorded with exit0; an earlier tool invocation timed out during its final
build, rather than being counted as a successful full run. Final source and CI
results are recorded with the exact candidate on the PR.

A temporary mutation replaced the submission COMMIT with ROLLBACK. The actual
acknowledged-command hard-kill/restart test failed, detecting lost acknowledged
state. The mutation was reverted and that test passed again. Old assertions,
nonce/conservation checks and scene checkpoints were not removed or weakened.

During construction, new test fixtures were corrected to supply the recipe's
actual ingredients, and error assertions were made against `RuleError.code`
rather than assuming every human message equals its code. Schema checking was
also made an exact three-object whitelist, including only the expected SQLite
autoindex, with a lookalike-reserved-name trigger rejection test.

Default comparison hash remains:
`1886a5aaecdd2b9058469d180be45dd324b894293f4186d86e32aa24caa6888f`.

The crash demo produces the same accepted one-transfer checkpoint for both
routes: `9b15225141368f2603a95efd910d96cebc796e8d5e58301ab5d1c6b19902d4a8`.

## Native CI and limitations

CI adds Windows Node22.16.0 alongside Windows Node24 and Linux Node22/24; actual
results must be read after execution, not inferred from this configuration.
Platform-specific skipped checks must be reported. Linux execution is not a
claim about Windows. No browser UI changed; HTTP process tests are not claimed
as browser-signing E2E.

No physical power-loss experiment, network-filesystem guarantee, canonical-state
attestation, Byzantine consensus, production signer, autonomous agent, paid
provider or database encryption was implemented. The SQLite interface is
experimental in Node22.16 and remains a bounded laboratory choice. History is
bounded and replay-based; this is not a throughput or scaling benchmark.
