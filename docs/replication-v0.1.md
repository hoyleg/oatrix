# P0.7 — checkpoint-pinned replication and catch-up

Status: bounded review candidate on top of reviewed P0.6 (`e6bc135`). The replication code is not approved merely because tests pass. Main is not automatically activated. No economic rules, currencies, voting powers, licensing or identity recovery rules change.

## What this establishes

A separate process can maintain a separate SQLite ledger by obtaining signed records from another host, independently replaying them and reaching an explicitly supplied checkpoint. A caught-up replica can serve those records after the original host disappears. The served role remains read-only: this is not automatic failover, leader election, a quorum, canonical-chain selection or Byzantine consensus.

The state reducer, signature verification and hash encoding are the existing ones. No remote balances, inventories, ownership tables, SQL statements or executable migrations are installed. Receiving repeated copies of a record does not create additional resources, authority, payment or rewards.

## Trust comes before transport

The operator supplies a target object with exactly `v`, `genesisHash`, `sequence` and `head`. It must come from an independently trusted observation or future consensus/checkpoint mechanism. A valid signature on each action establishes authorisation of that action, not that one particular ordering is globally canonical.

Fetching `/api/checkpoint` from an arbitrary source and declaring it trusted defeats this boundary. The demo explicitly trusts its owner-run source through its control harness; that is a disclosed laboratory assumption, not a decentralised trust mechanism.

A retained prefix rejects rollback and conflicting prefixes. It cannot prove there are no later transactions elsewhere. A lower target is rejected rather than adopted. An equal matching target is a local no-op. Source loss does not give a replica permission to accept new world actions.

## Transport contract

`startHost(..., { replication: true })` enables `GET /api/replication`. The endpoint is absent by default. Its exact, duplicate-free query fields are:

- `genesis`: expected genesis digest;
- `after`, `head`: the caller's current sequence and predecessor digest;
- `target`, `targetHead`: the separately supplied target checkpoint;
- `limit`: requested maximum records, from 1 to 32.

The response has exactly `v`, `from`, `target`, `next`, and `records`. The source verifies that the requested starting point and target are in its local history, then emits bounded pages ending at the target. The source may advance beyond that fixed target without invalidating the transfer. A changed target is not silently negotiated.

The client checks request/response binding, strict shapes, page progression, exact sequence, predecessor, signatures, every replayed effect/state hash, and the complete record digest. Missing, reordered, duplicated, malformed or altered records fail. Equal balances at the end of a different order are not a matching history.

Transport limits are 32 records and 256 KiB per page, 64 KiB per record, and at most 10,000 records / 16 MiB of record bytes per operation. The existing destination ledger's lower event/byte limits still apply. Bodies are counted while streaming, before JSON parsing; chunked or decompressed output cannot evade the byte cap. A bounded network deadline is checked between pages and before installation. It does not preempt synchronous JavaScript/SQLite CPU work.

Sources must be explicit HTTPS origins or literal loopback HTTP origins (`127.0.0.1`, `[::1]`). Credentials, paths, fragments and nonliteral loopback names are refused. No cookies, owner keys, login bearer tokens or automatic redirects are used. There is no source discovery, retry loop, polling schedule or target refresh.

## All-or-nothing installation

`catchUp(journal, { source, target, pageSize, timeoutMs })` builds a disposable staging journal. An early valid page never becomes authoritative if a later page fails. No destination lock is held while waiting for network data.

`DurableJournal.importRecords(records, expectedBase, trustedTarget)` checks the current local checkpoint and quotas, acquires `BEGIN IMMEDIATE`, replays and compares all supplied records again, verifies the exact target, inserts the entire suffix and updates metadata in one transaction. Acknowledgement follows COMMIT. There are no partial page commits. An independently changed local base is rejected rather than silently rebased. An uncertain commit poisons the handle: reopen and inspect the checkpoint before retrying.

This deliberately repeats validation rather than trusting the network staging object. SQLite owns transaction atomicity; the existing Journal owns world semantics. Same-directory competing processes are not independent federation nodes.

## Read-only service and separate storage

`replicaView(journal)` supplies a read-only facade. Both HTTP command submission and direct gateway relay reject mutation, including a valid founder/root command. Queries and separate host-bound login remain possible. No special new identity is created by copying the ledger.

An explicit local sync can update the replica's database in a separate process. A served replica refreshes against its previously retained prefix before handling requests. It does not automatically contact another host. The directory owner can replace the software or open its own database: read-only is a service-role boundary, not protection against a hostile OS administrator.

This replication concerns the public ledger only. Encrypted creations, memories, vaults and decryption keys are not copied. PR #9's content archives remain separate. A deed without its bytes is still possible. Replica storage consumes real capacity; this change introduces no reward or levy for asserted replication.

## Run the complete demonstration

Select the candidate branch, with **Node 22.16.0 or later** available:

```sh
npm run verify
npm run demo:replication
```

No npm install, Docker, paid model, credential or service account is needed. The demo creates an isolated `.oatrix/replication-demo/run-*` directory, launches three processes with three independent files, synchronises A, kills the original source, synchronises B from A, verifies receipt lookup/read-only behaviour, and restarts A. It then stops all its processes. Random directory names and process IDs are not protocol state. The report and owner-trusted target are retained; no new private keys are generated.

## Operate a local source and follower manually

These are optional laboratory instructions, not a request to deploy. Stop any existing server on the same ports first. Each `init` must use a NEW directory; never delete old state to repair an error.

```sh
npm run replica:init -- .oatrix/source
npm run replica:init -- .oatrix/follower
npm run replica:source -- .oatrix/source
```

In a second terminal, after making permitted lab changes to the source, take a checkpoint directly from its locally controlled ledger:

```sh
npm run ledger:checkpoint -- .oatrix/source .oatrix/trusted-target-1.json
npm run replica:sync -- .oatrix/follower http://127.0.0.1:8787 .oatrix/trusted-target-1.json
npm run replica:serve -- .oatrix/follower .oatrix/trusted-target-1.json
```

Source default port: 8787. Follower default port: 8789. Live JSON is at `/api/state`, `/api/checkpoint` and `/api/receipt`. Existing browser scenes are fixed demonstrations, NOT the live ledger. The `PORT` environment variable can select another port. A second sync needs a newly and independently retained target file; do not overwrite an old trust anchor casually.

Serving a replica does not start a polling task. Running `replica:sync` is one bounded operation. Failed transport leaves the previously accepted history available. Restarting is not a reason to ignore a previously held minimum checkpoint.

## Acceptance and next boundary

Required evidence: separate files and processes; exact multi-page replay; denied tampering, forks, rollback and resource creation; lost source with continued replica reads; lost replies and hard termination around whole-suffix COMMIT; correct existing jobs, sales and authority; strict origin/byte/deadline bounds; no replica write authority or automatic reset.

Next work should specify how independently operated nodes agree on and authenticate a canonical checkpoint, and how that trust can be rotated. Do not turn matching replica heads into a vote or invent a consensus algorithm here. A declared node set, fault model, upgrade rule and recovery procedure must precede that authority change.

## Residual limitations

The engine is intentionally bounded and performs full replay/copying in several paths; this is not a throughput design. The network handler is loopback-only, not a public authenticated peer network or DoS-hardened service. No real WAN or hostile filesystem testing is implied. Node's built-in SQLite API is experimental in the minimum supported runtime. Process termination tests are not physical power-loss certification. A trusted but malicious target can select a valid fork; this layer does not solve that trust-policy problem. No finality, availability guarantee, production security audit or post-quantum claim is made.

Primary implementation references: [SQLite transaction control](https://www.sqlite.org/lang_transaction.html) and [Node 22.16 SQLite API](https://nodejs.org/download/release/v22.16.0/docs/api/sqlite.html). Neither is an endorsement or audit of Oatrix.
