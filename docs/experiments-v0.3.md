# P0.3 — bounded parameter comparisons

## What to run

The ordinary local console now includes `/sweeps.html` on either host. No extra installation or service is required.

```sh
npm run sweep
npm run sweep:verify
npm start
```

`npm run sweep` writes `.oatrix/sweeps/report.json`, `summary.md` and separate economy/property/service CSV tables. `sweep:verify` reruns the inputs using the current engine and compares the whole report, not merely its self-declared hash.

For your own bounded inputs, copy `examples/experiments/default.json`, edit it and run:

```sh
npm run sweep -- --input my-suite.json --out .oatrix/my-suite --journals
npm run sweep:verify -- .oatrix/my-suite/report.json
npm start -- my-suite.json
```

The optional journal files permit independent reducer replay. Reusing an output directory overwrites named reports but does not delete older optional journal files; only runs named in the current report belong to that report. Use a new directory to retain separate experiments. The read-only web report is generated at server start, not regenerated on every request. Restart to load changed inputs. Default `build:web` exports the default suite, not an earlier custom server's suite.

## Rules versus experiment engine

`oatrix-sweep-1` orchestrates the existing rules-v2 reducer. It is not a new protocol version and does not modify rules, authorisation, monetary issuance or production contracts. Genesis allocations, participant behaviour, demand, prices and failure schedules are declared test fixtures. Every subsequent ledger change uses an actual signed command. Every run is replayed from genesis and its final state checked. Storage operations are explicitly off-ledger observations.

Suite version 1 has exact fields `v`, `id`, `seeds`, `cases`. Unknown fields fail. There are at most 8 distinct uint32 seeds, 32 cases and 64 case/seed combinations. Economy horizons are 1–48 logical ticks; service requests are 1–32; property delays are bounded. See `validateSuite` for exact field/range definitions. These limits are not protocol throughput promises. The runner uses no model, network or unseeded/wall-clock choice.

Counter-based draws bind seed, named purpose and tick. A failed admission cannot consume a draw and shift the later demand schedule. Seeds control demand, offered-product choice and machine admission order. They are not statistical samples of real citizens. Two seeds can have equal aggregate outcomes while differing in timing. All configured runs are retained; none is discarded as inconvenient.

## Economy: fixed controls and measurement

Two workbenches make identical plaques using one ore, one wood and two production ticks. Endowed inputs come out of reserves. Concentrated ownership receives both workbenches and both shares of working capital/stock; the comparison does not quietly double global resources. A separate buyer has a stated starting budget and willingness to pay. Producers repeatedly try to manufacture; this deliberately simple policy is not economically optimal.

At each tick: offer finished stock, process declared buyer opportunities, attempt a funded public-maintenance commission, admit new jobs, then advance one tick. Completion at the final horizon is counted as stock, not retrospectively sold. Work in progress is separate. No draining interval is appended to make the results look better.

All monetary metrics are **minor U; 100 minor U = 1 U**. They are not external currency. HHI and utilisation use basis-point scales (10,000 = 100%).

| Metric | Definition and limit |
|---|---|
| Completed / running / sold / unsold | Separate state counts at the horizon; completed = sold + unsold in this fixture |
| Demand opportunities / unmet | Imposed potential purchases; sold + unmet = opportunities, not measured population demand |
| Execution fees | Sum of actual accepted job admission fees, including unfinished work |
| Gross sales / levy | Actual `buy` consideration and levies on sales plus execution payments, with protocol fractional carry |
| Public spend / unfunded planned spend | Paid scripted commissions versus skipped plans; skipped spend is NOT an accrued liability |
| Treasury end | Initial public budget + actual levies − paid public commissions; never a fictitious cash bailout |
| Producer net cash | Ending less starting U for each producer; not profit, because resources/endowments and unsold stock are not appraised |
| Productive-capacity HHI | Sum of squared shares of the two relevant workbenches × 10,000; 5,000 shared, 10,000 concentrated; not total wealth inequality |
| Machine utilisation | Occupied machine-ticks within the horizon / (two machines × horizon), including partial unfinished jobs |

Execution goes to host_a only. Host_b receives predeclared public maintenance whose subjective acceptance is scripted. Provider competition, open-ended pricing, customer discovery and endogenous investment are NOT simulated by this fixture.

## Property and content

One actual 27-byte fixture pack is deployed, its primary copy is lost, and the owner returns. Compare no backup, offline cold copy, surviving online replica and correlated online-copy failure. No claim of independent-provider failure probability is made.

The lease case installs a successor after expiry. Returning ownership cannot evict that successor: the owner relocates or waits. Freehold remains assigned and deployed. Restoration itself cannot mutate journal head, title or balances. Existing storage regressions separately reject restoring a sold or dismantled asset under old authority.

Unique recoverable bytes differ from retained copy bytes. `reactivationDelayTicks: null` means no recovery in the run, not immediate success; zero means immediate recovery. A title can survive with all content lost. `occupiedSlotRejected` records a blocked re-entry attempt; false can mean no attempt was possible, not that a successor was evicted. `freeholdPreserved` is a not-applicable/pass condition for lease cases; inspect tenure when interpreting it.

## Service default and budgets

The payer reserves bounded escrow, then acknowledges only the scripted available/affordable requests. Provider signatures and payer authorisation are real, but service usefulness is assumed. Unused escrow returns at expiry. Already acknowledged payments stay paid; unrelated providers are not charged.

Paid exposure after failure is the amount already acknowledged when the provider subsequently fails. It is not a finding that past work was worthless, nor a legal compensation amount. Budget refusal and provider unavailability are distinct. A request cannot appear in both counts in this fixture.

## Integrity and interpretation

Reports include complete inputs, engine, hashes, each run's genesis/final head and measured journal size. `replayVerified` means commands were actually replayed, not that the host asserted success. The report verifier protects against inconsistent output relative to this code; it does not independently attest the original inputs, economic truth, provider delivery or source integrity. A malicious author can supply a different coherent suite. Compare trusted source and input hashes as well.

These are bounded counterfactual tests. They can reveal accounting contradictions, sensitivity to assumptions and inadequate policies. They cannot demonstrate adoption, fair prices, sustainable real-world infrastructure funding, fraud-proof governance or distributed durability.
