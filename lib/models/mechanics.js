// Mechanics models: pendulum, falling with drag, spring, projectile, gravity with height, orbits.
// Each rule pairs the value a teacher's rule predicts (rule) with a first-principles value (exact):
// RK4 integration of the equation of motion or an exact closed form. The model never decides; these do.
import { rk4Step, integrateUntil, agm, argmax, DEG, G0 } from '../num.js';

// ---------- pendulum: theta'' = -(m g / (m L)) sin(theta), mass kept explicit ----------
export function pendulumPeriodRK4(L, m, ampDeg, g = G0) {
  const th0 = ampDeg * DEG;
  const T0 = 2 * Math.PI * Math.sqrt(L / g);
  const h = T0 / 20000;
  const f = (_t, [th, w]) => [w, (-(m * g) * Math.sin(th)) / (m * L)];
  // First time theta crosses zero from above = a quarter period.
  const quarter = integrateUntil(f, 0, [th0, 0], h, (t, y, t2, y2) =>
    (y[0] > 0 && y2[0] <= 0) ? t + h * (y[0] / (y[0] - y2[0])) : undefined, 10 * T0);
  return 4 * quarter;
}
export const pendulumPeriodExact = (L, ampDeg, g = G0) =>
  (2 * Math.PI * Math.sqrt(L / g)) / agm(1, Math.cos((ampDeg * DEG) / 2));

function pendulumEnergyAt(L, m, ampDeg, tEnd, g = G0) {
  const f = (_t, [th, w]) => [w, (-(m * g) * Math.sin(th)) / (m * L)];
  const E = ([th, w]) => 0.5 * m * (L * w) ** 2 + m * g * L * (1 - Math.cos(th));
  let y = [ampDeg * DEG, 0], t = 0;
  const h = 1e-3;
  while (t + h <= tEnd) { y = rk4Step(f, t, y, h); t += h; }
  if (tEnd - t > 0) y = rk4Step(f, t, y, tEnd - t);
  return E(y);
}

// ---------- falling ball with quadratic drag: m v' = m g - 0.5 rho Cd A v^2 ----------
const dragK = (r, rho, Cd) => 0.5 * rho * Cd * Math.PI * r * r;
export function fallTimeExact(h, m, r, rho = 1.225, Cd = 0.47, g = G0) {
  const k = dragK(r, rho, Cd);
  if (k === 0) return Math.sqrt((2 * h) / g);
  const vt = Math.sqrt((m * g) / k);
  return (vt / g) * Math.acosh(Math.exp((h * g) / (vt * vt)));
}
export function fallTimeRK4(h, m, r, rho = 1.225, Cd = 0.47, g = G0) {
  const k = dragK(r, rho, Cd);
  const f = (_t, [y, v]) => [v, g - (k * v * v) / m];
  const dt = Math.min(1e-3, Math.sqrt((2 * h) / g) / 2000);
  return integrateUntil(f, 0, [0, 0], dt, (t, y, t2, y2) =>
    (y2[0] >= h) ? t + dt * ((h - y[0]) / (y2[0] - y[0])) : undefined, 1e4);
}

// ---------- spring: m x'' = -k x - k3 x^3 ----------
export function springPeriodRK4(m, k, amp, k3 = 0) {
  const T0 = 2 * Math.PI * Math.sqrt(m / k);
  const h = T0 / 20000;
  const f = (_t, [x, v]) => [v, (-k * x - k3 * x ** 3) / m];
  const quarter = integrateUntil(f, 0, [amp, 0], h, (t, y, t2, y2) =>
    (y[0] > 0 && y2[0] <= 0) ? t + h * (y[0] / (y[0] - y2[0])) : undefined, 10 * T0);
  return 4 * quarter;
}

// ---------- projectile from ground level, optional quadratic drag (k_per_m = 0.5 rho Cd A / m) ----------
export function projectileFlight(v0, angleDeg, kPerM = 0, g = G0) {
  if (kPerM === 0) {
    const a = angleDeg * DEG;
    const tUp = (v0 * Math.sin(a)) / g;
    return { range: (v0 * v0 * Math.sin(2 * a)) / g, tUp, tDown: tUp };
  }
  const a = angleDeg * DEG;
  const f = (_t, [x, y, vx, vy]) => {
    const s = Math.hypot(vx, vy);
    return [vx, vy, -kPerM * s * vx, -g - kPerM * s * vy];
  };
  const dt = Math.max(1e-4, (2 * v0 * Math.sin(a)) / g / 4000);
  let t = 0, s = [0, 0, v0 * Math.cos(a), v0 * Math.sin(a)], tUp = NaN;
  while (t < 1e4) {
    const n = rk4Step(f, t, s, dt);
    if (Number.isNaN(tUp) && s[3] > 0 && n[3] <= 0) tUp = t + dt * (s[3] / (s[3] - n[3]));
    if (t > 0 && s[1] >= 0 && n[1] < 0) {
      const frac = s[1] / (s[1] - n[1]);
      const tLand = t + dt * frac;
      return { range: s[0] + frac * (n[0] - s[0]), tUp, tDown: tLand - tUp };
    }
    t += dt; s = n;
  }
  return { range: NaN, tUp: NaN, tDown: NaN };
}
/** Time to the top and time back down, by RK4 on the vertical motion (no drag unless kPerM > 0). */
export function upDownRK4(v0, kPerM = 0, g = G0) {
  const f = (_t, [y, v]) => [v, -g - kPerM * Math.abs(v) * v];
  const dt = (2 * v0) / g / 20000;
  let t = 0, s = [0, v0], tUp = NaN;
  while (t < 1e4) {
    const n = rk4Step(f, t, s, dt);
    if (Number.isNaN(tUp) && s[1] > 0 && n[1] <= 0) tUp = t + dt * (s[1] / (s[1] - n[1]));
    if (t > 0 && s[0] >= 0 && n[0] < 0) {
      const tLand = t + dt * (s[0] / (s[0] - n[0]));
      return { tUp, tDown: tLand - tUp };
    }
    t += dt; s = n;
  }
  return { tUp: NaN, tDown: NaN };
}

// ---------- two-body circular orbit, units AU / year / solar masses (G M_sun = 4 pi^2) ----------
export function orbitPeriodRK4(aAU, massRatio = 0) {
  const GM = 4 * Math.PI * Math.PI * (1 + massRatio);
  const Tguess = Math.sqrt(aAU ** 3 / (1 + massRatio));
  const h = Tguess / 20000;
  const f = (_t, [x, y, vx, vy]) => {
    const r3 = Math.hypot(x, y) ** 3;
    return [vx, vy, (-GM * x) / r3, (-GM * y) / r3];
  };
  // Start on +x moving +y; one period = y crossing from negative to non-negative with x > 0.
  return integrateUntil(f, 0, [aAU, 0, 0, Math.sqrt(GM / aAU)], h, (t, s, t2, n) =>
    (t > h && s[1] < 0 && n[1] >= 0 && n[0] > 0) ? t + h * (-s[1] / (n[1] - s[1])) : undefined, 5 * Tguess);
}

const R_EARTH_KM = 6371;

export default [
  {
    id: 'pendulum', title: 'Pendulum',
    rules: {
      amplitude_independence: {
        claim: 'independent_of', param: 'amplitude_deg', unit: 'deg', range: [1, 90], limits: [0.1, 179],
        fixed: { L_m: 1 }, quantity: 'period', quantityUnit: 's',
        statement: 'The period is the same however far the pendulum is pulled back.',
        rule: (a, f) => 2 * Math.PI * Math.sqrt(f.L_m / G0),
        exact: (a, f) => pendulumPeriodExact(f.L_m, a),
        method: 'exact large-swing period by the arithmetic-geometric mean',
      },
      mass_independence: {
        claim: 'independent_of', param: 'm_kg', unit: 'kg', range: [0.1, 10], limits: [0.001, 1000],
        fixed: { L_m: 1, amplitude_deg: 5 }, quantity: 'period', quantityUnit: 's', samples: 24,
        statement: 'For small swings the period is 2π√(L/g); the mass is not in it.',
        rule: (m, f) => 2 * Math.PI * Math.sqrt(f.L_m / G0),
        exact: (m, f) => pendulumPeriodRK4(f.L_m, m, f.amplitude_deg),
        method: 'RK4 integration of the swing with the mass kept in the force and the inertia',
      },
      energy_conservation: {
        claim: 'conserved', param: 't_s', unit: 's', range: [0, 20], limits: [0, 200],
        fixed: { L_m: 1, m_kg: 1, amplitude_deg: 30 }, quantity: 'energy', quantityUnit: 'J', samples: 21,
        statement: 'With no friction the pendulum keeps all its energy.',
        rule: (t, f) => f.m_kg * G0 * f.L_m * (1 - Math.cos(f.amplitude_deg * DEG)),
        exact: (t, f) => pendulumEnergyAt(f.L_m, f.m_kg, f.amplitude_deg, t),
        method: 'RK4 integration of the frictionless swing, energy summed at each time',
      },
    },
  },
  {
    id: 'fall_drag', title: 'Falling objects',
    rules: {
      heavy_light_same_time: {
        claim: 'independent_of', param: 'height_m', unit: 'm', range: [0.1, 500], limits: [0.01, 5000],
        fixed: { heavy_m_kg: 7.0, heavy_r_m: 0.109, light_m_kg: 0.62, light_r_m: 0.119, rho: 1.225, Cd: 0.47 },
        quantity: 'fall time', quantityUnit: 's',
        statement: 'A heavy ball and a light ball dropped together land at the same time.',
        rule: (h, f) => fallTimeExact(h, f.heavy_m_kg, f.heavy_r_m, f.rho, f.Cd),
        exact: (h, f) => fallTimeExact(h, f.light_m_kg, f.light_r_m, f.rho, f.Cd),
        method: 'exact fall time with quadratic air drag for each ball',
      },
      vacuum_same_acceleration: {
        claim: 'independent_of', param: 'm_kg', unit: 'kg', range: [0.01, 100], limits: [1e-4, 1e5],
        fixed: { height_m: 10, r_m: 0.1, rho: 0, Cd: 0.47 }, quantity: 'fall time', quantityUnit: 's', samples: 24,
        statement: 'In a vacuum all objects fall with the same acceleration.',
        rule: (m, f) => Math.sqrt((2 * f.height_m) / G0),
        exact: (m, f) => fallTimeRK4(f.height_m, m, f.r_m, f.rho, f.Cd),
        method: 'RK4 integration of the fall with the given mass and air density',
      },
    },
  },
  {
    id: 'spring', title: 'Mass on a spring',
    rules: {
      amplitude_independence: {
        claim: 'independent_of', param: 'amplitude_m', unit: 'm', range: [0.01, 1], limits: [1e-4, 10],
        fixed: { m_kg: 1, k_Nm: 10, k3_Nm3: 0 }, quantity: 'period', quantityUnit: 's', samples: 24,
        statement: 'A mass on an ideal spring has the same period whatever the amplitude.',
        rule: (A, f) => 2 * Math.PI * Math.sqrt(f.m_kg / f.k_Nm),
        exact: (A, f) => springPeriodRK4(f.m_kg, f.k_Nm, A, f.k3_Nm3),
        method: 'RK4 integration of the spring motion (cubic stiffness term when set)',
      },
      period_formula: {
        claim: 'equals_formula', param: 'm_kg', unit: 'kg', range: [0.1, 10], limits: [1e-3, 1e4],
        fixed: { k_Nm: 10, amplitude_m: 0.1, k3_Nm3: 0 }, quantity: 'period', quantityUnit: 's', samples: 24,
        statement: 'The period of a mass on a spring is 2π√(m/k).',
        rule: (m, f) => 2 * Math.PI * Math.sqrt(m / f.k_Nm),
        exact: (m, f) => springPeriodRK4(m, f.k_Nm, f.amplitude_m, f.k3_Nm3),
        method: 'RK4 integration of the spring motion',
      },
    },
  },
  {
    id: 'projectile', title: 'Projectiles',
    rules: {
      max_range_45: {
        claim: 'maximum_at', param: 'v_ms', unit: 'm/s', range: [1, 100], limits: [0.1, 1000],
        fixed: { k_per_m: 0 }, quantity: 'best launch angle', quantityUnit: 'deg', samples: 40,
        statement: 'From ground level a projectile goes furthest launched at 45°.',
        rule: () => 45,
        exact: (v, f) => argmax((ang) => projectileFlight(v, ang, f.k_per_m).range, 1, 89, f.k_per_m ? 60 : 200),
        method: 'range at each angle (exact with no air, RK4 with drag), maximised by golden-section search',
      },
      time_up_equals_down: {
        claim: 'equals_formula', param: 'v_ms', unit: 'm/s', range: [1, 100], limits: [0.1, 1000],
        fixed: { k_per_m: 0 }, quantity: 'time down', quantityUnit: 's', samples: 24,
        statement: 'Thrown straight up with no air, the ball takes as long to go up as to come down.',
        rule: (v, f) => upDownRK4(v, f.k_per_m).tUp,
        exact: (v, f) => upDownRK4(v, f.k_per_m).tDown,
        method: 'RK4 integration of the vertical flight, apex and landing found by interpolation',
      },
    },
  },
  {
    id: 'gravity_height', title: 'Gravity with height',
    rules: {
      g_constant: {
        claim: 'independent_of', param: 'h_km', unit: 'km', range: [0, 1000], limits: [0, 1e6],
        fixed: { R_km: R_EARTH_KM }, quantity: 'g', quantityUnit: 'm/s²',
        statement: 'Near the surface g is a constant 9.81 m/s², whatever the height.',
        rule: () => G0,
        exact: (h, f) => G0 * (f.R_km / (f.R_km + h)) ** 2,
        method: 'inverse-square law of gravity',
      },
    },
  },
  {
    id: 'orbit', title: 'Orbits',
    rules: {
      kepler_third: {
        claim: 'equals_formula', param: 'a_AU', unit: 'AU', range: [0.3, 30], limits: [0.01, 1000],
        fixed: { mass_ratio: 0 }, quantity: 'orbit period', quantityUnit: 'yr', samples: 24,
        statement: 'The square of the orbit period is proportional to the cube of the orbit size.',
        rule: (a) => Math.sqrt(a ** 3),
        exact: (a, f) => orbitPeriodRK4(a, f.mass_ratio),
        method: 'RK4 integration of the two-body orbit',
      },
    },
  },
];
