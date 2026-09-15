# Verification — P0.5 storage candidate

The candidate is independent of the unmerged signer correction: its parent source is main tree `fceca6f22bc043fc6d5e25be9f1bb9f178503e8f` at remote commit `47d695427220cccc968369cd74288dd613ff78c4`. The local reconstructed baseline matches that tree exactly. No economic/authority reducer or existing assertions were changed.

## Executed locally

On Node 22.16.0/Linux, `npm run verify` passed **186 unit/integration tests and 12 separate process-level E2E tests**, all prior generated action cases, demos, all 36 sweep runs/reproduction and static export. The storage contribution adds 21 unit/integration cases and four fresh-process cases. Symlink and hard-link cases executed locally; Windows may skip symlink creation only when the runner account lacks OS permission, and any such skip must be reported.

The ownership check was temporarily disabled: the seller-restoration regression failed. The mutation was reverted, and verification rerun. No weakened assertions, removed adversarial scenarios or extra dependencies were used.

The storage demo actually creates a material-funded plaque through signed commands, retains encrypted copies and a separate demo key, deletes both online copies, and preserves an expired lease's successor while restoring content. A separate process starts AFTER the producer exits, restores a journal from externally supplied expected hashes, and recovers bytes. Other process tests reject corruption/wrong checkpoints, simulate key loss and race two quota-limited writers.

Default comparison hash remains `1886a5aaecdd2b9058469d180be45dd324b894293f4186d86e32aa24caa6888f`. Cryptographic randomness means storage file hashes differ by run; this is intentional, not a failed deterministic ledger check. Ciphertext length is not reported as unique plaintext size. No browser/UI change or new browser inspection is claimed.

The exact final source tree and remote CI results are recorded on the PR after publication. A configured CI matrix is not evidence that it executed. Author testing and mutation checks are not independent review.

## Boundaries still open

This is content persistence, not a durable authoritative server, consensus, provider-payment system or deployment endpoint. No supplied private data, real keys, paid services, KYC or licensing decision was involved. The demo uses public fixture content and disposable demo encryption keys. No production assurance, SLA, liability determination or data-loss compensation is implied.
