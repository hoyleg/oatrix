/**
 * Experimental host-neutral root signer for P0.4.
 *
 * The signer owns the private key. Gateways receive signatures, never key material.
 * It pins a human/agent intent to an exact observed world head before constructing
 * the Oatrix command envelope. This limits gateway substitution; it does NOT prove
 * that a gateway's snapshot is the canonical federation state (P1 concern).
 */
import {
  createCipheriv, createDecipheriv, createPrivateKey, randomBytes, scryptSync
} from 'node:crypto';
import { canonical, clone, demand, digest, fields, identifier, integer, text } from './canonical.mjs';
import { actionFieldsFor } from './world.mjs';
import { publicKey, signPayload } from './identity.mjs';

const VAULT_VERSION = 1;
const KDF = Object.freeze({ name: 'scrypt', N: 16_384, r: 8, p: 1, keyLength: 32 });
const CIPHER = 'aes-256-gcm';

function origin(value) {
  text(value, 500);
  let url;
  try { url = new URL(value); } catch { demand(false, 'BAD_AUDIENCE'); }
  demand(url.origin === value && ['http:', 'https:'].includes(url.protocol), 'BAD_AUDIENCE');
  if (url.protocol === 'http:') demand(['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname), 'INSECURE_AUDIENCE');
  return url.origin;
}
function passphrase(value) { demand(typeof value === 'string' && value.length >= 12 && value.length <= 1024, 'BAD_PASSPHRASE'); }
function headerFor(vault) {
  return {
    v: vault.v, principal: vault.principal, world: vault.world, publicKey: vault.publicKey,
    kdf: vault.kdf, cipher: vault.cipher
  };
}
function b64(bytes) { return Buffer.from(bytes).toString('base64url'); }
function bytes(value, min, max, code = 'BAD_VAULT') {
  demand(typeof value === 'string' && /^[A-Za-z0-9_-]+$/.test(value), code);
  const out = Buffer.from(value, 'base64url');
  demand(out.length >= min && out.length <= max && out.toString('base64url') === value, code);
  return out;
}
function validateVault(vault) {
  fields(vault, ['v', 'principal', 'world', 'publicKey', 'kdf', 'cipher', 'salt', 'iv', 'tag', 'ciphertext']);
  demand(vault.v === VAULT_VERSION, 'VAULT_VERSION'); identifier(vault.principal); text(vault.world, 200); text(vault.publicKey, 128);
  fields(vault.kdf, ['name', 'N', 'r', 'p', 'keyLength']);
  demand(vault.kdf.name === KDF.name && vault.kdf.N === KDF.N && vault.kdf.r === KDF.r && vault.kdf.p === KDF.p && vault.kdf.keyLength === KDF.keyLength, 'VAULT_KDF');
  demand(vault.cipher === CIPHER, 'VAULT_CIPHER'); bytes(vault.salt, 16, 16); bytes(vault.iv, 12, 12); bytes(vault.tag, 16, 16); bytes(vault.ciphertext, 1, 4096);
}

export class PortableSigner {
  #key; #now; #audiences;
  constructor({ principal, world, privateKey, audiences, now = () => Date.now() }) {
    identifier(principal); text(world, 200); demand(privateKey && typeof privateKey === 'object', 'BAD_PRIVATE_KEY');
    demand(Array.isArray(audiences) && audiences.length >= 1 && audiences.length <= 32, 'BAD_AUDIENCES');
    this.principal = principal; this.world = world; this.publicKey = publicKey(privateKey);
    this.#key = privateKey; this.#now = now; this.#audiences = new Set(audiences.map(origin));
    demand(this.#audiences.size === audiences.length, 'DUPLICATE_AUDIENCE');
  }
  descriptor() { return { v: 1, principal: this.principal, world: this.world, publicKey: this.publicKey, audiences: [...this.#audiences].sort() }; }
  signLogin(challenge) {
    fields(challenge, ['v', 'world', 'audience', 'principal', 'epoch', 'nonce', 'expiresAt']);
    demand(challenge.v === 1 && challenge.world === this.world && challenge.principal === this.principal, 'LOGIN_IDENTITY');
    demand(this.#audiences.has(origin(challenge.audience)), 'AUDIENCE_NOT_ALLOWED'); integer(challenge.epoch, 1);
    text(challenge.nonce, 100); integer(challenge.expiresAt, 1, Number.MAX_SAFE_INTEGER);
    const now = this.#now(); demand(challenge.expiresAt > now && challenge.expiresAt <= now + 120_000, 'LOGIN_EXPIRES');
    return signPayload('OATRIX-LOGIN-1', challenge, this.#key);
  }
  /** Sign only a caller-declared intent against the exact snapshot head it reviewed. */
  signIntent(snapshot, intent) {
    fields(snapshot, ['head', 'state']); digest(snapshot.head);
    fields(intent, ['action', 'args', 'expectedHead', 'expiresIn']); digest(intent.expectedHead);
    demand(intent.expectedHead === snapshot.head, 'HEAD_CHANGED'); integer(intent.expiresIn, 1, 1_000);
    const state = snapshot.state; demand(state && state.world === this.world, 'WRONG_WORLD');
    const identity = state.identities?.[this.principal]; demand(identity, 'UNKNOWN_PRINCIPAL');
    demand(identity.publicKey === this.publicKey, 'SIGNER_NOT_CURRENT'); integer(identity.epoch, 1); integer(state.tick, 0);
    const vocabulary = actionFieldsFor(state.v);
    demand(typeof intent.action === 'string' && Object.hasOwn(vocabulary, intent.action), 'UNKNOWN_ACTION');
    fields(intent.args, vocabulary[intent.action]);
    const nonceKey = `${this.principal}:root:${identity.epoch}`;
    const body = {
      v: 1, world: this.world, principal: this.principal, controller: 'root', epoch: identity.epoch,
      nonce: (state.nonces?.[nonceKey] ?? 0) + 1, expires: state.tick + intent.expiresIn,
      action: intent.action, args: clone(intent.args)
    };
    return { body, signature: signPayload('OATRIX-COMMAND-1', body, this.#key) };
  }
  seal(passphraseValue) {
    passphrase(passphraseValue);
    const salt = randomBytes(16), iv = randomBytes(12);
    const vault = { v: VAULT_VERSION, principal: this.principal, world: this.world, publicKey: this.publicKey,
      kdf: { ...KDF }, cipher: CIPHER, salt: b64(salt), iv: b64(iv), tag: '', ciphertext: '' };
    const key = scryptSync(passphraseValue, salt, KDF.keyLength, { N: KDF.N, r: KDF.r, p: KDF.p, maxmem: 64 * 1024 * 1024 });
    const cipher = createCipheriv(CIPHER, key, iv); cipher.setAAD(Buffer.from(canonical(headerFor(vault))));
    const plaintext = this.#key.export({ type: 'pkcs8', format: 'der' });
    const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    vault.tag = b64(cipher.getAuthTag()); vault.ciphertext = b64(ciphertext);
    return vault;
  }
}

export function restorePortableSigner(vault, passphraseValue, { audiences, now = () => Date.now() }) {
  validateVault(vault); passphrase(passphraseValue);
  const salt = bytes(vault.salt, 16, 16), iv = bytes(vault.iv, 12, 12), tag = bytes(vault.tag, 16, 16), ciphertext = bytes(vault.ciphertext, 1, 4096);
  try {
    const keyBytes = scryptSync(passphraseValue, salt, vault.kdf.keyLength, { N: vault.kdf.N, r: vault.kdf.r, p: vault.kdf.p, maxmem: 64 * 1024 * 1024 });
    const decipher = createDecipheriv(vault.cipher, keyBytes, iv); decipher.setAAD(Buffer.from(canonical(headerFor(vault)))); decipher.setAuthTag(tag);
    const der = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    const privateKey = createPrivateKey({ key: der, format: 'der', type: 'pkcs8' });
    demand(publicKey(privateKey) === vault.publicKey, 'VAULT_KEY_MISMATCH');
    return new PortableSigner({ principal: vault.principal, world: vault.world, privateKey, audiences, now });
  } catch (error) {
    if (error?.name === 'RuleError') throw error;
    demand(false, 'VAULT_DECRYPT');
  }
}
