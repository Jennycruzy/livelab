// The check. Given a law card (which library rule, which parameter range, which fixed values), it computes the
// rule's value and the first-principles value across the range and decides, in plain code:
//   holds  - within tolerance over the whole range
//   breaks - within tolerance at the start, past it from `limit` on (found by bisection)
//   band   - within tolerance only between `lo` and `hi`
//   fails  - past tolerance over the whole range
// The language model never decides any of this.
import mechanics from './models/mechanics.js';
import approximations from './models/approximations.js';
import { bisect, relErr } from './num.js';

export const TOLERANCE = 0.01;
export const CLAIMS = ['independent_of', 'equals_formula', 'approximately', 'conserved', 'maximum_at'];
export const MODELS = Object.fromEntries([...mechanics, ...approximations].map((m) => [m.id, m]));

export class CardError extends Error {}

/** Resolve a card against the library. Throws CardError with a plain reason when it does not fit. */
export function resolve(card) {
  const model = MODELS[card.model];
  if (!model) throw new CardError(`no library model "${card.model}"`);
  const rule = model.rules[card.rule];
  if (!rule) throw new CardError(`model "${card.model}" has no rule "${card.rule}"`);
  if (card.claim !== undefined && card.claim !== rule.claim)
    throw new CardError(`rule "${card.rule}" is a "${rule.claim}" claim, card says "${card.claim}"`);
  if (card.param !== undefined && card.param !== rule.param)
    throw new CardError(`rule "${card.rule}" varies "${rule.param}", card says "${card.param}"`);
  const fixed = { ...rule.fixed };
  for (const [k, v] of Object.entries(card.fixed || {})) {
    if (!(k in rule.fixed)) throw new CardError(`rule "${card.rule}" has no fixed value "${k}"`);
    if (typeof v !== 'number' || !Number.isFinite(v)) throw new CardError(`fixed value "${k}" is not a number`);
    fixed[k] = v;
  }
  const notes = [];
  let [lo, hi] = card.range || rule.range;
  if (!(Number.isFinite(lo) && Number.isFinite(hi) && lo < hi)) throw new CardError('range must be two numbers, low < high');
  const [minP, maxP] = rule.limits;
  if (lo < minP) { notes.push(`range start raised from ${lo} to the library limit ${minP}`); lo = minP; }
  if (hi > maxP) { notes.push(`range end lowered from ${hi} to the library limit ${maxP}`); hi = maxP; }
  if (!(lo < hi)) throw new CardError('range is outside what the library model covers');
  return { model, rule, fixed, range: [lo, hi], notes };
}

/** Run the check for a card. Returns the verdict with the numbers behind it. */
export function check(card, { tol = TOLERANCE } = {}) {
  const { model, rule, fixed, range: [lo, hi], notes } = resolve(card);
  const n = rule.samples || 400;
  const err = (p) => relErr(rule.rule(p, fixed), rule.exact(p, fixed));
  const ps = Array.from({ length: n + 1 }, (_, i) => lo + ((hi - lo) * i) / n);
  const errs = ps.map(err);
  const ok = errs.map((e) => e <= tol);
  const firstBad = (from) => { for (let i = from; i <= n; i++) if (!ok[i]) return i; return -1; };
  const firstOk = (from) => { for (let i = from; i <= n; i++) if (ok[i]) return i; return -1; };
  const refine = (a, b, wantBadAtB) => bisect((p) => (err(p) > tol) === wantBadAtB, a, b);

  let result;
  if (ok.every(Boolean)) {
    const worst = errs.reduce((w, e, i) => (e > errs[w] ? i : w), 0);
    result = { verdict: 'holds', maxError: errs[worst], maxErrorAt: ps[worst] };
  } else if (!ok.some(Boolean)) {
    result = { verdict: 'fails', minError: Math.min(...errs) };
  } else if (ok[0]) {
    const j = firstBad(1);
    result = { verdict: 'breaks', limit: refine(ps[j - 1], ps[j], true) };
    if (firstOk(j) !== -1) notes.push('the error dips back under tolerance later in the range');
  } else {
    const j = firstOk(1);
    const bandLo = refine(ps[j - 1], ps[j], false);
    const k = firstBad(j);
    const bandHi = k === -1 ? hi : refine(ps[k - 1], ps[k], true);
    result = { verdict: 'band', lo: bandLo, hi: bandHi };
  }
  const step = Math.max(1, Math.floor(n / 40));
  return {
    model: model.id, rule: card.rule, claim: rule.claim, param: rule.param, unit: rule.unit,
    quantity: rule.quantity, quantityUnit: rule.quantityUnit, range: [lo, hi], fixed, tol,
    method: rule.method, ...result, notes,
    samples: ps.filter((_, i) => i % step === 0 || i === n)
      .map((p) => ({ p, rule: rule.rule(p, fixed), exact: rule.exact(p, fixed) })),
  };
}

/**
 * Does a model-written sim measure the same thing as the library? Its probe(params) must agree with the
 * library's exact value within `tol` at `points` evenly spaced parameter values.
 */
export function probeAgrees(card, probe, { points = 5, tol = 0.005 } = {}) {
  const { rule, fixed, range: [lo, hi] } = resolve(card);
  const rows = [];
  for (let i = 0; i < points; i++) {
    const p = lo + ((hi - lo) * (i + 0.5)) / points;
    let got;
    try { got = probe({ ...fixed, [rule.param]: p }); } catch (e) { got = NaN; }
    const want = rule.exact(p, fixed);
    rows.push({ p, got, want, error: relErr(got, want) });
  }
  return { agrees: rows.every((r) => r.error <= tol), rows };
}

/** Plain list of what the library can check, for the rule finder's prompt and the /how page. */
export function catalogue() {
  return Object.values(MODELS).flatMap((m) => Object.entries(m.rules).map(([id, r]) => ({
    model: m.id, rule: id, claim: r.claim, param: r.param, unit: r.unit, range: r.range, limits: r.limits,
    fixed: r.fixed, statement: r.statement,
  })));
}
