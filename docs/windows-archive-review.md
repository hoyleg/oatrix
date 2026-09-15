# PR #9 — Windows file-identity correction

## Reported failure and diagnosis

The fresh review at f39938e32c79b93786a11c700e1b94d68a473273 reported six
`ARCHIVE_CHANGED` failures on Windows during ordinary put/usage/get operations.
This blocks integration even though earlier Windows CI passed. Review:
https://github.com/hoyleg/oatrix/pull/9#issuecomment-5683239887

A known Windows/libuv distinction is consistent with this symptom: path-based
stat can report device 0 while an open handle reports the volume serial. The
review did not include the raw metadata, so do not pretend to have reproduced
that exact workstation. A new probe logs Node, libuv, OS and both metadata values.

## Correction, not deletion of the safeguard

- Read path/handle identity as BigInt, avoiding rounded 64-bit file IDs.
- In `pathMatchesHandle`, require a regular non-linked file, matching nonzero
  file ID and matching bounded size. Devices must match EXCEPT for Windows
  path dev=0. This exception is directional and is never applied to POSIX or
  two open handles. Different nonzero device IDs remain an error.
- Before returning bytes, recheck the path and a second open handle. Compare
  both handles strictly by device, file ID, size and single-link status, and
  also recheck the reading handle. Keep the ciphertext hash/frame validation.
- Existing path containment, symlink/hard-link refusal, quota, immutable-file
  and corruption checks remain. No test is weakened or skipped to hide the bug.

Pure metadata regressions cover the exact dev=0/nonzero failure shape and IDs
above 2^53. The same real filesystem tests run on each CI OS. Those unit cases
are synthetic metadata, not a substitute for native Windows execution.

## Bounds and trust

The directory owner/OS is trusted, as before. This is not a kernel capability
sandbox, and racing filesystem administrators remain outside the promise.
A backend exposing incompatible nonzero IDs, zero file IDs, or unsupported
link semantics still fails closed. A second handle and bigint do not remove
these OS trust assumptions. No format, cipher, restore authority or ledger
semantics change.

## Source basis

Node 22.16 filesystem Stats/BigIntStats:
https://nodejs.org/download/release/v22.16.0/docs/api/fs.html

libuv Windows file metadata implementations (path and handle routes):
https://github.com/libuv/libuv/blob/v1.49.2/src/win/fs.c

A public concrete reproduction of path dev=0 versus handle volume serial:
https://github.com/affaan-m/ECC/issues/2626

## Required check before merge

Re-run the existing archive tests and `npm run verify` on the Windows setup
that reported the failure; include `node scripts/fs-probe.mjs`. Review the small
file-identity delta as well as confirming that signed restore/ciphertext checks
remain unchanged. Post a focused result on PR #9. No manual merge/conflict
resolution, credentials or service setup is required. Integration with reviewed
PR #8 is already performed on this candidate, preserving both CI/script suites.
