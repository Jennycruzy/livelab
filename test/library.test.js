// Library models against known values, two independent methods agreeing, checks that can fail when the physics
// changes, card validation, and the sim probe agreement test.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { check, resolve, probeAgrees, catalogue, CardError, MODELS } from '../lib/check.js';
import {
  pendulumPeriodExact, pendulumPeriodRK4, fallTimeExact, fallTimeRK4, orbitPeriodRK4, projectileFlight,
} from '../lib/models/mechanics.js';
import { vdwMolarVolume, planoConvexIntercept } from '../lib/models/approximations.js';

const near = (got, want, rel, msg) => assert.ok(Math.abs(got / want - 1) < rel, `${msg}: ${got} vs ${want}`);

test('pendulum: exact large-swing period matches the textbook ratio and RK4', () => {
  const T0 = 2 * Math.PI * Math.sqrt(1 / 9.81);
  near(pendulumPeriodExact(1, 60) / T0, 1.07318, 1e-5, 'T/T0 at 60 deg');
  for (const a of [10, 45, 90, 150]) near(pendulumPeriodRK4(1, 1, a), pendulumPeriodExact(1, a), 1e-6, `RK4 at ${a}`);
});

test('falling with drag: closed form agrees with RK4; vacuum gives sqrt(2h/g)', () => {
  for (const h of [1, 20, 300]) near(fallTimeRK4(h, 0.62, 0.119), fallTimeExact(h, 0.62, 0.119), 1e-5, `h=${h}`);
  near(fallTimeExact(20, 1, 0.1, 0), Math.sqrt(40 / 9.81), 1e-12, 'vacuum');
});

test('orbit: 1 AU takes 1 year; 4 AU takes 8 years', () => {
  near(orbitPeriodRK4(1), 1, 1e-6, '1 AU');
  near(orbitPeriodRK4(4), 8, 1e-6, '4 AU');
});

test('projectile: no-air range at 45 deg and 10 m/s is v^2/g', () => {
  near(projectileFlight(10, 45).range, 100 / 9.81, 1e-12, 'range');
  const drag = projectileFlight(30, 45, 0.01);
  assert.ok(drag.range < (900 / 9.81) && drag.tDown > drag.tUp, 'drag shortens range and the fall is slower than the rise');
});

test('gases and lenses: known limits', () => {
  const V = vdwMolarVolume(101325, 300, 0.364, 4.267e-5);
  near(V, (8.314462618 * 300) / 101325, 0.01, 'CO2 at 1 atm is close to ideal');
  near(planoConvexIntercept(1e-4, 1.5, 0.1), 0.2, 1e-6, 'paraxial ray meets at R/(n-1)');
  assert.ok(planoConvexIntercept(0.5, 1.5, 0.1) < 0.2, 'edge rays focus short (spherical aberration)');
});

test('verdicts: holds rules break when the physics changes', () => {
  assert.equal(check({ model: 'spring', rule: 'amplitude_independence', fixed: { k3_Nm3: 20 } }).verdict, 'breaks');
  assert.equal(check({ model: 'orbit', rule: 'kepler_third', fixed: { mass_ratio: 0.1 } }).verdict, 'fails');
  assert.equal(check({ model: 'projectile', rule: 'max_range_45', fixed: { k_per_m: 0.01 } }).verdict, 'breaks');
  assert.equal(check({ model: 'projectile', rule: 'time_up_equals_down', fixed: { k_per_m: 0.01 } }).verdict, 'breaks');
  const air = check({ model: 'fall_drag', rule: 'vacuum_same_acceleration', fixed: { rho: 1.225 } });
  assert.equal(air.verdict, 'band');
  assert.ok(air.lo > 1 && air.lo < 2, 'in air only the heavier objects fall like in a vacuum');
});

test('verdicts: a wrong rule fails everywhere', () => {
  // "Heavier pendulums swing faster": the library's mass rule at a large swing is off by >1% at every mass.
  assert.equal(check({ model: 'pendulum', rule: 'mass_independence', fixed: { amplitude_deg: 40 } }).verdict, 'fails');
});

test('cards: unknown models, wrong claims, unknown fixed values and bad ranges are refused with a reason', () => {
  assert.throws(() => resolve({ model: 'diode', rule: 'ohm' }), CardError);
  assert.throws(() => resolve({ model: 'pendulum', rule: 'amplitude_independence', claim: 'conserved' }), /independent_of/);
  assert.throws(() => resolve({ model: 'pendulum', rule: 'amplitude_independence', fixed: { g: 3 } }), /no fixed value/);
  assert.throws(() => resolve({ model: 'pendulum', rule: 'amplitude_independence', range: [50, 10] }), /range/);
  const r = resolve({ model: 'pendulum', rule: 'amplitude_independence', range: [0, 200] });
  assert.deepEqual(r.range, [0.1, 179]);
  assert.equal(r.notes.length, 2);
});

test('probe agreement: a correct sim agrees, a pretty-but-wrong sim does not', () => {
  const card = { model: 'pendulum', rule: 'amplitude_independence' };
  const right = (p) => pendulumPeriodExact(p.L_m, p.amplitude_deg);
  const wrong = (p) => 2 * Math.PI * Math.sqrt(p.L_m / 9.81); // ignores the swing size
  const crash = () => { throw new Error('boom'); };
  assert.equal(probeAgrees(card, right).agrees, true);
  assert.equal(probeAgrees(card, wrong).agrees, false);
  assert.equal(probeAgrees(card, crash).agrees, false);
});

test('catalogue lists every rule with its claim and parameter', () => {
  const rows = catalogue();
  const count = Object.values(MODELS).reduce((n, m) => n + Object.keys(m.rules).length, 0);
  assert.equal(rows.length, count);
  assert.equal(Object.keys(MODELS).length, 12);
  for (const r of rows) assert.ok(r.statement && r.claim && r.param && r.unit !== undefined);
});
