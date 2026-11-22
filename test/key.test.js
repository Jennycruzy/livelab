// The 20 frozen lecture moments (test/fixtures/key.cjs, sha256 06a0c726...) checked by the library.
// Each moment is mapped in advance to the library rule a correct rule finder would pick, with the same range the
// key used. The library must give the key's verdict for every moment. Limits must match the key exactly where
// the key measured error the same way the library does (|rule - exact| / |exact|), and within 1.5% where the
// key measured it the other way round (|exact - rule| / |rule|), which moves a 1% boundary slightly.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { check } from '../lib/check.js';

const require = createRequire(import.meta.url);
const KEY_PATH = new URL('./fixtures/key.cjs', import.meta.url);
const KEY = require(KEY_PATH.pathname);

const CARDS = {
  1: { model: 'pendulum', rule: 'mass_independence' },
  2: { model: 'pendulum', rule: 'amplitude_independence', range: [1, 90] },
  3: { model: 'fall_drag', rule: 'heavy_light_same_time', range: [0.1, 500] },
  4: { model: 'series', rule: 'sin_x', range: [0.1, 89] },
  5: { model: 'series', rule: 'tan_x', range: [0.1, 89] },
  6: { model: 'series', rule: 'exp_x', range: [1e-4, 2] },
  7: { model: 'relativity', rule: 'ke_classical', range: [1e-4, 0.99] },
  8: { model: 'gravity_height', rule: 'g_constant', range: [0, 1000] },
  9: { model: 'spring', rule: 'amplitude_independence' },
  10: { model: 'compound', rule: 'rule_of_72', range: [0.5, 60] },
  11: { model: 'fall_drag', rule: 'vacuum_same_acceleration' },
  12: { model: 'series', rule: 'binomial_x', range: [1e-4, 2], fixed: { n: 2 } },
  13: { model: 'orbit', rule: 'kepler_third' },
  14: { model: 'projectile', rule: 'max_range_45' },
  15: { model: 'series', rule: 'cos_x', range: [0.1, 80] },
  16: { model: 'series', rule: 'ln1p_x', range: [1e-4, 2] },
  17: { model: 'relativity', rule: 'momentum_classical', range: [1e-4, 0.99] },
  18: { model: 'series', rule: 'sqrt1p_x', range: [1e-4, 3] },
  19: { model: 'pendulum', rule: 'energy_conservation' },
  20: { model: 'projectile', rule: 'time_up_equals_down' },
};
// Moments where the key's error measure is the library's: |rule - exact| / |exact|.
const SAME_MEASURE = new Set([4, 10, 15, 16, 18]);

test('the frozen key is unchanged', () => {
  const sha = createHash('sha256').update(readFileSync(KEY_PATH)).digest('hex');
  assert.equal(sha, '06a0c72644ed442bfe89b2e4a2b2e4f075452b8ef0f874ab60635a11834bac02');
});

for (const k of KEY) {
  test(`moment ${k.id}: ${k.line.slice(0, 60)}`, () => {
    const r = check(CARDS[k.id]);
    if (k.limitLow !== undefined) {
      assert.equal(r.verdict, 'band', `expected a band, got ${r.verdict}`);
      const pairs = [[r.lo, k.limitLow], [r.hi, k.limit]];
      for (const [got, want] of pairs) assertClose(got, want, SAME_MEASURE.has(k.id));
    } else if (k.verdict === 'holds') {
      assert.equal(r.verdict, 'holds', `expected holds, got ${r.verdict} (${JSON.stringify(r.limit ?? r.lo)})`);
    } else {
      assert.equal(r.verdict, 'breaks', `expected breaks, got ${r.verdict}`);
      assertClose(r.limit, k.limit, SAME_MEASURE.has(k.id));
    }
  });
}

function assertClose(got, want, exact) {
  const rel = Math.abs(got / want - 1);
  if (exact) assert.ok(rel < 1e-9, `limit ${got} vs key ${want} (rel ${rel.toExponential(2)}), expected exact`);
  else assert.ok(rel < 0.015, `limit ${got} vs key ${want} (rel ${(rel * 100).toFixed(3)}%)`);
}
