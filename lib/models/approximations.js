// Approximation rules: relativity, Taylor series, compound interest, RC charging, ideal gas, thin lens.
import { DEG } from '../num.js';

const gamma = (b) => 1 / Math.sqrt(1 - b * b);

// Van der Waals molar volume for a given pressure and temperature (largest real root, Newton from ideal).
const R = 8.314462618;
export function vdwMolarVolume(P_Pa, T, a, b) {
  let V = (R * T) / P_Pa + b;
  for (let i = 0; i < 200; i++) {
    const f = (R * T) / (V - b) - a / (V * V) - P_Pa;
    const df = (-R * T) / (V - b) ** 2 + (2 * a) / V ** 3;
    const next = V - f / df;
    if (!(next > b)) { V = (V + b) / 2; continue; }
    if (Math.abs(next - V) < 1e-15 * V) { V = next; break; }
    V = next;
  }
  return V;
}

// Exact focal intercept of a ray parallel to the axis at height h through a plano-convex lens
// (flat face first, curved face of radius R last), by Snell's law at the curved face.
export function planoConvexIntercept(hOverR, n, R_m) {
  const h = hOverR * R_m;
  const th1 = Math.asin(h / R_m);            // angle of incidence at the curved face
  const s = n * Math.sin(th1);
  if (s >= 1) return NaN;                    // total internal reflection
  const th2 = Math.asin(s);
  const zHit = -R_m + Math.sqrt(R_m * R_m - h * h); // curved face vertex at z = 0
  return zHit + h / Math.tan(th2 - th1);
}

const series = (statement, unit, range, limits, rule, exact) => ({
  claim: 'approximately', param: 'x', unit, range, limits, fixed: {}, quantity: 'value', quantityUnit: '',
  statement, rule, exact, method: 'exact function compared with the approximation',
});

export default [
  {
    id: 'relativity', title: 'Speeds near light',
    rules: {
      ke_classical: {
        claim: 'approximately', param: 'beta', unit: 'fraction of c', range: [1e-4, 0.99], limits: [1e-6, 0.999999],
        fixed: {}, quantity: 'kinetic energy', quantityUnit: 'mc²',
        statement: 'Kinetic energy is ½mv².',
        rule: (b) => 0.5 * b * b, exact: (b) => gamma(b) - 1,
        method: 'relativistic kinetic energy (γ − 1)mc²',
      },
      momentum_classical: {
        claim: 'approximately', param: 'beta', unit: 'fraction of c', range: [1e-4, 0.99], limits: [1e-6, 0.999999],
        fixed: {}, quantity: 'momentum', quantityUnit: 'mc',
        statement: 'Momentum is m times v.',
        rule: (b) => b, exact: (b) => gamma(b) * b,
        method: 'relativistic momentum γmv',
      },
    },
  },
  {
    id: 'series', title: 'Small-number approximations',
    rules: {
      sin_x: { ...series('For small angles, sin x is just x.', 'deg', [0.1, 89], [1e-3, 179],
        (a) => a * DEG, (a) => Math.sin(a * DEG)) },
      tan_x: { ...series('For small angles, tan x is just x.', 'deg', [0.1, 89], [1e-3, 89.9],
        (a) => a * DEG, (a) => Math.tan(a * DEG)) },
      cos_x: { ...series('cos x is about 1 − x²/2.', 'deg', [0.1, 80], [1e-3, 89.9],
        (a) => 1 - (a * DEG) ** 2 / 2, (a) => Math.cos(a * DEG)) },
      exp_x: { ...series('For small x, eˣ is about 1 + x.', 'x', [1e-4, 2], [-0.99, 50],
        (x) => 1 + x, (x) => Math.exp(x)) },
      ln1p_x: { ...series('ln(1 + x) is about x.', 'x', [1e-4, 2], [-0.99, 1e6],
        (x) => x, (x) => Math.log1p(x)) },
      sqrt1p_x: { ...series('√(1 + x) is about 1 + x/2.', 'x', [1e-4, 3], [-0.99, 1e6],
        (x) => 1 + x / 2, (x) => Math.sqrt(1 + x)) },
      binomial_x: { ...series('(1 + x)ⁿ is about 1 + nx.', 'x', [1e-4, 2], [-0.99, 1e3],
        (x, f) => 1 + f.n * x, (x, f) => (1 + x) ** f.n), fixed: { n: 2 } },
    },
  },
  {
    id: 'compound', title: 'Compound interest',
    rules: {
      rule_of_72: {
        claim: 'approximately', param: 'rate_pct', unit: '% rate', range: [0.5, 60], limits: [0.01, 500],
        fixed: {}, quantity: 'doubling time', quantityUnit: 'years',
        statement: 'Money doubles in 72 divided by the interest rate years.',
        rule: (r) => 72 / r, exact: (r) => Math.log(2) / Math.log(1 + r / 100),
        method: 'exact doubling time ln 2 / ln(1 + r) with yearly compounding',
      },
      rule_of_70: {
        claim: 'approximately', param: 'rate_pct', unit: '% rate', range: [0.5, 60], limits: [0.01, 500],
        fixed: {}, quantity: 'doubling time', quantityUnit: 'years',
        statement: 'Money doubles in 70 divided by the interest rate years.',
        rule: (r) => 70 / r, exact: (r) => Math.log(2) / Math.log(1 + r / 100),
        method: 'exact doubling time ln 2 / ln(1 + r) with yearly compounding',
      },
    },
  },
  {
    id: 'rc_circuit', title: 'Charging a capacitor',
    rules: {
      five_tau_full: {
        claim: 'approximately', param: 'n_tau', unit: 'time constants', range: [5, 10], limits: [0.01, 100],
        fixed: {}, quantity: 'charge fraction', quantityUnit: '',
        statement: 'After five time constants the capacitor is fully charged.',
        rule: () => 1, exact: (n) => 1 - Math.exp(-n),
        method: 'exact charging curve 1 − e^(−t/RC)',
      },
    },
  },
  {
    id: 'ideal_gas', title: 'Gases',
    rules: {
      ideal_at_pressure: {
        claim: 'approximately', param: 'P_atm', unit: 'atm', range: [1, 500], limits: [0.01, 5000],
        fixed: { T_K: 300, a: 0.3640, b: 4.267e-5 }, quantity: 'pressure', quantityUnit: 'atm',
        statement: 'A gas obeys PV = nRT.',
        rule: (P, f) => (R * f.T_K) / vdwMolarVolume(P * 101325, f.T_K, f.a, f.b) / 101325,
        exact: (P) => P,
        method: 'van der Waals gas (CO₂ constants by default): ideal-gas pressure at the real volume vs the real pressure',
      },
    },
  },
  {
    id: 'thin_lens', title: 'Lenses',
    rules: {
      paraxial_focus: {
        claim: 'approximately', param: 'h_over_R', unit: 'ray height / R', range: [0.01, 0.6], limits: [1e-4, 0.66],
        fixed: { n: 1.5, R_m: 0.1 }, quantity: 'focal distance', quantityUnit: 'm',
        statement: 'Rays parallel to the axis all meet at the focal point f = R/(n − 1).',
        rule: (h, f) => f.R_m / (f.n - 1), exact: (h, f) => planoConvexIntercept(h, f.n, f.R_m),
        method: "exact ray trace by Snell's law through a plano-convex lens",
      },
    },
  },
];
