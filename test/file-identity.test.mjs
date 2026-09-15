import test from 'node:test';
import assert from 'node:assert/strict';
import { pathMatchesHandle, sameOpenFile } from '../src/file-identity.mjs';
const info = (change = {}) => ({ dev: 42n, ino: 21110623254304612n, size: 453n, nlink: 1n,
  isFile: () => true, isSymbolicLink: () => false, ...change });
test('Windows path dev=0 and handle volume serial are compatible without dropping file identity', () => {
  const path = info({ dev: 0n }), handle = info();
  assert.notEqual(path.dev, handle.dev); // Original direct equality incorrectly rejects this shape.
  assert.equal(pathMatchesHandle(path, handle, 'win32'), true);
  assert.equal(pathMatchesHandle(handle, path, 'win32'), false); // Not a blanket zero wildcard.
  assert.equal(pathMatchesHandle(path, handle, 'linux'), false);
  assert.equal(pathMatchesHandle(path, handle, 'darwin'), false);
});
test('nonzero device mismatches remain rejected on Windows as well as POSIX', () => {
  for (const platform of ['win32', 'linux', 'darwin']) {
    assert.equal(pathMatchesHandle(info(), info(), platform), true);
    assert.equal(pathMatchesHandle(info({ dev: 43n }), info(), platform), false);
  }
});
test('bigint file IDs distinguish adjacent IDs even above floating point precision', () => {
  const first = info({ ino: 9007199254740992n }), second = info({ ino: 9007199254740993n });
  assert.equal(Number(first.ino), Number(second.ino));
  assert.equal(pathMatchesHandle(first, second, 'win32'), false);
  assert.equal(sameOpenFile(first, second), false);
});
test('handle-to-handle identity has no Windows zero-device exception', () => {
  assert.equal(sameOpenFile(info(), info()), true);
  assert.equal(sameOpenFile(info({ dev: 0n }), info()), false);
});
test('missing IDs, changed sizes, links and Number stats fail closed', () => {
  for (const delta of [{ ino: 0n }, { ino: 9n }, { size: 454n }, { nlink: 2n },
    { isFile: () => false }, { isSymbolicLink: () => true }, { ino: 21110623254304612 }, { dev: 42 }]) {
    assert.equal(pathMatchesHandle(info(delta), info(), 'win32'), false);
    assert.equal(sameOpenFile(info(), info(delta)), false);
  }
});
