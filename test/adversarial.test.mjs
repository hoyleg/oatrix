import test from 'node:test';
import assert from 'node:assert/strict';
import { lab } from './helpers.mjs';
import { assertInvariants } from '../src/world.mjs';
import { RuleError, hash } from '../src/canonical.mjs';

/** Deterministic generated action streams, not a claim of exhaustive verification. */
function rng(seed) { let x = seed >>> 0; return () => { x = (Math.imul(x, 1664525) + 1013904223) >>> 0; return x; }; }
for (const seed of [1, 7, 29, 101, 2026]) {
  test(`generated economic/adversarial stream preserves invariants (seed ${seed})`, () => {
    const l = lab(), next = rng(seed);
    for (let i = 0; i < 300; i++) {
      const person = next() % 2 ? 'alice' : 'bob', choice = next() % 6;
      const before = l.journal.head, stateBefore = hash(l.journal.state);
      try {
        if (choice === 0) l.tick(1 + next() % 3);
        else if (choice === 1) l.act(person, 'transfer', { to: person === 'alice' ? 'bob' : 'alice', amount: 1 + next() % 20_000 });
        else if (choice === 2) l.act(person, 'startJob', { id: `job_${seed}_${i}`, recipe: ['mine_ore', 'mine_wood', 'sword'][next() % 3] });
        else if (choice === 3) l.act(person, 'startJob', { id: `job_${seed}_${i}`, recipe: 'magic_money' });
        else if (choice === 4) l.act(person, 'pause', { reason: 'Pretend elevated authority' });
        else l.act(person, 'transfer', { to: 'host_a', amount: -1 });
      } catch (e) {
        assert.ok(e instanceof RuleError, `Unexpected exception: ${e.stack}`);
        assert.equal(l.journal.head, before); assert.equal(hash(l.journal.state), stateBefore);
      }
      assertInvariants(l.journal.state);
    }
  });
}
