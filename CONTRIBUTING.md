# Contributing to Oatrix

The bootstrap is deliberately small enough for a human to inspect. Read the current decisions and security limitations before expanding it.

## A bounded contribution

Describe the question or invariant, the intended change, excluded work, acceptance tests and the maximum required services/budget. Prefer a small vertical slice over a large list of scaffolds. Opening an issue does not authorise paid infrastructure or agent spending.

Use a branch and PR. Include test output and a clear statement of whether execution was local, on CI, or not performed. Commit only source and deliberately chosen fixtures; `.oatrix/` and `dist/` are generated. Do not submit private model transcripts or provider credentials as test evidence.

## Review and release

Commissioning, source integration, release approval and activation are separate operations. A change to a voting rule can be more consequential than thousands of lines of UI. Classify by effect, not diff size.

For critical transitions, require a distinct accountable reviewer and evidence for conservation, permissions, replay, migrations and rollback limitations. The author must not quietly edit away its own acceptance gate. A released manifest identifies source, build, tests and migration; changed evidence invalidates the relevant approval.

The bootstrap author self-tested this initial implementation. It has not had an independent security audit. In-world release records are demonstrations and do not control GitHub merges or install executables.

## Permissions and licence

The founder has not selected the repository licence or inbound contribution terms. Discuss proposed external contributions before granting rights or submitting significant third-party material. Do not mislabel the project as open source or import code with incompatible/unreviewed terms. See `LICENSING.md`.

## Conduct and reports

Treat other contributors as accountable people, not votes to farm. Do not flood issues or reviews with duplicated agent output. Report exploitable issues without posting real secrets or personal information; see `SECURITY.md` for the current absence of a production security-contact commitment.
