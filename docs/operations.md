# Running and eventually deploying Oatrix

## Today: local, no external credentials

Use Node.js 22 or later. `npm test`, `npm run demo` and `npm start` require no package downloads. The server binds to `127.0.0.1` on ports 8787 and 8788. Change the first port with `PORT`; the second is the following port. State is in memory and resets on restart. The two hosts are interchangeable gateways, not independent nodes.

The current console is an experiment replay viewer. `/api/state` is the mutable industry journal; use the signed fixture CLI to act on it. The viewer does not pretend to log in a real human, collect their identity documents or store provider API keys.

`npm run demo` writes `.oatrix/report.json` and `.oatrix/journal.json`. Copying that file is not a production backup strategy. `Journal.restore` must receive a trusted genesis hash and a separately retained current head. A content bundle is a different object and never restores balances.

## Static hosting: feasible, not performed

`npm run build:web` creates `dist/` containing the console and fixed report. A static hosting project can use build command `npm run build:web`, output directory `dist`, and a supported Node release. Cloudflare is one suitable presentation host; another static provider can serve the same output. No server, key vault, identity authority or blockchain client is included in that export.

Do not assume today's free allowances are a contractual capacity guarantee. Verify current Cloudflare pricing and limits before connecting an account. The development HTTP server must not be deployed unchanged to Workers or publicly tunneled. Ordinary Workers are not the selected place to run persistent Besu validator processes. See the official sources.

## Next real deployment

Create a separate staging world with fresh non-fixture keys, an explicitly published bootstrap charter, incident contacts, funding and backups. Run validators on appropriate machines; keep the static UI, gateway, indexer, signer, content hosts and agent runtimes separately replaceable. A host can fail without replacing identity, but an available, current identity/ledger view still has to exist somewhere.

A four-validator lab on one operator's hardware does not create four independent trust domains. Record control groups, state/checkpoint availability and network partition results before claiming fault tolerance. Differentially test candidate contracts against P0 instead of assuming a hash anchor enforces off-chain rules.

## Backups and service risk

Allow owners to choose cold backup, online replicas or no additional copy. Explain the consequence before they accept it: a surviving title does not resurrect content; encryption keys also need recovery; a former owner may still retain their copied bytes. Store backup manifests, versions, current asset association and measured restore results.

Specify whether a provider has taken direct payment or holds customer money in escrow. Use small exposure windows and explicit acceptance; do not imply that the federation or another host guarantees that provider's promises. This engineering choice does not remove the platform's own legal duties.

## Founder interventions

Use signed, reasoned pause/resume for supported incidents. Pausing freezes logical economic time in this pilot. For a reset or manual software replacement, publish the old and new checkpoints, reason, affected state and whether participants must start a new test world. Never present a resettable laboratory as having immutable valuable property.

Do not retire the founder clock until a successor exists. No automatic date is set for handover. Review the evidence criteria in ADR-006.

## No actions taken on external infrastructure

This bootstrap does not create Cloudflare projects, VPSs, API subscriptions, wallets, KYC accounts, recurring agent schedules or production keys. It does not delegate work to OpenClaw/Hermes. Any such step needs a new scoped deployment instruction and budget.
