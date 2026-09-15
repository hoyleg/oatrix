/** Pure, integer-only transition function. No network, wall clock, LLM or file access.
 * All accepted transitions preserve currency and raw-material conservation.
 * This is an executable specification, not a distributed consensus implementation.
 */
import { demand, integer, identifier, text, digest, fields, canonical, clone, hash, sum, hashBytes } from './canonical.mjs';
import { verifyPayload, validatePublicKey } from './identity.mjs';
import { SWORD_CONTENT } from './genesis.mjs';
import { WORK_FIELDS, grantWork, assertWorkMandates } from './work-mandates.mjs';
import { INDUSTRY_FIELDS, industryAction, finishIndustryTick, assertIndustry } from './industry.mjs';

const MAX_MONEY = 1_000_000_000_000;
const ACTION_FIELDS = {
  transfer: ['to', 'amount'], commission: ['to', 'amount', 'deliverable', 'reason'],
  delegate: ['id', 'publicKey', 'actions', 'budget', 'until'], revoke: ['id'], rotateKey: ['publicKey'],
  startJob: ['id', 'recipe', 'provider', 'termsHash'], deploy: ['asset', 'slot', 'term', 'termsHash'], undeploy: ['asset'],
  offer: ['id', 'asset', 'price', 'until'], buy: ['offer', 'termsHash'], cancelOffer: ['offer'],
  openService: ['id', 'provider', 'budget', 'until', 'termsHash'], settleService: ['receipt', 'providerSignature'],
  refundService: ['id'], pause: ['reason'], resume: ['reason'], advance: ['ticks'],
  proposeRelease: ['id', 'manifest'], approveRelease: ['id', 'manifestHash'],
  recordRelease: ['id', 'manifestHash'], retireFounder: ['reason']
};
const DELEGATABLE = new Set(['transfer', 'startJob', 'buy', 'settleService']);
const DURING_PAUSE = new Set(['pause', 'resume', 'revoke', 'rotateKey', 'proposeRelease', 'approveRelease', 'recordRelease', 'retireFounder']);
const freezeVocabulary = source => Object.freeze(Object.fromEntries(
  Object.entries(source).map(([action, names]) => [action, Object.freeze([...names])])));
const VOCABULARIES = Object.freeze({
  1: freezeVocabulary(ACTION_FIELDS),
  2: freezeVocabulary({ ...ACTION_FIELDS, ...INDUSTRY_FIELDS }),
  3: freezeVocabulary({ ...ACTION_FIELDS, ...INDUSTRY_FIELDS, ...WORK_FIELDS })
});
/** Complete argument field vocabulary for an explicit STATE/rules version (not envelope v). */
export function actionFieldsFor(version) {
  demand(Number.isInteger(version) && Object.hasOwn(VOCABULARIES, version), 'RULES_VERSION');
  return VOCABULARIES[version];
}
export function actionsFor(version) { return Object.freeze(Object.keys(actionFieldsFor(version))); }
/** Legacy v1 compatibility only. Version-aware clients must use actionsFor/actionFieldsFor. */
export const ACTIONS = actionsFor(1);
function money(n, min = 1) { return integer(n, min, MAX_MONEY); }
function exists(map, id) { identifier(id); demand(Object.hasOwn(map, id), 'NOT_FOUND', id); return map[id]; }
function unique(map, id) { identifier(id); demand(!Object.hasOwn(map, id), 'ALREADY_EXISTS'); }
function move(state, from, to, amount) {
  money(amount, 0); demand(Object.hasOwn(state.balances, from) && Object.hasOwn(state.balances, to), 'UNKNOWN_ACCOUNT');
  demand(state.balances[from] >= amount, 'INSUFFICIENT_FUNDS');
  state.balances[from] -= amount; state.balances[to] += amount; money(state.balances[to], 0);
}
function payout(state, provider, gross, payer) {
  // Carry sub-minor-unit levy fractions by payer so splitting receipts does not avoid levies.
  const scaled = BigInt(gross) * BigInt(state.levyBps) + BigInt(state.levyRemainders[payer] ?? 0);
  const tax = Number(scaled / 10_000n);
  state.levyRemainders[payer] = Number(scaled % 10_000n);
  state.balances[provider] += gross - tax; state.balances.treasury += tax;
  return tax;
}
function debit(state, principal, authority, amount) {
  money(amount, 0); demand(state.balances[principal] >= amount, 'INSUFFICIENT_FUNDS');
  if (authority !== null) {
    demand(authority.budget >= amount, 'MANDATE_BUDGET'); authority.budget -= amount;
  }
  state.balances[principal] -= amount;
}
function ownerAsset(state, principal, id) {
  const asset = exists(state.assets, id); demand(asset.owner === principal, 'NOT_OWNER'); return asset;
}
function founder(state, principal) { demand(!state.retired && state.founder === principal, 'FOUNDER_ONLY'); }
function undock(state, id) {
  const asset = state.assets[id];
  if (asset.deployed !== null) { delete state.occupancy[asset.deployed]; asset.deployed = null; }
}
function unlockOffer(state, offer) {
  if (state.assets[offer.asset]?.locked === offer.id) state.assets[offer.asset].locked = null;
  offer.status = 'cancelled';
}
function finishTick(state) {
  if (state.v >= 2) finishIndustryTick(state);
  else for (const id of Object.keys(state.jobs).sort()) {
    const job = state.jobs[id];
    if (job.status !== 'running' || job.end > state.tick) continue;
    if (job.recipe === 'sword') {
      state.assets[id] = { owner: job.owner, kind: 'sword', embodied: { ore: 2, wood: 1 },
        content: hashBytes(SWORD_CONTENT), deployed: null, locked: null };
    } else state.inventory[job.owner][job.raw] += 1;
    job.status = 'complete';
  }
  for (const [slot, lease] of Object.entries(state.occupancy)) {
    if (lease.until !== null && lease.until <= state.tick) undock(state, lease.asset);
  }
  for (const offer of Object.values(state.offers)) {
    if (offer.status === 'open' && offer.until <= state.tick) unlockOffer(state, offer);
  }
}
/** Throw before committing if a signed instruction is invalid. Caller state is never mutated. */
export function transition(previous, envelope, currentHead = null) {
  demand(Buffer.byteLength(canonical(envelope)) <= 32_768, 'COMMAND_TOO_LARGE');
  fields(envelope, ['body', 'signature']);
  const b = envelope.body;
  const pinned = b?.v === 2;
  fields(b, ['v', 'world', 'principal', 'controller', 'epoch', 'nonce', 'expires', 'action', 'args',
    ...(pinned ? ['expectedHead', 'expectedStateHash'] : [])]);
  demand((b.v === 1 || pinned) && b.world === previous.world, 'WRONG_WORLD');
  if (pinned) {
    // The caller must supply the actual predecessor from its ordered journal.
    // No default, advertised snapshot or envelope-supplied head may stand in for it.
    demand(currentHead !== null, 'HEAD_CONTEXT_REQUIRED'); digest(currentHead);
    digest(b.expectedHead); digest(b.expectedStateHash);
    demand(b.expectedHead === currentHead, 'HEAD_CHANGED');
    demand(b.expectedStateHash === hash(previous), 'STATE_CHANGED');
  }
  identifier(b.principal); identifier(b.controller); integer(b.epoch, 1); integer(b.nonce, 1);
  integer(b.expires); demand(b.expires >= previous.tick && b.expires <= previous.tick + 1_000, 'EXPIRED_COMMAND');
  const actionFields = actionFieldsFor(previous.v);
  demand(typeof b.action === 'string' && Object.hasOwn(actionFields, b.action), 'UNKNOWN_ACTION'); fields(b.args, actionFields[b.action]);
  const oldIdentity = exists(previous.identities, b.principal);
  const delegated = b.controller !== 'root';
  const oldAuthority = delegated ? exists(oldIdentity.delegates, b.controller) : oldIdentity;
  demand(b.epoch === oldAuthority.epoch, 'STALE_CONTROLLER');
  if (delegated) {
    demand(oldAuthority.until > previous.tick, 'MANDATE_EXPIRED');
    demand(oldAuthority.actions.includes(b.action), 'MANDATE_ACTION');
  }
  const nonceKey = b.principal + ':' + b.controller + ':' + b.epoch;
  demand(b.nonce === (previous.nonces[nonceKey] ?? 0) + 1, 'BAD_NONCE');
  demand(verifyPayload(pinned ? 'OATRIX-COMMAND-2' : 'OATRIX-COMMAND-1', b, envelope.signature, oldAuthority.publicKey), 'BAD_SIGNATURE');
  demand(!previous.paused || DURING_PAUSE.has(b.action), 'WORLD_PAUSED');
  const s = clone(previous), p = b.principal, a = b.args;
  const identity = s.identities[p], authority = delegated ? identity.delegates[b.controller] : null;
  const event = { action: b.action, principal: p, tick: s.tick, details: {} };
  if (s.v >= 2 && Object.hasOwn(INDUSTRY_FIELDS, b.action)) {
    event.details = industryAction(s, p, b.action, a, authority, { debit, payout });
  } else switch (b.action) {
    case 'transfer': {
      exists(s.identities, a.to); money(a.amount); debit(s, p, authority, a.amount); s.balances[a.to] += a.amount; break;
    }
    case 'commission': {
      founder(s, p); exists(s.identities, a.to); money(a.amount); digest(a.deliverable); text(a.reason);
      move(s, 'treasury', a.to, a.amount); event.details = { acceptedBy: p, amount: a.amount, deliverable: a.deliverable, reason: a.reason }; break;
    }
    case 'delegateWork': {
      demand(authority === null, 'ROOT_ONLY'); event.details = grantWork(s, p, a); break;
    }
    case 'delegate': {
      unique(identity.delegates, a.id); demand(a.id !== 'root', 'RESERVED_ID'); validatePublicKey(a.publicKey);
      demand(Array.isArray(a.actions) && a.actions.length > 0 && a.actions.length <= DELEGATABLE.size && new Set(a.actions).size === a.actions.length && a.actions.every(x => DELEGATABLE.has(x)), 'BAD_DELEGATION');
      money(a.budget, 0); integer(a.until, s.tick + 1, s.tick + 1_000);
      identity.delegates[a.id] = { publicKey: a.publicKey, actions: [...a.actions].sort(), budget: a.budget, until: a.until, epoch: identity.nextDelegateEpoch++ };
      break;
    }
    case 'revoke': { exists(identity.delegates, a.id); delete identity.delegates[a.id]; break; }
    case 'rotateKey': {
      validatePublicKey(a.publicKey); identity.publicKey = a.publicKey; identity.epoch++; identity.delegates = {}; break;
    }
    case 'startJob': {
      unique(s.jobs, a.id); unique(s.assets, a.id);
      demand(!Object.values(s.jobs).some(j => j.owner === p && j.status === 'running'), 'CAPACITY_BUSY');
      demand(['mine_ore', 'mine_wood', 'sword'].includes(a.recipe), 'UNKNOWN_RECIPE');
      const providerTerms = exists(s.executionProviders, a.provider);
      demand(a.termsHash === hash(providerTerms), 'TERMS_CHANGED');
      const inputs = { ore: 0, wood: 0 };
      let raw = null, duration = 1;
      const fee = providerTerms[a.recipe];
      if (a.recipe === 'sword') {
        inputs.ore = 2; inputs.wood = 1; duration = 3;
        for (const [r, n] of Object.entries(inputs)) { demand(s.inventory[p][r] >= n, 'MISSING_INPUTS'); s.inventory[p][r] -= n; }
      } else {
        raw = a.recipe.slice(5); demand(s.reserve[raw] > 0, 'RESERVE_EMPTY'); s.reserve[raw]--;
      }
      debit(s, p, authority, fee); payout(s, a.provider, fee, p);
      s.jobs[a.id] = { owner: p, provider: a.provider, recipe: a.recipe, raw, inputs, end: s.tick + duration, status: 'running' };
      break;
    }
    case 'deploy': {
      const asset = ownerAsset(s, p, a.asset), slot = exists(s.slots, a.slot);
      demand(asset.deployed === null && asset.locked === null && (s.v < 2 || asset.busy === null), 'ASSET_BUSY');
      demand(!Object.hasOwn(s.occupancy, a.slot), 'SLOT_BUSY');
      digest(a.termsHash); demand(a.termsHash === hash(slot), 'TERMS_CHANGED');
      let until = null;
      if (slot.tenure === 'lease') {
        integer(a.term, 1, slot.maxTerm); const charge = slot.rate * a.term;
        debit(s, p, authority, charge); s.balances[slot.owner] += charge; until = s.tick + a.term;
      } else { demand(slot.owner === p, 'NOT_FREEHOLDER'); integer(a.term, 0, 0); }
      asset.deployed = a.slot;
      s.occupancy[a.slot] = { asset: a.asset, owner: p, until, termsHash: a.termsHash };
      break;
    }
    case 'undeploy': { const asset = ownerAsset(s, p, a.asset); demand(s.v < 2 || asset.busy === null, 'ASSET_BUSY'); undock(s, a.asset); break; }
    case 'offer': {
      unique(s.offers, a.id); const asset = ownerAsset(s, p, a.asset);
      demand(asset.deployed === null && asset.locked === null && (s.v < 2 || asset.busy === null), 'ASSET_BUSY'); money(a.price); integer(a.until, s.tick + 1, s.tick + 1_000);
      s.offers[a.id] = { id: a.id, seller: p, asset: a.asset, price: a.price, until: a.until, status: 'open' };
      asset.locked = a.id; break;
    }
    case 'buy': {
      const offer = exists(s.offers, a.offer); digest(a.termsHash);
      demand(a.termsHash === hash(offer), 'TERMS_CHANGED'); demand(offer.status === 'open' && offer.until > s.tick, 'OFFER_CLOSED');
      demand(offer.seller !== p, 'SELF_TRADE'); const asset = s.assets[offer.asset];
      demand(asset.owner === offer.seller && asset.locked === offer.id, 'STALE_OFFER');
      debit(s, p, authority, offer.price); const tax = payout(s, offer.seller, offer.price, p);
      asset.owner = p; asset.locked = null; offer.status = 'filled';
      event.details = { gross: offer.price, levy: tax }; break;
    }
    case 'cancelOffer': {
      const offer = exists(s.offers, a.offer); demand(offer.seller === p && offer.status === 'open', 'NOT_OPEN_SELLER'); unlockOffer(s, offer); break;
    }
    case 'openService': {
      unique(s.services, a.id); exists(s.identities, a.provider); demand(a.provider !== p, 'SELF_SERVICE');
      money(a.budget); integer(a.until, s.tick + 1, s.tick + 1_000); digest(a.termsHash);
      debit(s, p, authority, a.budget);
      s.services[a.id] = { payer: p, provider: a.provider, remaining: a.budget, until: a.until, termsHash: a.termsHash, receipts: {}, status: 'open' };
      break;
    }
    case 'settleService': {
      fields(a.receipt, ['world', 'service', 'request', 'amount', 'termsHash', 'outputHash']);
      const r = a.receipt, service = exists(s.services, r.service);
      demand(service.payer === p && service.status === 'open' && service.until > s.tick, 'SERVICE_CLOSED');
      demand(r.world === s.world && r.termsHash === service.termsHash, 'TERMS_CHANGED');
      identifier(r.request); digest(r.outputHash); money(r.amount);
      demand(!Object.hasOwn(service.receipts, r.request), 'RECEIPT_REPLAY');
      demand(r.amount <= service.remaining, 'ESCROW_LIMIT');
      demand(verifyPayload('OATRIX-SERVICE-1', r, a.providerSignature, s.identities[service.provider].publicKey), 'BAD_PROVIDER_SIGNATURE');
      if (authority !== null) { demand(authority.budget >= r.amount, 'MANDATE_BUDGET'); authority.budget -= r.amount; }
      service.remaining -= r.amount; const tax = payout(s, service.provider, r.amount, p); service.receipts[r.request] = hash(r);
      event.details = { acknowledgedBy: p, gross: r.amount, levy: tax }; break;
    }
    case 'refundService': {
      const service = exists(s.services, a.id); demand(service.payer === p && service.status === 'open' && s.tick >= service.until, 'REFUND_NOT_DUE');
      s.balances[p] += service.remaining; service.remaining = 0; service.status = 'closed'; break;
    }
    case 'pause': case 'resume': {
      founder(s, p); text(a.reason); s.paused = b.action === 'pause';
      const notice = { tick: s.tick, action: b.action, by: p, reason: a.reason };
      s.emergencyLog.push(notice); event.details = notice; break;
    }
    case 'advance': {
      founder(s, p); integer(a.ticks, 1, 100);
      for (let i = 0; i < a.ticks; i++) { s.tick++; finishTick(s); }
      event.details = { from: previous.tick, to: s.tick }; break;
    }
    case 'proposeRelease': {
      unique(s.releases, a.id);
      fields(a.manifest, ['source', 'artifact', 'tests', 'migration', 'description']);
      for (const key of ['source', 'artifact', 'tests', 'migration']) digest(a.manifest[key]);
      text(a.manifest.description);
      s.releases[a.id] = { author: p, manifest: clone(a.manifest), hash: hash(a.manifest), approvals: [], status: 'proposed' }; break;
    }
    case 'approveRelease': {
      const release = exists(s.releases, a.id); digest(a.manifestHash);
      demand(s.reviewers.includes(p) && release.author !== p, 'INDEPENDENT_REVIEW_REQUIRED');
      demand(release.status === 'proposed' && release.hash === a.manifestHash, 'MANIFEST_MISMATCH');
      demand(!release.approvals.includes(p), 'ALREADY_APPROVED'); release.approvals.push(p); release.approvals.sort(); break;
    }
    case 'recordRelease': {
      founder(s, p); const release = exists(s.releases, a.id); digest(a.manifestHash);
      demand(release.status === 'proposed' && release.hash === a.manifestHash, 'MANIFEST_MISMATCH');
      demand(release.approvals.length > 0, 'INDEPENDENT_REVIEW_REQUIRED');
      release.status = 'recorded'; event.details = { manifestHash: release.hash, note: 'Approval receipt only; no code is downloaded or executed.' }; break;
    }
    case 'retireFounder': {
      founder(s, p); text(a.reason); demand(!s.paused, 'RESUME_BEFORE_RETIRING');
      s.retired = true; s.emergencyLog.push({ tick: s.tick, action: b.action, by: p, reason: a.reason }); break;
    }
  }
  s.nonces[nonceKey] = b.nonce;
  assertInvariants(s);
  return { state: s, event };
}

/** Re-evaluate after EVERY action, including those generated by the adversarial tests. */
export function assertInvariants(s) {
  demand(s.v === 1 || s.v === 2 || s.v === 3, 'RULES_VERSION');
  if (s.v >= 2) assertIndustry(s);
  if (s.v === 3) assertWorkMandates(s);
  integer(s.tick); integer(s.levyBps, 0, 10_000);
  for (const fraction of Object.values(s.levyRemainders)) integer(fraction, 0, 9_999);
  const held = Object.values(s.services).map(x => x.remaining);
  for (const value of Object.values(s.balances)) money(value, 0);
  demand(sum([...Object.values(s.balances), ...held]) === s.supply, 'MONEY_NOT_CONSERVED');
  for (const raw of ['ore', 'wood']) {
    const amounts = [s.reserve[raw], ...Object.values(s.inventory).map(x => x[raw])];
    for (const job of Object.values(s.jobs)) if (job.status === 'running') amounts.push(job.inputs[raw] + (s.v >= 2 ? job.extracted[raw] : (job.raw === raw ? 1 : 0)));
    for (const asset of Object.values(s.assets)) amounts.push(asset.embodied[raw]);
    demand(sum(amounts) === s.rawTotal[raw], 'MATERIAL_NOT_CONSERVED');
  }
  for (const [id, asset] of Object.entries(s.assets)) {
    demand(Object.hasOwn(s.identities, asset.owner), 'ORPHAN_ASSET'); digest(asset.content);
    if (asset.deployed !== null) demand(s.occupancy[asset.deployed]?.asset === id && s.occupancy[asset.deployed]?.owner === asset.owner, 'BAD_DEPLOYMENT');
    if (asset.locked !== null) demand(s.offers[asset.locked]?.asset === id && s.offers[asset.locked]?.status === 'open', 'BAD_LOCK');
  }
  for (const [slot, occupancy] of Object.entries(s.occupancy)) {
    demand(Object.hasOwn(s.slots, slot) && s.assets[occupancy.asset]?.deployed === slot, 'ORPHAN_OCCUPANCY');
  }
  return true;
}
