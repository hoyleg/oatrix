/** Standard-library Ed25519 for the LAB ONLY. Not post-quantum and not production identity/KYC.
 * A principal identifier survives hosts and key rotation; a private key never belongs in a gateway.
 */
import { createPrivateKey, createPublicKey, generateKeyPairSync, sign, verify } from 'node:crypto';
import { canonical, demand, hashBytes } from './canonical.mjs';
export function publicKey(key) {
  return createPublicKey(key).export({ type: 'spki', format: 'der' }).toString('base64url');
}
export function validatePublicKey(value) {
  demand(typeof value === 'string' && value.length <= 128, 'BAD_PUBLIC_KEY');
  try {
    const der = Buffer.from(value, 'base64url');
    const key = createPublicKey({ key: der, format: 'der', type: 'spki' });
    demand(key.asymmetricKeyType === 'ed25519' && der.toString('base64url') === value && der.length === 44, 'BAD_PUBLIC_KEY');
    return key;
  } catch { demand(false, 'BAD_PUBLIC_KEY'); }
}
export function freshKey() { return generateKeyPairSync('ed25519').privateKey; }
/** Reproducible, publicly known PRIVATE test keys. NEVER use for valuable assets. */
export function fixtureKey(label) {
  const seed = Buffer.from(hashBytes(Buffer.from('OATRIX-PUBLIC-TEST-KEY:' + label)), 'hex');
  return createPrivateKey({ key: Buffer.concat([Buffer.from('302e020100300506032b657004220420', 'hex'), seed]), format: 'der', type: 'pkcs8' });
}
export function signPayload(domain, body, key) {
  return sign(null, Buffer.from(domain + '\n' + canonical(body)), key).toString('base64url');
}
export function verifyPayload(domain, body, signature, pub) {
  if (typeof signature !== 'string' || !/^[A-Za-z0-9_-]{86}$/.test(signature)) return false;
  try { return verify(null, Buffer.from(domain + '\n' + canonical(body)), validatePublicKey(pub), Buffer.from(signature, 'base64url')); }
  catch { return false; }
}
export function command(state, principal, action, args, key, options = {}) {
  const identity = state.identities[principal];
  demand(identity, 'UNKNOWN_PRINCIPAL');
  const controller = options.controller ?? 'root';
  const epoch = controller === 'root' ? identity.epoch : identity.delegates[controller]?.epoch;
  const nonceKey = principal + ':' + controller + ':' + epoch;
  const body = {
    v: 1, world: state.world, principal, controller, epoch,
    nonce: (state.nonces[nonceKey] ?? 0) + 1, expires: state.tick + 100,
    action, args, ...options
  };
  return { body, signature: signPayload('OATRIX-COMMAND-1', body, key) };
}
