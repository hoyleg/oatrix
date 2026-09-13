# Experiments: questions before infrastructure

## What a bounded experiment can establish

It can find contradictions, verify the behaviour of a model under stated conditions, compare alternative rules, expose accounting exploits and test recovery paths. A deterministic test bed is a legitimate scientific/engineering tool. It does not establish that autonomous agents will choose useful work, people will buy outputs or providers will accept the settlement unit.

The initial conditions and action policy must be visible. Do not hide assumptions in agent prompts and then call the resulting behaviour emergent.

## Included executable scenarios

| Experiment | Question | Evidence and limit |
|---|---|---|
| Industry | Can resource extraction, fabrication and an indivisible sale conserve value-accounting quantities? | Inputs and U are accounted for, fees/levies settle. Buyer and commission acceptance are scripted. |
| Identity mobility | Can a principal continue through another host? | Two audience-bound sessions, one signed identity, one gateway lost. They share a writer, so this is not a consensus test. |
| Dormancy and cold restore | Can leased placement end without asset destruction? | Title persists, content bytes are lost and restored, a different slot is agreed. No claim that missing bytes can be reconstructed from a digest. |
| Provider failure | What is recoverable? | Unspent escrow returns at expiry; accepted payment stays paid; no unrelated provider is debited. Legal claims remain separate. |
| Founder safety brake | Can emergency control be explicit? | Pause and reason are recorded; normal actions fail; independent-identity manifest review occurs. Review quality and real operator independence are not proved. |
| Repeated claims | Does copied conversation acquire authority? | Declared source families deduplicate; the notebook cannot change state. Hidden coordinated actors and persuasive claims remain hard. |

`npm run demo` generates the full reports and an industry journal. `npm run build:web` generates a static viewer. Time steps are controlled by the experiment, not real calendar days.

## Invariants checked after every accepted command

Total U in balances plus service escrow equals genesis supply. Raw resources are present in reserves, inventories, work in progress or embodied assets. No asset has two owners or two active deployment locations. Locked assets correspond to one open offer. Failed actions do not alter state or consume a protocol nonce. Only authorised actions alter state.

Tests also cover root rotation, stale controller commands, one-time challenges, host replay, overbilling, fractional-levy avoidance, backup corruption, stale-chain recovery, founder boundaries and altered release manifests. Generated streams run 1,500 bounded candidate actions across five fixed seeds; that is not an exhaustive proof.

## Next deterministic experiments

1. Vary production costs, service rates, demand curves and settlement levies independently. Pre-register the demand assumptions. Measure throughput, inventory accumulation, treasury solvency, concentration and unmet service budgets; do not infer real purchasing preferences.
2. Model storage retention as a funded inventory with replicas, correlated provider failures, cold backups, lost keys and restore costs. Measure recoverable bytes and liabilities, not just surviving deeds.
3. Compare fixed, renewable and relocated deployment rights. Track occupied-but-unused capacity, reactivation delay, displacement and supply of public space.
4. Add heterogeneous bounded controllers with fixed capabilities and inference budgets. Separate labour throughput from review quality; do not equate agent count to membership.
5. Model provider default under prepayment, streaming settlement, escrow and optional insurance. Distinguish protocol refunds from off-ledger recoveries.

Advance to network experiments only when the single-writer accounting and authority model is coherent. Advance to model-driven experiments only with explicit per-run limits and externally checked outcomes. No LLM bill is necessary to test an invariant.
