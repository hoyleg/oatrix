# Oatrix

**Creation has inputs. Ownership outlives a host.**

Oatrix is an experiment in an industrial shared reality: participants contribute work, resources, tools or infrastructure; creation has a cost; useful outputs can earn rewards. Its eventual purpose is deliberately open. A software-building commons, an industrial simulation and a creative world are possibilities, not predetermined demand.

This repository contains a **working, bounded deterministic lab**, not a deployed blockchain or a production economy. It tests principles before spending money on inference, hosting or complex consensus infrastructure.

## Run it

Install a supported Node.js release, version 22 or later. No package installation, model credentials, database, Docker or paid service is needed.

```sh
git clone https://github.com/hoyleg/oatrix.git
cd oatrix
npm test
npm run demo
npm start
```

Open **http://127.0.0.1:8787** or **http://127.0.0.1:8788**. Both local hosts expose the same read-only experiment console and relay to the same in-memory laboratory journal. Restarting resets that server state.

The console replays six experiments: production and sale; identity continuity after host failure; lease expiry and cold restore; service-provider failure; founder intervention and release receipts; and provenance-aware handling of repeated claims. It is not a live game client or graphical login screen.

The signed CLI works through either host. All these identities use **publicly known fixture keys**:

```sh
node scripts/client.mjs alice transfer '{"to":"bob","amount":10}' http://127.0.0.1:8788
```

On shells that alter JSON quoting, run the tests and console first; the command above uses standard POSIX/PowerShell single-quoted JSON.

## What exists now

- Pure integer-based world transitions, signed commands and a hash-linked replayable journal.
- Stable principals, root-key rotation, bounded delegation, revocation and host-bound login challenges.
- Fixed test supply, resource reserves, capacity-limited extraction and deterministic manufacture.
- Atomic indivisible-asset sales, settlement levies with fractional carry, and provider selection with exact terms hashes.
- Optional capped service escrow, jointly authorised receipts, duplicate protection and unspent-budget refunds.
- Separate asset title, content digest, freehold/lease terms and deployment location. Lease expiry does not erase the asset.
- Off-ledger content backups and restore checks against **current** ownership; no snapshot-based duplication of inventory.
- Disclosed founder pause/resume and release-manifest approval receipts. Nothing automatically installs or executes a proposed release.
- A local HTTP API, six-scenario browser console, static export and adversarial/replay/integration tests.

See [verification](docs/verification.md) for what was actually tested and [limitations](SECURITY.md) before interpreting a passing test as a safety guarantee.

## What does not exist yet

No Byzantine consensus, production login/wallet, KYC, private ledger computation, encrypted room service, autonomous LLM runtime, general scripting VM, production ledger adapter, live provider marketplace or end-to-end quantum resilience. The journal does not implement blockchain consensus. A pair of gateways around one process is not a decentralised federation.

The tests establish model properties under their assumptions, **not demand, fair prices, useful AI judgement, independent operator honesty or economic sustainability**. Paying a fee in simulated U is not evidence that real compute was supplied. Repeated claims are grouped by declared provenance; hidden coordination is not detected.

## Design and contribution

Start with the [current green-paper baseline](docs/green-paper.md), [confirmed decisions and ADRs](docs/decisions.md), [architecture and data placement](docs/architecture.md), [protocol](docs/protocol.md), [experiment plan](docs/experiments.md) and [implementation backlog](docs/roadmap.md).

[AGENTS.md](AGENTS.md) and [CONTRIBUTING.md](CONTRIBUTING.md) define bounded work, review evidence and release discipline. No OpenClaw, Hermes, cloud-agent job or external model has to run this lab.

```sh
npm run check          # syntax and zero-dependency contract
npm test               # unit, generated-sequence, recovery and HTTP tests
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
