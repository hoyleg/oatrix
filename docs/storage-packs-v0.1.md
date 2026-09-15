# P0.5 — encrypted asset packs and real cold storage

**Status: laboratory review candidate, separate from PR #8.** Based on integrated `main` after PR #7. No authoritative reducer, money, ownership, founder or deployment rule changes. No new packages. The ordinary server still uses its existing in-memory state; this work persists encrypted **content**, not the authoritative journal service.

## Run without setup

```sh
npm run verify
npm run demo:storage
```

The demo creates a NEW directory under `.oatrix/storage-demo/` and prints its exact path. It builds a plaque using signed production commands, deploys it on a short lease, writes two online archives and an offline copy, deletes the online copies, and restores from the retained cold copy. Bob has occupied the expired location: restoring Alice's bytes does not evict him. The demo key and content are test data only. No server, credentials, install, Docker or model calls are needed.

Each run uses a unique directory and never overwrites an earlier run. These files accumulate until the operator chooses to remove a particular completed **demo run**. They are not an automatic backup/retention service. Tests use disposable OS temporary directories and clean them on completion.

To inspect the saved pack, substitute the printed run path and pack ID:

```sh
npm run pack:inspect -- "<run>/cold-copy/<packId>.oap" "<run>/owner-only/demo-pack.key"
```

Inspection prints metadata/counts, not executable content or the key. Key bytes are never command-line arguments. It proves decryption/content integrity, not current ownership. The API examples below operate in an owner-controlled process, not a provider's untrusted website.

## Three objects, three different responsibilities

**Ledger:** the current ownership, materials, balances, placements and root authority. It needs its own durable consensus/recovery design, still outstanding.

**Encrypted pack:** the representations of up to 32 explicitly selected assets. The manifest includes world, historical source head, asset IDs and content digests. Shared content is deduplicated within a pack. There is no archived title, balance, material inventory, tenancy, delegation or executable restore instruction.

**Pack key:** a random 32-byte key generated per export, separate from the principal's signing key. Store/transport it separately. A provider storing only the pack cannot decrypt it through this API. A person who retains pack plus key can read the old content after a sale; this is not DRM or proof that their later use is licensed.

A retained deed cannot reconstruct missing content or a lost pack key. Root-key rotation does not automatically rotate/delete old content keys. Both are deliberate consequences of separate custody. No operator or unrelated provider is made liable by the code to replace a missing copy.

## APIs

`sealAssetPack({head, state}, owner, assetIds, contentStore)` checks the supplied source associations, reads the selected content, and returns `{pack, key, id}`. A source snapshot is context, not a certificate of canonical state. Encryption does not create property rights.

`openAssetPack(pack, key)` authenticates and decodes the entire bounded pack, returning its manifest and content encodings. This is owner-side offline reading and intentionally does not require a live ledger.

`approvePackRestore(journal, principal, packId, destination, privateKey)` signs a dedicated off-ledger approval, bound to the actual current head/root epoch, ciphertext digest and explicit destination label. It cannot be submitted as a monetary command. It authorises content restoration, not a paid hosting contract or indefinite access right.

`restoreAssetPack(pack, key, journal, approval, destination)` verifies that approval against the actual trusted current journal, then authenticates the pack and checks EVERY asset's current owner and content digest. A sold/retired/changed asset rejects the entire association restore. Only after all checks does it return a fresh in-memory `ContentStore` and a receipt. No external writes, ledger mutation, financial charge or partial activation occur. The caller may use that store in its approved content-serving path; this is not a new publicly exposed HTTP upload API.

The destination is an owner-selected application label, not remote-provider authentication. Passing an arbitrary host snapshot as a fake `journal` defeats the trust premise; independent canonical-state verification is not supplied here. The actual Journal class and explicitly trusted restore checkpoints are used in tests.

The old backup may remain useful after thousands of ledger actions, but approval for restoring it must reference the current head. A changed head requires fresh approval, not silent rebasing. Repeating the same valid restore produces equivalent bytes and no additional debit or rights. The routine does not store a durable consent revocation list; approvals are current-head-scoped and intended for local synchronous use.

## Wire format and bounded parsing

Binary `.oap` framing is eight ASCII bytes `OATPACK1`, a 12-byte random IV, a 16-byte authentication tag, then AES-256-GCM ciphertext. The magic/version is authenticated associated data. The encrypted plaintext is a versioned JSON object with exactly `v`, `world`, `sourceHead`, `assets` and `blobs`. Assets contain only `id` and `content`. Blobs contain only `hash` and canonical base64 `bytes`.

Maximums: 32 assets, 1,000,000 bytes per blob, 8,000,000 unique plaintext content bytes, and 11,000,000 encrypted pack bytes. Limits are checked before decoding large encodings where possible, then verified on decoded content. No compression, paths, symlinks, executable recipes or filesystem extraction instructions are accepted in the manifest. Every content digest is rechecked. Unknown versions, extra fields, duplicate IDs/blobs, missing blobs and malformed content fail closed.

Decryption must finish tag verification before parsing or returning plaintext. Temporary binary buffers are cleared on exit as best effort; JavaScript strings/runtime copies are not a secure-memory guarantee. The supplied key is caller-owned and is not silently erased by `openAssetPack`.

Random keys/IVs make ciphertext, pack IDs and file names change on every export. World transitions and declared demo outcomes are reproducible; encrypted outputs are intentionally NOT byte-deterministic. The archive reveals encrypted length, access timing and ciphertext identity. Existing public ledger content digests still allow guessing attacks against predictable content. This does not implement hidden ledger objects or confidential economic computation.

## DiskArchive and failure behaviour

`new DiskArchive(directory, {quotaBytes, maxFiles})` implements an owner-controlled local provider adapter. `put(pack)`, `get(id)`, `remove(id)` and `usage()` use actual disk files named solely by ciphertext digest. It receives no decryption keys. Counts and quotas measure encrypted bytes; repeated writes of identical ciphertext are idempotent. A newly encrypted copy has a different digest and consumes additional space.

Cooperating writers acquire an exclusive `.lock`, check the shared quota, write a private temporary file, fsync that file and rename it. File reads are bounded and verify the ciphertext digest. Usage/quota scans bound the aggregate size first, then re-read and hash every existing pack before allowing a write or removal. A renamed/corrupted bounded file fails closed rather than being counted as healthy capacity. Scans are deliberately linear in retained encrypted bytes; this bounded adapter is not a scalable indexed storage engine. Static symlink/hard-link files, unsafe names, unexpected files and changed reads are refused. The archive never overwrites a corrupt existing record merely because a caller supplies a valid replacement.

Crash-left locks/temporary files fail closed and are NOT automatically stolen or deleted. Previously completed immutable packs can still be read directly. An operator must stop all writers, preserve/inspect the directory and deliberately reconcile remnants before reopening writes. There is no timeout that silently takes ownership of another writer's lock.

This is not a hostile-OS sandbox, untrusted-filesystem ownership boundary, network service, continuous backup scheduler or power-loss-certified database. Ancestors/directory ownership are trusted. Files are flushed, but parent-directory persistence across power failure is not promised; a crash may lose the latest rename. Replication/cold copies are explicit actions. External providers can lie or delete files: the caller detects missing/corrupt bytes, not magically restores them.

Archiving opaque ciphertext does not prove it is decryptable or useful. No storage payment, tax, collateral or monetary issuance is triggered by merely recording bytes. Paid-provider obligations remain a separate protocol task.

## Fresh review focus

Review the final commit against its stated main baseline. Challenge tampering/length/version handling, current-root and destination approval, sale/retirement/content-version changes, old approval versus old content, all-or-nothing validation, truthful privacy claims, real filesystem quota/corruption/lock handling and the fresh-process test. Do not weaken old accounting or authority tests. Report exact commit, reproduction, commands run and residual assumptions. This is a fresh technical review, not an organisational audit or production custody certification.

Next bounded step after review: a durable journal/restart design with explicitly trusted checkpoints, then the selected ledger-backed conformance experiment. Content storage alone does not solve either.

Implementation references: Node crypto and filesystem APIs, checked 2026-09-15: https://nodejs.org/api/crypto.html and https://nodejs.org/api/fs.html . Format limits and policies above are Oatrix laboratory choices, not standards-derived safety guarantees.
