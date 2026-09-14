# v0.2 candidate: machinery and process-level verification

Date: 14 September 2026. Implements issue #3; independent review under #2 remains required. The author checked and tested this candidate but did not obtain an independent audit. No merge, cloud deployment, paid model call, licence change or real monetary allocation is implied.

## Concrete behaviour

Rules v2 introduce human-readable JSON recipes, one concurrent job per owned machine, and a separate limit on each execution provider. A principal may operate several machines; creating additional controllers supplies neither extra machine rights nor extra provider slots. Publishing or copying a recipe creates knowledge, not assets, inventory, currency or execution capacity.

The deterministic recipe interpreter supports extraction and assembly only. It cannot execute JavaScript, call a network, grant permissions or mint U. A recipe specifies its version, descriptive ID/revision/label, duration, required machine class, exact ore/wood inputs and one output. Each definition is addressed by the hash of the whole definition. Names are metadata and may be ambiguous; signed jobs identify the digest. Previously admitted definitions cannot be edited in place.

The bootstrap includes extractor, workbench and forge classes. Machines have one job slot each. Creating a machine must meet fixed embodied-material floors: extractor 3 ore/1 wood; workbench 2 ore/2 wood; forge 4 ore/2 wood. Extraction is capped at one unit per declared tick. Assembly duration is bounded from 1 to 100 ticks, and consumes positive material. These are explicit experimental rules, not researched physical constants or a complete economic policy.

There are four funded genesis machines: an extractor and workbench each for Alice and Bob. Their material is subtracted from reserves. Providers are genesis fixtures: host_a charges 1 minor U/tick with two concurrent slots; host_b charges 2 with one slot. This is logical simulation capacity, NOT evidence that real provider CPU has been measured or delivered. Provider admission and repricing are outside this change.

## Commands (v2 only)

| Action | Exact argument fields | Result |
|---|---|---|
| `publishRecipe` | `recipe` | Validates and records a definition by digest; no asset or reward |
| `startJob` | `id`, `recipe`, `machine`, `provider`, `termsHash` | Reserves inputs/reserve, owned machine and provider capacity; settles the quoted admission fee |
| `cancelJob` | `id` | Owner releases capacity, restores assembly inputs or unextracted reserve; no fee refund |
| `dismantle` | `asset` | Owner removes an idle, unlisted, undeployed asset and receives exactly its embodied material |

Other v1 economic and authority commands retain their semantics. `startJob` remains delegatable, within the existing action and spending mandate. The three new management actions are root-only in this pilot. Definitions cannot add delegatable actions or alter mandate budgets. A busy machine cannot be sold, dismantled or explicitly relocated. A machine offered for sale cannot run. Buying an idle machine transfers its actual logical capacity to its new owner.

The admission fee is paid on reservation, including for subsequently cancelled jobs. This is intentionally NOT a claim that real execution has already occurred. Do not quietly present it as verified pay-for-compute. Partial-progress accounting, provider default during a job and alternative refund contracts require later design.

Dismantling does not pay a reward, reverse prior fees or increase the reserve. It returns the material to inventory and records a retired asset ID. Old content backups restore only bytes against current title; they cannot resurrect that ID or its capacity. Jobs and retired IDs are not recycled. No production/dismantling loop issues currency.

A v2 machine can run without spatial deployment in this bounded model. Lease expiry does not remove its logical machine right. Requiring a physical installation, power supply or active tenancy before operation is a separate policy, not silently introduced here.

## Human use

`examples/recipes/` contains the exact checked-in definitions used by the fixtures. Validate a modified file locally with:

```sh
npm run recipe:check -- examples/recipes/plaque.v1.json
```

This checks the schema and prints the digest; it neither publishes nor executes anything. Publishing is an ordinary signed `publishRecipe` command. The existing fixture CLI resolves an unambiguous recipe name and idle owned machine for `startJob`, or accepts explicit digest/machine arguments. It never contacts a model provider.

The console defaults to the seventh experiment, **Build the machines that build**. It displays ownership, busy/idle machine slots and expandable full recipe definitions. This remains a fixed-trace viewer, not an interactive builder, live login UI or general script editor. The HTTP API remains mutable with signed fixture commands; the UI and API are deliberately not described as equivalent.

## Compatibility and bounds

`labGenesis()` still creates rules v1. `industrialGenesis()` creates v2 in a different world namespace. The command wire version remains 1; `body.world` distinguishes the world, and the genesis state version selects the appropriate rules. V1 `startJob` is unchanged. V2 requires a recipe digest and owned machine. No in-place v1-to-v2 migration is performed or implied.

The six original scenario checkpoint sequences are pinned in `test/fixtures/v1-checkpoints.json` and must remain byte-identical. V2 journal replay validates exact definitions and signed actions against a separately supplied trusted genesis and checkpoint.

The candidate caps recipe publication at 256 definitions. This is a bounded-lab abuse limit, not a production funding or moderation system. Jobs, retired IDs and the in-memory journal can still grow; public hosting remains prohibited. Identity fixtures are publicly known, and both hosts share a single writer.

## Review before merge

Review the integrated candidate against #2 and #3. Focus on the small core diff in `src/world.mjs` and the new interpreter in `src/industry.mjs`, not just the scenario narrative.

Check raw and money conservation through completion/cancellation/dismantling, machine sale/lease/backup interactions, provider reservation accounting, controller races and mandate budgets, recipe hash/version binding, strict rejection of extra fields, and old trace compatibility. Challenge the cancellation-fee policy and undeployed-machine assumption explicitly rather than accepting them because tests encode them.

The author must not mark this as independently reviewed or merge it solely on self-test evidence. No separate reviewer, OpenClaw/Hermes job or external coding agent was launched. A successful review should record exact commit, tests run, counterexamples, findings and residual assumptions in the PR.
