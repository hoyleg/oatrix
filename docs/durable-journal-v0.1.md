# P0.6 — opt-in durable ledger laboratory

**Status: review candidate, not production deployment.** This extends the lab
with local-disk authoritative history. It does not turn SQLite into a blockchain
or turn two HTTP listeners into independent validators. The existing economic
reducer, identity, nonce, signed-head and material rules are unchanged.

## Why this step exists

Encrypted asset packs preserve optional content. They cannot make acknowledged
transactions, current ownership or revoked keys survive loss of an in-memory
writer. These are different persistence obligations. P0.6 tests the latter,
independently of PR #9's content archive and Windows correction.

Use Node **22.16.0 or later**, with built-in `node:sqlite`. No npm packages, Docker,
database service, model credentials or cloud account are needed. Node 22.16 emits
an experimental SQLite warning; that warning is accurate, not suppressed, and
this is an explicit runtime-floor change from the earlier `>=22` declaration.
A capability check refuses a missing transaction-state API before touching files.

## Operator commands

A fully isolated demonstration needs no preparation and does not touch your
ordinary ledger. It kills its own child processes around the commit boundary:

```sh
npm run demo:durable
```

Each demonstration retains a new `.oatrix/durable-demo/run-*` directory. Its
report shows whether the same signed command committed before the process died,
then shows that recovery/retry applied it exactly once. These are public fixture
identities and disposable test balances, not a user wallet.

To run the persistent lab, first stop the old server with Ctrl+C. Then:

```sh
npm run ledger:init
npm run start:durable
```

`ledger:init` is **once per new directory**. It creates `.oatrix/ledger` and
refuses any existing destination, even an empty one. Restart using only
`npm run start:durable`. A missing/corrupt ledger is an error; startup never
initializes a replacement. The old `npm start` remains explicitly in-memory.
Do not delete a failed ledger to make an error disappear.

The two listeners default to `http://127.0.0.1:8787` and `:8788`. `PORT=0` selects
free ports for tests. The existing browser screens replay fixed scenarios;
**they are not a live editor or a depiction of the durable world's current
state**. `/api/state`, `/api/checkpoint`, `/api/events` and `/api/health` expose
live data. No new browser-signing flow is claimed.

Stop the server before operator maintenance. For an inspectable logical backup:

```sh
npm run ledger:check
npm run ledger:checkpoint -- .oatrix/ledger .oatrix/checkpoint-001.json
npm run ledger:export -- .oatrix/ledger .oatrix/journal-001.json
npm run ledger:restore -- .oatrix/recovered .oatrix/journal-001.json .oatrix/checkpoint-001.json
npm run ledger:check -- .oatrix/recovered .oatrix/checkpoint-001.json
```

Output files must be new; nothing is overwritten. Choose new numbered output
names next time. The restore command verifies the complete journal against the
supplied exact checkpoint and compiled lab genesis before creating a **new**
directory. It does not replace, roll back, merge with or repair a live ledger.
A partial/malformed import is never treated as a fresh usable world.

**Retain checkpoints independently from the backup/provider being checked.**
Keeping both files on one disk is convenient for the demo, not independent
rollback protection. A checkpoint identifies a known prefix, not proof that
nothing happened afterwards. Starting with an independently retained minimum:

```sh
npm run start:durable -- .oatrix/ledger .oatrix/checkpoint-001.json
```

A valid descendant is allowed. An older or conflicting prefix is refused.
A restored clone must not be advertised as a second independent authority over
the same world; deciding which recovering instance is authoritative remains an
operator duty until the consensus experiment.

## Commit and acknowledgement contract

The SQLite database uses rollback-journal **DELETE** mode and
`synchronous=EXTRA`. The candidate verifies these connection settings. SQLite,
not ad-hoc rename/lock files, owns transaction atomicity and hot-journal recovery.

Submission acquires `BEGIN IMMEDIATE`, rechecks the actual persisted head,
constructs a candidate through the existing `Journal`, and stores the exact
canonical accepted record and new head/count/byte accounting together. Only a
successful `COMMIT` is followed by an acknowledgement and installation of the
new cached state. A denied action rolls back without changing counters or fees.

A crash before commit leaves no accepted action. A crash after commit but before
reply can leave a committed action with an unknown outcome to the caller. That
uncertainty is normal, not permission to send a freshly signed payment blindly.

The client retains its exact signed envelope and calculates its canonical hash.
The read-only endpoint is:

```text
GET /api/receipt?commandHash=<hash-of-the-complete-signed-envelope>
```

It returns `{ "record": <accepted record or null> }`. Old nonces/head conditions
still reject replay. The receipt endpoint does not change that rule or make an
arbitrary new nonce idempotent. In this single authoritative instance, verified
absence permits retry of the same still-valid envelope. In a future federation,
a random host saying "absent" would not establish global non-execution.

An I/O or COMMIT error makes the adapter unusable (`LEDGER_IO_UNCERTAIN`). Reopen,
verify and look up the exact command; do not assume a failed reply means the
transaction failed. Operational busy/stale/closed/uncertain errors become HTTP
503; invalid signed requests remain 400. There is no remote SQL, reset, import,
fault-injection or key-management endpoint.

## Recovery, bounds and concurrency

On open, check the expected database schema/format, integrity, bounded record
count/bytes, expected genesis, every signature/transition, canonical stored event,
command index and final checkpoint. Cached state is reconstructed, not trusted
from a serialized balance table. Additional triggers/views or lookalike reserved
names are refused. No plugins/extensions are loaded by the adapter.

Defaults are **1,000 events and 8 MiB of logical canonical records**, including
genesis. API-configurable hard ceilings are 10,000 events and 16 MiB. Individual
records are at most 64 KiB, genesis 1 MiB, and the database is capped at 64 MiB.
Limits stop new admissions; they do not evict old rights or receipts. Disk-full
and VFS failures can still occur before those limits. No automatic pruning,
retention charging or continuous scaling claim is made.

This first adapter deliberately replays a bounded candidate on each submission
and on reopen. Work grows with history; it is a correctness reference, **not a
high-throughput implementation**. Indexed snapshots/retention require their own
measured design without trusting unverified cached state.

SQLite serializes writers on the same local filesystem. A second connection
whose cache is stale receives `LEDGER_STALE`, not permission to overwrite. It may
explicitly refresh or reopen. Refresh cannot forget that connection's retained
prefix, and it cannot silently reapprove a signed intent. The normal deployment
has one authoritative process. Multiple files/machines are not coordinated by
this mechanism; NFS/network filesystems are outside the supported lab contract.

Logical time is persisted and advances only through the existing authorised
command. Offline wall-clock time does not create production or expire leases.
Keys/epochs/mandates persist; ephemeral host sessions do not survive restart.

## Filesystem, security and non-claims

The OS, local directory owner, SQLite build/VFS and storage hardware are trusted.
Top-level symlink/hard-link/size and unexpected-file checks catch misuse; they
are not a sandbox against a racing filesystem administrator. Owner-mode creation
is not a portable Windows ACL guarantee. The database contains **public ledger
state and signed records**, not private content or signing keys. It is not
whole-database encryption. Content keys and encrypted packs are separate P0.5.

Physical power interruption, device loss, lying storage caches, hostile OS,
remote Byzantine nodes, replication, latest-state attestation and availability
SLAs are not proven by killing a Node process. EXTRA synchronization is selected
using SQLite's documented guarantees and assumptions; actual hardware/VFS still
matter. Never copy or delete a live rollback journal as a backup procedure.
Use verified logical export/restore, retaining an independent checkpoint.

## Review before integration

Review the exact candidate against merged main `a9ea19f`. Run `npm run verify`
and `npm run demo:durable`. Challenge commit/ack ordering; failed commit poisoning;
receipt lookup; strict replay/schema/bounds; known-prefix rollback; concurrent
processes; stale signed approval; root rotation; pending production and sales;
explicit init/export/restore paths; Windows behaviour and public-key fixture
claims. Do not weaken earlier assertions or merge/deploy from a review session.
Record exact commit, commands, failures and remaining assumptions. This is a
fresh technical review, not an organisational audit.

## Source basis

Node 22.16 built-in SQLite API and experimental status:
https://nodejs.org/download/release/v22.16.0/docs/api/sqlite.html

SQLite atomic commit model, VFS assumptions and failure handling:
https://www.sqlite.org/atomiccommit.html

SQLite synchronous=EXTRA and rollback-journal semantics:
https://www.sqlite.org/pragma.html#pragma_synchronous
