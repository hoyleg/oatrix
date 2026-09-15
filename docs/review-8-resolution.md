# PR #8 — review correction and verification

The fresh review of `609eaf91349eb3de2d423fa00b48a333455b6014` found a high-severity mismatch between reviewed-head approval and actual submission, a medium-severity private-key validation gap, and an overstated login-epoch claim. Copilot identified the same issues plus missing ciphertext/tag corruption tests. These findings were valid.

## Resolution

- A new signed envelope v2 contains both the exact reviewed journal head and the reviewed state digest, under a distinct signature domain. The journal supplies its actual predecessor to the reducer. No supplied/default context, unsigned head, signature stripping or automatic downgrade is accepted. v1 remains explicitly unpinned; historical v1/v2/v3 world traces are unchanged.
- `PortableSigner` construction requires an actual private Ed25519 `KeyObject`, before retaining the key. Wrong-type and duck-typed values fail at the boundary.
- Documentation now attributes current epoch/key checks on login to `Gateway.login`. The signer checks identity fields, origin, expiry and integer shape but cannot independently discover a current root. Tests explicitly show local stale signing followed by gateway rejection.
- Vault tests now corrupt ciphertext, tag, IV and salt, and reject KDF amplification/oversized encodings. Temporary key/DER buffers are wiped on success/failure as best effort, not a JavaScript secure-memory claim.
- The demo now outputs the accepted journal record hash rather than an undefined event hash. HTTP discovery explicitly lists both envelope versions.

## Actual local verification

Restored the original source tree exactly: `fb18e2dc8f3bfc189fbf5bb0b082239ea7c014fb`. Two reproductions failed against that original tree, then passed after correction. `npm run verify` on Node 22.16.0/Linux passed **183 unit/integration tests and 14 process-level HTTP E2E tests**, all prior generated candidate cases, demos, all 36 comparisons/reproduction and static build.

Tests cover unrelated intervening actions, fabricated state at the same advertised head, pin tampering, signature-domain/version downgrade, absent head context, cross-host races, replay of mixed envelopes, nonce-preserving rejection, explicit reapproval, key types, stale login and vault failures. No earlier assertion was removed. The discovery expectation was extended to include the new version list; this is an intentional API extension.

Comparison hash remains `1886a5aaecdd2b9058469d180be45dd324b894293f4186d86e32aa24caa6888f`. No UI change or new browser inspection is claimed. Node HTTP tests use actual listeners/child processes; the two hosts still share one writer. Remote CI and the precise corrected commit/tree are recorded in the PR, not inferred here.

## Focused delta review before integration

This correction necessarily changes command-admission/signature semantics, not merely prose. Review the corrected commit against the original reviewed commit, particularly `src/world.mjs`, `src/journal.mjs` and the new envelope tests. Confirm that all paths enforce pins, that v2 cannot be reduced to valid v1, and that old traces reproduce unchanged. Passing author tests does not supply this fresh delta review. PR #8 stays unmerged pending it; no production security or independent audit is claimed.

Node crypto API reference (checked 2026-09-15): https://nodejs.org/api/crypto.html — private/public key types, authenticated GCM decryption, and scrypt options. The lab's pinned vault parameters are not a production custody recommendation.
