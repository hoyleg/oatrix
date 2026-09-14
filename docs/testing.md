# Test layers and what to run

The default developer acceptance command is:

```sh
npm run verify
```

It runs syntax checks, the full unit/integration/generated-action suite, process-level E2E, deterministic demos and the static export. No package installation, browser driver, Docker, model credentials, external services or administrator privileges are needed. GitHub CI runs the process E2E suite as well as the existing checks on Node 22/Linux, Node 24/Linux and Node 24/Windows.

## Unit and adapter integration: `npm test`

These quickly exercise the reducer, signatures, authority, conservation, journal, storage and HTTP adapters. The v2 tests cover malformed recipes, copied definitions, owned/provider capacity, cancellation, sale, dismantling, cold backups, concurrent-controller authority and replay. Seeded generated sequences deliberately mix accepted and rejected actions. A failed action must preserve both state and journal.

The original v1 test cases are retained. The one existing assertion changed from six to seven report entries because a scenario was added; no conservation, authorisation or rejection expectation was weakened. Historical trace hashes are separately pinned, so silently changing old rules cannot be disguised by a newly generated expected report.

## Process/HTTP end-to-end: `npm run test:e2e`

`e2e/hosts.e2e.mjs` starts real Node child processes and real loopback listeners. It uses only HTTP for observations and signed state changes, not direct Journal or reducer mutation. Its test-only IPC channel can stop a host or shut down the process; it cannot change world state. The actual `scripts/serve.mjs` entry point is also started and checked. `PORT=0` chooses ephemeral ports for tests, avoiding conflicts with an already running developer instance.

Six workflows cover startup/report serving; portable login and tampered requests; exact retry after one host goes away; manufacture/sale/levy/dismantling; racing delegated controllers through different hosts; rotation/revocation; and whole-process reset. Some checks share a workflow. Requests and startup have bounded timeouts. Child processes are cleaned up even after test failure.

These are end-to-end tests of the current process/HTTP stack, NOT a Byzantine-consensus, independent-node or durable failover test. The two listeners still share one journal. Losing the entire writer resets this laboratory; the suite verifies that limitation rather than treating restart as recovery.

## Browser presentation

Process E2E does not run a browser. The build environment separately exercised the exact HTML/CSS/module with an injected exported report in Chromium. All seven scenario controls and 84 frames were checked, with desktop and mobile rendering. Browser navigation to loopback was blocked by environment policy, so this is explicitly an offline fixture UI smoke check, not browser-to-live-server E2E.

Playwright was an already-present environment inspection tool; it is not a repository dependency or required user installation. A committed browser driver should be considered only when the UI gains real signing, mutation or login behaviour and its maintenance cost is justified.

## What is not established

Passing tests do not prove independent review, network consensus, real compute delivery, live economics, durable storage, privacy, production identity, quantum resilience or useful agent judgement. Those need separate implementations and evidence. No test count is a permanent acceptance target; preserve the substantive checks when the suite grows.
