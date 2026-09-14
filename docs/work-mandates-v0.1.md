# Scoped work mandates — opt-in rules v3 candidate

**Status: experimental, awaiting fresh review.** The ordinary `npm start`, archived scenarios and P0.3 comparisons still use rules v1/v2. There is no implicit migration, activation or public deployment. A `delegateWork` command is unknown in a v1/v2 world. `workMandateGenesis()` is a separate v3 fixture.

## Purpose

PR #5's review correctly observed that a small U budget is not a cap on materials an agent can consume. This proposal adds an explicitly selected work-only credential; it does not silently reinterpret old `delegate` grants.

The principal's root key authorises:

```json
{
  "id": "worker",
  "publicKey": "<worker Ed25519 public key>",
  "budget": 100,
  "until": 100,
  "scope": {
    "recipes": ["<exact 64-hex recipe digest>"],
    "machines": ["alice_workbench"],
    "providers": [{"id": "host_a", "termsHash": "<exact provider terms digest>"}],
    "inputs": {"ore": 1, "wood": 1},
    "extraction": {"ore": 0, "wood": 0},
    "jobs": 2
  }
}
```

`budget` is cumulative minor U, not a resource valuation. `until` is a logical-time admission deadline. Recipes/machines/providers are non-empty, duplicate-free lists of at most 32 entries. Material caps range from 0 to 1,000,000 integer units and admitted jobs from 1 to 1,000. The existing command-byte and expiry limits still apply.

At grant time, recipes must exist, machines must belong to the principal, and provider terms must match current records. The stored policy is sorted and its digest recorded. It cannot be edited in flight by the delegate; revoke and grant again with root authority to change it.

## Enforcement

The credential can submit **only `startJob`**. It cannot transfer money directly, buy assets, cancel/dismantle work, grant another credential, change keys, vote, approve releases or alter its own scope. Those remain separately authorised responsibilities.

For each accepted job, the reducer checks the exact recipe, machine and provider/terms pair; then cumulative material inputs, cumulative extraction and the admission count. The existing U debit, ownership, funds, inventory, machine availability and provider-capacity checks also remain mandatory. All work occurs on the cloned candidate state; a rejection changes no nonce, balance, material, usage counter or journal head.

The counters measure **cumulative accepted admission**, not net consumption or useful output:

- Cancellation returns the recipe's reserved resources under the existing rule but does not refund the grant allowance or the already-paid fee.
- Dismantling returns embodied material but does not renew permission to process it repeatedly.
- A zero-fee provider still consumes an admission and applicable material/extraction allowance.
- Completion does not charge the same allowance a second time.

This conservative policy prevents cancelled/recycled work repeatedly consuming capacity under a nominally tiny grant. It is not a promise that every permitted job is wise, nor a general purpose task-language.

## Lifecycle and overlap

A grant is **not a reservation** of funds, inventory, provider service or machine availability. Root activity or another valid grant may consume those resources first. Starting a job still has to succeed against current state.

Allowances are per grant. Two root-authorised grants create two distinct allowances; they do not share an implicit principal-wide budget. Reusing the same worker key does not aggregate grants. A parent budget and subdelegation are deliberately not implemented. An owner must account for the sum of its grants; do not describe this as preventing a principal from oversubscribing its own resources.

Ordinary revocation, expiry and root-key rotation block new admissions. They do not rewind already accepted obligations or automatically cancel running jobs. Root can separately cancel under the existing policy. Regranting the same controller ID uses a new epoch, so old pending signatures cannot operate the new grant. Regranting also deliberately authorises fresh allowances; the worker cannot do that for itself.

A machine can subsequently be sold or dismantled. That does not corrupt the world merely because an old scope names it; normal live ownership/existence checks stop the old delegate using it. There is no new recipe or machine ID resurrection mechanism.

Legacy `delegate` remains available, including in v3, and remains currency-only. Integrations must explicitly use `delegateWork` to receive these protections. No default UI disguises the legacy grant as safe. Since the default server remains v2, it will reject a work grant rather than silently downgrade it.

## Run the isolated demonstration

```sh
npm run verify
npm run demo:work
```

`demo:work` writes `.oatrix/work-mandates.json` plus `.oatrix/work-mandates-journal.json`. It funds inputs by actual extraction, grants one material allocation, admits and cancels a job, rejects a second admission despite returned stock/remaining U, revokes the worker, and lets the owner complete its own product. It replays the full journal. No browser, model or external service is involved.

`test:e2e` includes two opt-in v3 child-process/HTTP workflows. The private test-process flag `--work-mandates` selects the v3 fixture; default test hosts remain v2. Neither IPC nor test requests expose a direct state-edit route. Both listeners still share one writer, so this is not distributed-consensus coverage.

## Fresh review required before integration

Review the exact PR head against `main`, not only this document. Focus on:

1. Can a scoped signer consume inputs, extraction, fees, machines, provider terms or admission counts beyond its actual grant? Distinguish separately root-authorised overlapping grants from privilege escalation.
2. Do cancelled, completed, dismantled, rejected, duplicated, racing, revoked, expired and regranted paths maintain counters, epochs, ownership and money/material conservation?
3. Can scope data become extra authority, or malformed arrays/fields, term substitution or recipe-name ambiguity bypass exact binding?
4. Do every old scenario and the full P0.3 report retain their checkpoints? Does v1/v2 reject the new command? Is v3 adoption explicit?
5. Do tests check an undesirable result independently, rather than merely agreeing with the author's implementation?

Run `npm run verify`; add minimal counterexample tests without weakening old assertions. Record exact commit, commands, findings and residual policies as a PR comment. Do not merge, deploy, buy services, launch agents or change licensing. This request is a fresh technical review, not an organisational audit.

## Residual limitations

Fixture keys are public. No production signer, global-grant budget, model competence assessment, source-truth oracle or proof of useful work exists. Logical time pauses with the founder's brake. Grant counts and history are not yet bounded for an indefinite public network; list limits are not a DoS proof. General recipe review and protocol governance remain separate. A hostile agent can still choose a foolish action inside an adequate grant; this change constrains consequences, not persuasion.
