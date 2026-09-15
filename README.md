# Oatrix

**Creation has inputs. Ownership outlives a host.**

Oatrix is an experiment in an industrial shared reality: participants contribute work, resources, tools or infrastructure; creation has a cost; useful outputs can earn rewards. Its eventual purpose is deliberately open. A software-building commons, an industrial simulation and a creative world are possibilities, not predetermined demand.

This repository contains a **working, bounded deterministic lab**, not a deployed blockchain or a production economy. It tests principles before spending money on inference, hosting or complex consensus infrastructure.

## Run it

Install a supported Node.js release, version 22 or later. No package installation, model credentials, database, Docker or paid service is needed.

```sh
git clone https://github.com/hoyleg/oatrix.git
cd oatrix
npm run verify
npm start
```

Open **http://127.0.0.1:8787** or **http://127.0.0.1:8788**. Both local hosts expose the same read-only experiment console and relay to the same in-memory **v2 machinery** journal. The six archived scenarios retain v1 rules and checkpoints. Restarting resets that server state.

The console now defaults to **Build the machines that build**, a seventh experiment. It shows a workshop manufacturing a forge, concurrent production on separately owned machines, an atomic sale and dismantling without minting currency. Expand the recipe definitions to inspect their exact JSON and digest.

The six original experiments remain: production and sale; identity continuity after host failure; lease expiry and cold restore; service-provider failure; founder intervention and release receipts; and provenance-aware handling of repeated claims. It is not a live game client or graphical login screen.

The signed CLI works through either host. All these identities use **publicly known fixture keys**:

```sh
node scripts/client.mjs alice transfer '{"to":"bob","amount":10}' http://127.0.0.1:8788
```

On shells that alter JSON quoting, run the tests and console first; the command above uses standard POSIX/PowerShell single-quoted JSON.

## Reviewed work mandates (opt-in)

PR #7 is merged and includes **opt-in rules v3 work mandates**, with material/extraction and job limits as well as U budgets and exact recipe/machine/provider scope. The ordinary server remains v2; no migration is performed. Run `npm run demo:work` for the isolated demonstration. See [the scope and fresh-review brief](docs/work-mandates-v0.1.md) and [actual verification](docs/verification-work-mandates.md). The fresh review is recorded on PR #7; this remains experimental rather than production security assurance.

## Encrypted content / cold-storage candidate

This feature is not on `main` until its PR is merged. For a first local checkout of the candidate:

```sh
git fetch origin
git switch --track origin/feat/encrypted-asset-packs
npm run verify
npm run demo:storage
```

When that local branch already exists, use `git switch feat/encrypted-asset-packs` and `git pull --ff-only` instead of creating it again. Do not discard conflicting local changes.

This branch adds the isolated P0.5 storage experiment. Run `npm run demo:storage` to build a plaque, store encrypted copies on disk, lose both online copies and recover from cold storage without reclaiming an expired occupied location. The printed report gives the exact new run directory. No extra installation, keys or server setup is needed. This is public fixture data, not a production backup service. [Format, APIs, explicit limits and review brief](docs/storage-packs-v0.1.md); [actual verification](docs/verification-storage-v0.1.md).

## Compare the rules under adverse conditions

Open **http://127.0.0.1:8787/sweeps.html** after `npm start`. The comparison page contains **18 configurations × 2 fixed seeds**: no buyer demand, higher costs, concentrated capacity, tight budgets, public funding shortfall, lease/freehold return, missing or correlated backups, and service default. Select any row to inspect its exact inputs, metrics, assumptions and checkpoints.

```sh
npm run sweep         # JSON, summary and separate CSV tables in .oatrix/sweeps/
npm run sweep:verify  # recompute and reject an inconsistent report
```

For custom bounded configurations and optional replay journals, see [P0.3 experiments](docs/experiments-v0.3.md). No LLM, cloud account or additional installation is used. The page compares simulated consequences; scripted purchases are not evidence of demand.

To return an existing checkout to the merged lab (not the unmerged storage candidate), stop the server, then run:

```sh
git fetch origin
git switch main
git pull --ff-only
npm run verify
npm start
```

Git will stop rather than overwrite conflicting local changes. Do not use a hard reset to resolve that automatically.

## What exists now

- Pure integer-based world transitions, signed commands and a hash-linked replayable journal.
- Stable principals, root-key rotation, bounded delegation, revocation and host-bound login challenges.
- Fixed test supply, resource reserves, capacity-limited extraction and deterministic manufacture.
- Atomic indivisible-asset sales, settlement levies with fractional carry, and provider selection with exact terms hashes.
- Optional capped service escrow, jointly authorised receipts, duplicate protection and unspent-budget refunds.
- Separate asset title, content digest, freehold/lease terms and deployment location. Lease expiry does not erase the asset.
- Off-ledger content backups and restore checks against **current** ownership; no snapshot-based duplication of inventory.
- Disclosed founder pause/resume and release-manifest approval receipts. Nothing automatically installs or executes a proposed release.
- A local HTTP API, seven-scenario browser console, static export and unit/generated/replay/HTTP plus process-level end-to-end tests.
- Bounded reproducible comparison suites with declared assumptions, actual ledger replay and a read-only browser comparison view.
- Versioned, data-only recipes; owned one-job machine slots; separately bounded execution-provider capacity; cancellation and dismantling.

See [the v0.2 implementation and review boundary](docs/machinery-v0.2.md), [testing](docs/testing.md), and [current verification](docs/verification-v0.3.md) for what was actually tested and [limitations](SECURITY.md) before interpreting a passing test as a safety guarantee.

## What does not exist yet

No Byzantine consensus, production login/wallet, KYC, private ledger computation, encrypted room service, autonomous LLM runtime, general scripting VM, production ledger adapter, live provider marketplace or end-to-end quantum resilience. The journal does not implement blockchain consensus. A pair of gateways around one process is not a decentralised federation.

The tests establish model properties under their assumptions, **not demand, fair prices, useful AI judgement, independent operator honesty or economic sustainability**. Paying a fee in simulated U is not evidence that real compute was supplied. Repeated claims are grouped by declared provenance; hidden coordination is not detected.

## Design and contribution

Start with the [current green-paper baseline](docs/green-paper.md), [confirmed decisions and ADRs](docs/decisions.md), [architecture and data placement](docs/architecture.md), [protocol](docs/protocol.md), [experiment plan](docs/experiments.md) and [implementation backlog](docs/roadmap.md).

[AGENTS.md](AGENTS.md) and [CONTRIBUTING.md](CONTRIBUTING.md) define bounded work, review evidence and release discipline. No OpenClaw, Hermes, cloud-agent job or external model has to run this lab.

```sh
npm run check          # syntax and zero-dependency contract
npm test               # unit, generated-sequence, recovery and HTTP adapter tests
npm run test:e2e      # starts real child-process hosts; exercises signed workflows over HTTP
npm run verify        # all checks above/below, including process E2E and sweep reproduction, in one command
npm run recipe:check -- examples/recipes/plaque.v1.json # offline definition validation
npm run test:coverage  # diagnostic coverage, not a proof of correctness
npm run demo           # .oatrix/report.json and .oatrix/journal.json
npm run build:web      # static read-only console in dist/
```

The static `dist/` directory can be hosted separately from the authoritative services. Cloudflare deployment is documented, **not performed**, in [operations](docs/operations.md).

## Non-negotiable lab warnings

Test balances are resettable and have no redemption promise or guaranteed conversion into a future network. Do not use real keys, personal data, paid model credentials or valuable assets. The development server binds to loopback; do not publish it or tunnel it to the internet.

The founder retains bootstrap control until an evidence-based handover, not an invented calendar deadline. Inside the current model, the safety brake cannot confiscate property; outside the model, a maintainer controlling deployments can still replace the software. This is disclosed centralisation, not constitutional immutability.

Ownership is not perpetual free hosting. A current ledger record is not a backup of the underlying bytes. Unrelated providers do not automatically cover a failed provider's obligations in the model; this is not a blanket statement about legal liability.

**Licensing remains a founder decision.** Public repository visibility is not an open-source licence; see [LICENSING.md](LICENSING.md). No production monetary allocation or founder endowment is fixed by this repository.
