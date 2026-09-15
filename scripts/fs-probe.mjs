/** Diagnostics only: no secrets or persistent files; keep path/handle metadata visible in CI. */
import { mkdtempSync, writeFileSync, openSync, closeSync, lstatSync, fstatSync, rmSync } from 'node:fs';
import { tmpdir, release } from 'node:os';
import { join } from 'node:path';
import { pathMatchesHandle, sameOpenFile } from '../src/file-identity.mjs';
const directory = mkdtempSync(join(tmpdir(), 'oatrix-fs-probe-')); let a, b;
try {
  const path = join(directory, 'probe'); writeFileSync(path, 'probe');
  a = openSync(path, 'r'); b = openSync(path, 'r');
  const p = lstatSync(path, { bigint: true }), h = fstatSync(a, { bigint: true }), h2 = fstatSync(b, { bigint: true });
  const values = s => Object.fromEntries(['dev', 'ino', 'size', 'nlink'].map(k => [k, s[k].toString()]));
  const result = { node: process.version, uv: process.versions.uv, platform: process.platform, os: release(),
    path: values(p), handle: values(h), originalStrictEqual: p.dev === h.dev && p.ino === h.ino && p.size === h.size,
    compatible: pathMatchesHandle(p, h), strictHandles: sameOpenFile(h, h2) };
  console.log(JSON.stringify(result, null, 2));
  if (!result.compatible || !result.strictHandles) throw new Error('File identity probe failed');
} finally { if (b !== undefined) closeSync(b); if (a !== undefined) closeSync(a); rmSync(directory, { recursive: true, force: true }); }
