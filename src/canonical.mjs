/** Restricted canonical JSON: integers only, sorted keys, bounded depth and no prototype keys.
 * This is Oatrix's laboratory encoding, NOT an implementation of RFC 8785.
 * Never silently change it: command signatures and journal hashes depend on these bytes.
 */
import { createHash } from 'node:crypto';
export class RuleError extends Error {
  constructor(code, message = code) { super(message); this.name = 'RuleError'; this.code = code; }
}
export function demand(condition, code, message) {
  if (!condition) throw new RuleError(code, message);
}
export function integer(value, min = 0, max = 1_000_000_000) {
  demand(Number.isSafeInteger(value) && !Object.is(value, -0) && value >= min && value <= max, 'BAD_INTEGER');
  return value;
}
export function identifier(value) {
  demand(typeof value === 'string' && /^[a-z][a-z0-9_-]{0,63}$/.test(value), 'BAD_IDENTIFIER');
  demand(!['constructor', 'prototype', '__proto__'].includes(value), 'BAD_IDENTIFIER');
  return value;
}
export function text(value, max = 500) {
  demand(typeof value === 'string' && value.length > 0 && value.length <= max, 'BAD_TEXT');
  return value;
}
export function digest(value) {
  demand(typeof value === 'string' && /^[0-9a-f]{64}$/.test(value), 'BAD_DIGEST');
  return value;
}
export function fields(value, names) {
  demand(value !== null && typeof value === 'object' && !Array.isArray(value), 'BAD_OBJECT');
  const actual = Object.keys(value).sort();
  demand(JSON.stringify(actual) === JSON.stringify([...names].sort()), 'BAD_FIELDS');
}
export function canonical(value, depth = 0) {
  demand(depth <= 32, 'TOO_DEEP');
  if (value === null || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number') { integer(value, -Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER); return String(value); }
  if (typeof value === 'string') { demand(value.length <= 100_000, 'TEXT_TOO_LARGE'); return JSON.stringify(value); }
  if (Array.isArray(value)) {
    demand(value.length <= 100_000, 'ARRAY_TOO_LARGE');
    return '[' + Array.from(value, x => canonical(x, depth + 1)).join(',') + ']';
  }
  demand(value !== null && typeof value === 'object' && [Object.prototype, null].includes(Object.getPrototypeOf(value)), 'NOT_JSON');
  return '{' + Object.keys(value).sort().map(key => {
    demand(!['__proto__', 'prototype', 'constructor'].includes(key), 'UNSAFE_KEY');
    return JSON.stringify(key) + ':' + canonical(value[key], depth + 1);
  }).join(',') + '}';
}
export function hash(value) { return hashBytes(Buffer.from(canonical(value))); }
export function hashBytes(bytes) { return createHash('sha256').update(bytes).digest('hex'); }
export function clone(value) { return JSON.parse(canonical(value)); }
export function sum(values) {
  let total = 0;
  for (const value of values) { integer(value, 0, Number.MAX_SAFE_INTEGER); total += value; integer(total, 0, Number.MAX_SAFE_INTEGER); }
  return total;
}
