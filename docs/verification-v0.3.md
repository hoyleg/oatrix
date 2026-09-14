# Verification — P0.3 comparison engine

## Completed locally

Node 22.16.0 / Linux; no dependencies installed, model calls, external services or deployments. `npm run verify` passed:

- Syntax and zero-dependency checks.
- **134 unit/integration tests**, including the prior 2,500 generated candidate actions and unchanged v1 checkpoints.
- **Six additional child-process/HTTP E2E workflows**.
- Seven event scenarios, default **18 configurations × 2 seeds = 36 comparison runs**, exact report reproduction and static export.

The 33 new tests exercise strict bounded inputs, deterministic replay, independent reconciliation from actual command records/holdings, matched concentration controls, no demand, absent liquidity/stock, horizon effects, public funding shortfall, tenure, correlated data loss, defaults, zero budgets, forged report outputs, real CLI subprocesses and read-only HTTP routes. No prior test was weakened or removed.

A new seed test initially assumed different seeds must produce different total demand. The data disproved that assumption: these seeds produce equal totals with different timing. The corrected new test checks reproducibility and differing timelines, not forced differences in totals. This was a test expectation correction, not a change to the simulation or archived acceptance tests.

## Presentation check

Chromium inspected all 36 rows, exact displayed inputs/metrics and selected-row state at 1440×1050 and 390×844. A mobile overflow from an unbroken checkpoint string was found and corrected. No JS errors or page-level horizontal overflow remained. Wide tables scroll within their own container.

Browser navigation, including loopback, is blocked in this execution environment. This inspection used the exported HTML/CSS/module and an injected generated-report fetch fixture. It is **not browser-to-live-server E2E**. Actual HTTP endpoints and processes were separately exercised by Node tests. Playwright is an environment tool, not a repo dependency or user requirement.

## Analysis validation: share with caveats

The default report hash is `1886a5aaecdd2b9058469d180be45dd324b894293f4186d86e32aa24caa6888f`. Inputs are committed in `examples/experiments/default.json`; regenerate rather than trusting this line if inputs or code change.

Spot checks against underlying ledger actions: completed = sold + unsold; potential purchases = sold + unmet; total accepted fees equal job fee totals; sales/levies and net cash reconcile to balances; treasury = starting funds + levies − paid commissions. Service acknowledgement + refund equals original escrow. Material/currency invariants apply at every action. Every resulting journal is replayed.

Matched controls preserve total workbenches, stock and working capital when concentrating ownership. Horizon, scripted demand, endowments, price and public-spend choices are visible beside results. Off-ledger failure schedules are not falsely described as observed reliability data. Null reactivation is distinct from zero; HHI concerns productive workbenches, not every asset or vote.

No population/adoption forecast or causal claim about real participants follows from these results. The economic loop is scripted and deliberately simple. This is author verification of a non-authoritative experiment runner, not an independent audit of the core. PR #5's fresh review remains separately recorded; broader issue #2 stays open. Remote CI and published tree/commit evidence are recorded on the delivery PR after publication.
