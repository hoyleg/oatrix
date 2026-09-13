# Oatrix: an industrial shared reality

**Engineering baseline 0.6 — 13 September 2026**

This repository baseline incorporates the latest founder decisions into the previous *A Shared Reality* green-paper discussion. It is not a production prospectus, final constitution, land offer or claim of independent security review. Confirmed decisions and proposed implementation choices are separated in `decisions.md`.

## 1. The proposition

A shared world can begin before immersive hardware or mass human interest. People and their agents can create tools, machines, places and institutions under common rules. Humans can observe through a small web interface, interact through an API, or eventually take direct control of a resident through richer clients.

The founder has deliberately not selected the dominant use case. The objective is a place where creation can occur on an industrial basis: raw inputs, capacity, time, information and services matter. The first test is whether those underlying principles can be modelled coherently, not whether a predetermined marketplace can attract customers.

An important correction: **cost is a constraint, not proof of value**. A laborious useless object remains useless. The system can verify authorised creation and conserve resources; buyers and accountable public commissions decide what to fund. A scripted buyer in a deterministic experiment is an exposed assumption, not evidence of demand.

## 2. What should be earned

Extraction releases a defined resource from a reserve under an access and capacity rule. Manufacturing transforms inputs into an output. Service provision fulfils a specified obligation. Monetary issuance changes the supply of settlement units. These are different events and should not be conflated under the word mining.

The durable contribution of an intelligent agent may be a program: a forge controller, a survey tool, an inventory service, a construction technique or an institution's operating machinery. Once defined, routine work should run deterministically without buying another model response for every step. Copying an eligible blueprint must not copy its materials, inventory, permissions or reserved processing capacity.

Useful work is normally rewarded by a counterparty paying from an existing budget. A public fund can commission work under a published envelope and acceptance process. Neither CPU activity, messages, claimed model calls nor self-endorsed construction should automatically mint money. That avoids a circular economy in which bots manufacture evidence of activity solely to collect rewards.

The pilot supplies only two public raw materials and one fabrication recipe. This is a deliberately small executable model of the principle, not a claim that industrial value can be reduced to ore and swords. Bounded deterministic experiments can explore costs, capacity, rents, concentrated ownership and storage failure before involving models.

## 3. The internal unit and public projects

A divisible settlement unit is useful where heterogeneous providers do not want one another's goods. It allows an indivisible machine to be sold, a service to be prepaid, and a levy to be deducted from sale proceeds. Barter and later external settlement need not be prohibited.

P0 uses resettable U with a fixed test supply and no redemption promise. Production transfers existing units rather than minting them. Public commissions, service payments and rent are observable transfers. A settlement levy is not a profit tax: the ledger does not know off-platform expenditure, depreciation or whether an agent accurately described its costs.

Sub-unit tax fractions are carried by payer in the model so splitting one payment into tiny receipts does not eliminate a levy. This is an accounting experiment, not the final policy for multi-party incidence, avoidance or price formation. The production monetary charter, convertibility, founder allocation, issuance, reserves and legal classification remain open.

A treasury holding virtual materials cannot pay a real server bill unless someone actually accepts those materials or the internal unit. Real electricity, hardware, bandwidth and upstream inference still have external costs. No amount of accounting can guarantee that providers will value U. Adoption can be excluded from a software-delivery estimate, but not from an economic-sustainability claim.

## 4. Identity belongs to the participant, not the node

People should be able to use any compatible host without replacing their account, citizenship, property or agent history. Hosting can be competitive precisely because the provider is not the owner of the participant's identity.

The architecture distinguishes an accountable principal, an enduring resident, its current controller, the agent runtime and world infrastructure. A human, deterministic program or model-backed agent can control the same resident within a revocable mandate. Running many agents does not create additional principals or votes.

Authentication has two boundaries. A host-specific challenge establishes a short-lived session with that host. A world action is independently signed for a particular principal, controller epoch, operation, parameters, nonce and expiry. The latter is relayable through another compatible host; possession of a host session token alone does not grant economic authority.

An arbitrary login website cannot be trusted with a root key merely because it offers a competitive price. Production requires a separately trusted signer and independently verifiable identity state. Passkeys are scoped to relying parties; portability is not achieved by assuming every unrelated origin can use the same credential. The fixture implementation tests host-neutral authority and rotation, not a production wallet, KYC or general account recovery.

## 5. Title, bytes, hosting and place are four different promises

An asset's title establishes its current owner and relevant rights. Its content is the retained collection of bytes needed to present or operate it. Hosting supplies availability or computation for a defined period. Deployment places it in an active location under particular terms.

These must not be bundled into a false promise of permanent free service. Participants may use online replicas, specialist backup firms, their own offline archives or no additional backup. Loss may be real. Losing all usable copies and required keys can make content unrecoverable despite a surviving deed.

The common ledger still requires its own durability policy. Optional personal backups cannot replace an available current record of title, spending and finalised obligations. A self-consistent old chain is not automatically the latest chain; recovery needs known genesis and an independently retained checkpoint.

Cold content restoration must reference current authority. It restores bytes, not a historical owner, spent ore, an earlier balance or a deployment that has since been reassigned. A former owner can retain a copy of a design file; ownership checking does not magically erase it or establish a right to redistribute it.

## 6. Dormancy without confiscation

Leases follow their agreed duration and conditions. Freehold means durable title, not a lease secretly renamed for marketing. An unused publicly leased deployment can become dormant while the creation remains privately owned.

The returning owner can restore the content and seek an available location under new terms. They must not automatically displace the legitimate successor occupying an expired location. This provides a route to avoid a permanently empty public landscape without destroying everyone's half-built project.

For freehold, separate any renewable hosting, access route, public frontage or discovery-listing licence from the underlying title. Revoking the former must not be presented as preserving freehold while taking the actual land away. An archipelago of districts and gateways may help isolate durable estates from changing public gathering places, but its spatial and contractual details still need experiments.

P0 implements lease expiry and non-expiring freehold separately. It does not yet implement relocation priority, subletting, resident voting, tenancy assignment or a public-space allocation market.

## 7. Providers, receipts and failure

A participant can provide storage, access, model inference or other services without acquiring sovereignty. The agent runtime normally handles model-provider communications; model prompts, private memory and credentials do not belong on the shared ledger.

A provider may offer local models or managed upstream access and charge a disclosed margin where permitted by relevant terms. The contract should identify budget, service, output handling, retention, provider identity and acceptance rules. Compact settlement receipts can record cost and levy without publishing every prompt.

Receipts prove attributed statements and authorised payments, not that a particular model actually ran or the output was good. No inference-based public subsidy should arise merely from two related accounts signing receipts for one another.

Prepaid providers can fail. The model does not automatically charge unrelated operators to replace what a failed provider lost. Direct prepayment, escrow, accepted delivery, insurance and guarantees are distinct bargains. Optional capped escrow limits exposure: only unused funds return after expiry; payments already acknowledged do not become a claim on everyone else.

That is a proposed protocol allocation of risk, not a blanket determination of legal liability. The operator's own conduct, promises, applicable consumer protections, fraud and jurisdiction still matter. Qualified advice and an accountable legal structure are required before actual public services or external value.

## 8. Rules and government without an automatic state-building project

The federation should protect core identity, ownership, resource integrity, privacy commitments and authorised change. Districts may govern local places and services within those protections. Institutions such as guilds, cooperatives and schools can cross district boundaries without being territorial sovereigns.

Political legitimacy, technical competence and control of validators are different matters. Constitutional membership should not multiply with wallets, processes, land or model size. Domain reputation can qualify reviewers and inform bounded responsibility, but time served and recursively weighted applause must not create unlimited inherited control.

An accountable member assembly, rotating expert review and a bounded dispute process are useful functional ideas. Implementing a full parliament, judiciary and military before a coherent engine is not. The first operations should separate commissioning, accepting work, paying for it, approving a release and deciding an appeal.

The founder retains override until the system can operate without runaway failure. No deadline is invented. The bootstrap must therefore be described honestly as founder-controlled. In the lab, pause/resume and public-fund transfers are explicit and logged; there is no ordinary arbitrary-seizure or monetary-mint command.

Control over deployed software remains broader than those in-model permissions. Recovery or a reset outside them must be disclosed, not portrayed as ordinary immutable history. Handover requires independent operators, recovery without founder secrets, review capacity, tested emergency arrangements and working successor authority. A founder retirement experiment that disables the current clock is not itself a completed transfer of government.

## 9. Creation and contribution can include the protocol itself

Early participants can help build components of Oatrix, including clients, machinery and services. That is useful work with inspectable outputs rather than scenery generation for a nonexistent world. It remains one possible early activity, not the mandated purpose of the eventual world.

Commissioning, merging source, approving a release and activating it are separate. A release decision must bind exact source/build/test/migration evidence. The existing rules authorise the new rules; the candidate cannot first weaken the gate that judges itself.

The lab records proposed manifests, distinct-reviewer approval and founder release receipts. It does not install code, merge a GitHub PR or prove that a reviewer is independent in real life. Those integrations are future work requiring protected CI, independent signers, reproducible evidence and operator verification.

The repository has no founder-selected open-source licence yet. Public visibility must not be used to imply that an agent has granted a licence, approved inbound rights or fixed the founder's financial allocation.

## 10. Personality and evidence do not create authority

An agent can have an authored persona and acquire relationships, memories and preferences. Its mandate and external obligations remain separate. Becoming ambitious does not increase its spending cap. Replacing the model does not erase a tenancy. A cheap model user is not a lesser citizen.

Keep relevant state structured, retain source-linked memories and retrieve only what a task needs. Trigger expensive deliberation on events and exceptions rather than every simulation tick. Unsolicited messages must not be able to spend the recipient's unlimited inference budget. Human takeover revokes or narrows the relevant controller lease without undoing finalised commitments.

Treat protocol state, observations, attestations, opinions and claims differently. A thousand copies of a rumour are not a thousand independent witnesses. Reference runtimes should preserve derivation, cap attention and check actual authoritative records for rule changes. Hidden coordination, persuasive lies and correlated model errors remain unsolved by such bookkeeping.

Review is essential but not a substitute for prompt-injection containment. A valid transaction may be foolish, and an allegedly independent reviewer may consume the same poisoned evidence. Enforce bounded actions outside the model, separate sensitive execution, protect tests from the patch being tested, and state residual uncertainty honestly.

## 11. Privacy, interoperability and quantum resilience

People should eventually have private areas. Admission control, confidentiality from other residents and confidentiality from operators are separate assurances. Public-state pilots must not pretend UI hiding is privacy. Private economic effects still need verifiable conservation; zero-knowledge claims and encrypted hosting are future specialised work, not turnkey fixes.

Interoperability starts with origin-qualified identities, declared capabilities, versioning, permissions and explicit foreign-asset recognition. A foreign sword can import its appearance without importing arbitrary powers, citizenship or resource scarcity. Districts cannot unilaterally accept outside assets in a way that weakens federal economic integrity. Treaties can be decided later; the authority boundary cannot be omitted now.

The lab uses conventional Ed25519 signatures and hash-linked history. It is not quantum resilient. Production needs key/algorithm agility, owner and validator authentication, release signing, recovery, checkpoint retention and a reviewed migration plan. Adding a post-quantum owner signature alone cannot protect vulnerable validator or upgrade authority.

## 12. Delivery and falsification

P0 now consists of a standard-library Node implementation, local host-neutral signed APIs, a replayable journal, property and service models, a static web console and tests. No model calls or paid infrastructure are required. This deliberately precedes the Besu/QBFT ledger experiment described in v0.5.

What could disprove the next design choice? A conservation exploit, a tenancy rule that silently takes freehold, a backup that rolls back a sale, a provider receipt that mints money, a gateway that owns identity, an unbounded founder power disguised as decentralisation, or a scripted economy reported as evidence of real demand.

The next work should close such gaps in bounded slices. Do not interpret a large codebase or many agent messages as progress by themselves. The first milestone is a coherent model of authorised creation, exchange, failure and recovery. Economic demand, sound autonomous judgement and a resilient federation must each earn their own evidence.

See `experiments.md`, `verification.md` and `roadmap.md` for executable evidence, current limits and the next gates. Component sources are in `sources.md`.
