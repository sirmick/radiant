// C1 (docs/plan-structure.md): the growth process, fitted rather than typed.
//
// g_it = m + s_it + f_it + e_it + war * at_war_it, per-capita log growth. `m` is the world's own trailing 20-year mean
// at the origin (a quantity the forecaster holds); s is a slow AR(1) (decade-scale divergence — what lets capability
// shares, and therefore poles, move), f a fast AR(1) (the business cycle), e iid noise. The engine this replaces drew
// uniform noise of sd 1.2% around a trailing mean that decayed to a common 1.72% inside a decade, which put the 20-year
// dispersion of log GDP per head at ~0.1 against the panel's 0.33-0.50, and froze every share and every pole.
//
// Parameters: scripts/analysis/growth.mjs on the full panel (1820-2025, era-demeaned within-actor autocorrelation at
// lags 1-10, method of moments). Implied 20-year dispersion 0.415. A STATED LEAK: before 1950 the panel's own
// autocorrelation does not identify the two components (war rebounds make it negative), so a past-origin forecast uses
// these full-sample process parameters — the shape of the noise, not any outcome.
export const GROWTH_PROCESS = {
  phi_fast: 0.34, sd_fast: 0.0354, phi_slow: 0.862, sd_slow: 0.0106, sd_iid: 0.0425, war: -0.0134,
  // the expected persistent component given the trailing decade's deviation, and the fast one given last year's —
  // Cov(s, trailing mean) / Var(trailing mean) and the fast variance share, from the same fit
  init_slow: 0.32, init_fast: 0.39,
  mean_window: 20,
  source: 'scripts/analysis/growth.mjs (panel gdp_growth 1820-2025, 14,573 actor-years)',
};

/** One standard normal from a uniform stream (Box-Muller; two uniforms, one normal — the stream stays simple). */
export function gauss(rng) { const u = Math.max(1e-12, rng()), v = rng(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }

/** The world's trailing mean growth at the origin: the mean over live actor-years in the window ending at asOf. */
export function trailingMean(panel, asOf, fallback) {
  const Y0 = panel.meta.y0; let s = 0, n = 0;
  for (let y = asOf - GROWTH_PROCESS.mean_window + 1; y <= asOf; y++) { const i = y - Y0; if (i < 0) continue; for (const a of Object.values(panel.actors)) { const g = a.gdp_growth?.[i]; if (g != null && a.live?.[i] && Math.abs(g) < 0.5) { s += g; n++; } } }
  return n ? s / n : fallback;
}

/** Seed an actor's persistent components from its own recent record (as-of knowledge). */
export function initGrowth(a, m) {
  const P = GROWTH_PROCESS;
  a.gSlow = P.init_slow * ((a.growth ?? m) - m);
  a.gFast = P.init_fast * ((a.cur.gdp_growth ?? m) - m);
}

/** This year's per-capita growth for one actor. */
export function drawGrowth(a, rng, m, atWar) {
  const P = GROWTH_PROCESS;
  if (a.gSlow == null) initGrowth(a, m);
  a.gSlow = P.phi_slow * a.gSlow + P.sd_slow * gauss(rng);
  a.gFast = P.phi_fast * a.gFast + P.sd_fast * gauss(rng);
  return m + a.gSlow + a.gFast + P.sd_iid * gauss(rng) + (atWar ? P.war : 0);
}
