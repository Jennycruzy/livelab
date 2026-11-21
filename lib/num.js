// Numerical helpers shared by the physics models. Plain code; nothing here calls a model.

/** One classic Runge-Kutta step for y' = f(t, y), y an array. */
export function rk4Step(f, t, y, h) {
  const n = y.length;
  const k1 = f(t, y);
  const y2 = new Array(n), y3 = new Array(n), y4 = new Array(n);
  for (let i = 0; i < n; i++) y2[i] = y[i] + 0.5 * h * k1[i];
  const k2 = f(t + 0.5 * h, y2);
  for (let i = 0; i < n; i++) y3[i] = y[i] + 0.5 * h * k2[i];
  const k3 = f(t + 0.5 * h, y3);
  for (let i = 0; i < n; i++) y4[i] = y[i] + h * k3[i];
  const k4 = f(t + h, y4);
  const out = new Array(n);
  for (let i = 0; i < n; i++) out[i] = y[i] + (h / 6) * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]);
  return out;
}

/**
 * Integrate y' = f(t, y) from t0 with step h until stop(t, y, prevY) returns a number (the event time,
 * which the caller interpolates) or tMax is passed. Returns the event time or NaN.
 */
export function integrateUntil(f, t0, y0, h, stop, tMax) {
  let t = t0, y = y0;
  while (t < tMax) {
    const next = rk4Step(f, t, y, h);
    const hit = stop(t, y, t + h, next);
    if (hit !== undefined && hit !== null) return hit;
    t += h; y = next;
  }
  return NaN;
}

/** Bisection on a boolean predicate: returns the boundary between pred(lo) === false and pred(hi) === true. */
export function bisect(pred, lo, hi, iterations = 100) {
  for (let i = 0; i < iterations; i++) {
    const mid = (lo + hi) / 2;
    if (pred(mid)) hi = mid; else lo = mid;
  }
  return (lo + hi) / 2;
}

/** Arithmetic-geometric mean. */
export function agm(a, b) {
  for (let i = 0; i < 60; i++) {
    const an = (a + b) / 2, bn = Math.sqrt(a * b);
    if (an === a && bn === b) break;
    a = an; b = bn;
  }
  return a;
}

/** Golden-section search for the maximum of a unimodal function on [lo, hi]. */
export function argmax(f, lo, hi, iterations = 200) {
  const r = (Math.sqrt(5) - 1) / 2;
  let a = lo, b = hi, c = b - r * (b - a), d = a + r * (b - a);
  let fc = f(c), fd = f(d);
  for (let i = 0; i < iterations; i++) {
    if (fc > fd) { b = d; d = c; fd = fc; c = b - r * (b - a); fc = f(c); }
    else { a = c; c = d; fc = fd; d = a + r * (b - a); fd = f(d); }
  }
  return (a + b) / 2;
}

/** Relative error of a rule's value against the exact value: |rule - exact| / |exact|. */
export function relErr(rule, exact) {
  if (!Number.isFinite(rule) || !Number.isFinite(exact) || exact === 0) return Infinity;
  return Math.abs(rule - exact) / Math.abs(exact);
}

export const DEG = Math.PI / 180;
export const G0 = 9.81;
