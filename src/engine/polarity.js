// Derived world state — polarity, the hegemon, and the eras that used to be typed calendar years.
// operator / derived-polarity (package 9). No country names anywhere in this file.
//
// The promoted era terms (`great_game`, `aid_conditionality`) were switched by hand-typed dates: 1947–1991 and
// 1992–2016. Forward from the last typed year they are off forever, so no future bipolarity can reactivate the
// client-coup mechanism and no future promotion era can exist. They were fitted *because the eras had happened*;
// a forecast needs the state, not the dates. This module computes the state, and the same code runs in the panel
// builder (scripts/build-panel.mjs) and in the simulation (src/engine/core.js), so the two cannot drift apart.
//
// The construction, in three steps:
//
//   1. PROJECTION-WEIGHTED CAPABILITY. An actor's share of world capability is the geometric mean of its CINC share
//      and its share of world military expenditure. CINC alone will not do: it is the unweighted mean of six
//      indicators of which four are latent mass (population, urban population, energy, iron and steel), so on CINC
//      the largest 2016 share is 22.9% against the second's 13.2% and a "top holds more than twice the second" rule
//      reads the 2016 world as unipolar under the *wrong* pole. Military expenditure is the mobilised half of the
//      same quantity and is the one indicator of the six that measures what a pole can actually project. Weighting
//      them equally (`cinc_weight` = 0.5) is a choice, recorded as an estimate below with what it reproduces.
//
//   2. SMOOTHING. Polarity is a structural state, not an annual measurement: a mobilisation spike or one bad
//      exchange-rate year is not a change of poles. The shares are smoothed with an exponential moving average
//      (`lambda`), which is causal — it uses no year after the one being classified, so a backtest at as-of Y sees
//      exactly what a forecaster standing at Y would have seen — and is a single running state, so the simulation
//      can carry it forward without keeping a window of history.
//
//   3. THE GAP RULE. Ranked by smoothed share, the poles are the actors above the first gap of at least `gap`
//      (one share at least twice the next). One pole = unipolar, two = bipolar, more (or no gap in the top five)
//      = multipolar. This is the package's own rule ("unipolar if the top actor holds > 2× the second; bipolar if
//      two actors each exceed a threshold and the third is far behind") with the threshold expressed as the same
//      ratio in both places rather than as two separate numbers.
//
// Every constant is calibrated, not sourced: see `estimate` on each field. What they reproduce is in
// scripts/analysis/polarity.mjs and in docs/escalations.md under the package.
export const POLARITY = {
  /** Weight on the CINC share in the geometric mean; 1 − it is the weight on the military-expenditure share.
   *  estimate: 0.5 (equal). Grid over {0.4, 0.5, 0.6, 0.65, 0.7, 0.75, 0.8} × λ × gap: 0.5 is the only weight that
   *  needs no other knob moved off its principled value (gap = 2.0, the package's own "twice") to reproduce both
   *  eras, and it is the one value that is a statement rather than a fit. */
  cinc_weight: 0.5,
  /** EWMA memory on the shares: share_t = λ·share_{t−1} + (1−λ)·raw_t. estimate: 0.75 — a 2.4-year half-life,
   *  ~4-year effective memory. Chosen by grid over {0.5, 0.6, 0.7, 0.75, 0.8, 0.85}: at 0.75 the derived eras are
   *  bipolar 1950–1994 and unipolar 1995–2014 with every year 1870–1938 multipolar and one one-year state in the
   *  whole 1816–2025 series; below it the series flickers (5–10 states shorter than three years), above it the
   *  transitions lag by more than the package's tolerance. */
  lambda: 0.75,
  /** A pole is separated from the next actor by at least this ratio. estimate: 2.0 — the package's own "> 2×".
   *  The eras it reproduces are stable over 1.95–2.05; at 1.9 the interwar reads bipolar for three years, at 2.1
   *  the détente years 1977–79 fall out of the bipolar era. */
  gap: 2.0,
  /** Ranks past this are not examined for the gap (an actor outside the top five is not a candidate pole). */
  max_poles: 5,
  /** The hegemon counts as a democracy at or above this regime score (V-Dem RoW: 0 closed autocracy … 3 liberal
   *  democracy). estimate: 2 = electoral democracy, the same cut every regime template in data/templates.yaml uses. */
  hegemon_regime_min: 2,
  /** The anti-coup norm is on when at least this share of live states are democracies (regime ≥ hegemon_regime_min).
   *  estimate: 0.5 — a majority. The panel crosses it in 2001 and falls back through it in 2024, against the typed
   *  flag's 2000 (AU Lomé 2000 / OAS 1991–2001), so the derived flag both finds the date and can switch off. */
  dem_share: 0.5,
  /** ODA/GNI is capped here (in %) before being scaled into tens — unchanged from the typed construction. */
  aid_cap: 30,
};

/** Rescale a Map of masses so it sums to one. An empty or zero-mass map comes back empty. */
export function normalise(m) {
  let s = 0; for (const v of m.values()) s += v;
  const out = new Map(); if (!(s > 0)) return out;
  for (const [k, v] of m) if (v > 0) out.set(k, v / s);
  return out;
}

/**
 * Projection-weighted capability shares from a CINC share map and a military-expenditure share map.
 * An actor missing either input is not scored: the geometric mean of a measured share and a missing one is not a
 * capability estimate, and zero would say "no capability" where the truth is "no observation".
 */
export function projectionShares(cincShare, milexShare, w = POLARITY.cinc_weight) {
  const raw = new Map();
  for (const [id, c] of cincShare) {
    const m = milexShare.get(id);
    if (!(c > 0) || !(m > 0)) continue;
    raw.set(id, Math.pow(c, w) * Math.pow(m, 1 - w));
  }
  return normalise(raw);
}

/**
 * One EWMA step over share maps. With no previous state the first observation is the state.
 * `keep`, where given, is the set of actors that still exist: one that has left the system leaves the average with
 * it rather than decaying inside it for the next twenty years (0.75^20 is still 0.3% of the share it held).
 */
export function smoothShares(prev, raw, lambda = POLARITY.lambda, keep = null) {
  if (!prev || !prev.size) return new Map(raw);
  const out = new Map();
  for (const id of new Set([...prev.keys(), ...raw.keys()])) {
    if (keep && !keep.has(id)) continue;
    out.set(id, lambda * (prev.get(id) ?? 0) + (1 - lambda) * (raw.get(id) ?? 0));
  }
  return normalise(out);
}

/**
 * Poles and polarity from a share map: the actors above the first gap of `gap` in the ranked shares.
 * Returns null for an empty map (no year of the panel has one, but a simulated world can retire everyone).
 */
export function classify(shares, gap = POLARITY.gap) {
  const ranked = [...shares].filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1));
  if (!ranked.length) return null;
  let k = Math.min(ranked.length, POLARITY.max_poles);
  for (let i = 0; i < Math.min(ranked.length - 1, POLARITY.max_poles); i++) {
    if (ranked[i][1] / ranked[i + 1][1] >= gap) { k = i + 1; break; }
  }
  return {
    polarity: k === 1 ? 'unipolar' : k === 2 ? 'bipolar' : 'multipolar',
    n_poles: k,
    poles: ranked.slice(0, k).map(([id]) => id),
    hegemon: ranked[0][0],
    hegemon_share: ranked[0][1],
    gap1: ranked[1] ? ranked[0][1] / ranked[1][1] : null,
    gap2: ranked[2] ? ranked[1][1] / ranked[2][1] : null,
    ranked,
  };
}

/**
 * The era flags every template used to read as a calendar year, now as functions of the state.
 *   bipolar / unipolar / multipolar   the polarity itself
 *   cold_war                          bipolarity (the typed flag was `year <= 1991`)
 *   promotion_era                     unipolarity under a democratic hegemon (the typed flag was 1992–2016)
 *   anticoup_norm                     a democratic majority of live states (the typed flag was `year >= 2000`)
 */
export function eraFlags({ polarity, hegemonRegime, demShare }) {
  const uni = polarity === 'unipolar', bi = polarity === 'bipolar';
  return {
    unipolar: uni ? 1 : 0,
    bipolar: bi ? 1 : 0,
    multipolar: polarity === 'multipolar' ? 1 : 0,
    cold_war: bi ? 1 : 0,
    promotion_era: uni && hegemonRegime != null && hegemonRegime >= POLARITY.hegemon_regime_min ? 1 : 0,
    anticoup_norm: demShare != null && demShare >= POLARITY.dem_share ? 1 : 0,
  };
}

/**
 * Aid conditionality: ODA/GNI (capped, in tens) while the promotion era is on, and a structural zero outside it.
 * Outside the era there is no conditionality regime, so zero is the value and not a missing observation. Inside it,
 * a missing ODA/GNI is a missing observation (null) *where the source covers the year at all*; before the source
 * starts (World Bank ODA/GNI begins 1960) it is again a structural zero — the derived promotion era can open in a
 * year no aid series reaches, and nulling those rows would drop them from every template that reads the term.
 *
 * era-1991-2026-r2/statistics-4 and data-6: World Bank DT.ODA.ODAT.GN.ZS is a RECIPIENT series. It has no row for a
 * donor, and none for a graduated high-income state after it graduates, so a null there means "receives no
 * measurable aid this year" and not "unobserved" — and reading it as unobserved deleted 1,259 live actor-years
 * across 66 actors (every OECD democracy, the Gulf, Japan, Korea, Singapore, Taiwan) from every template that
 * carries the term, in the only twenty years (1995-2014) that identify it. A missing row inside the source's own
 * coverage is therefore a structural zero, the same value the function already returns outside the era. The panel
 * column `aid_recipient` keeps "never in the series at all" separable from "in it in some years" so the two cases
 * can still be told apart in a fit; the `covered` flag still distinguishes years before the series starts.
 */
export function conditionality(promotionEra, aidGni, covered = true) {
  if (!promotionEra) return 0;
  if (aidGni == null) return 0;
  return Math.min(aidGni, POLARITY.aid_cap) / 10;
}

/** The superpower-client interaction: a client of a pole's bloc, in a bipolar world. */
export const greatGame = (clientAny, bipolar) => (clientAny && bipolar ? 1 : 0);

// ---- the information wave -------------------------------------------------------------------------------------
// `info_access` used to diffuse in the simulation at a rate switched by hand at a calendar year (0.15/yr from 1985,
// 0.03 before). This replaces the switch with the wave the panel's own series traces:
//
//   F(y)  the world frontier — a logistic fitted by least squares to the live-actor mean of `info_access`
//   x_i   an actor closes `kappa` of its gap to the frontier each year, and never loses access (the step is clamped
//         at zero, so before the frontier rises above an actor's floor nothing happens at all)
//
// Both constants are fitted by scripts/build-panel.mjs on every build and carried in panel.meta.info_wave; `kappa`
// is fitted against what the rule *does*, not against one-year differences — the rule is run forward from five
// starting years to 2024 and scored on the live-actor mean it produces. On that objective the fitted rule scores
// rmse 0.0795 against the typed switch's 0.0822, and unlike the switch it needs no date and cannot run past one:
// a 19th-century run holds at the panel's floor (0.02 in 1870 is still 0.02 in 1890) because F is ~0 there.
export const INFO_WAVE = { L: 1, r: 0.086, t0: 2000.75, rmse: 0.0361, n: 209, kappa: 0.295, kappa_rmse: 0.0795, kappa_n: 195, note: 'estimate: fitted in scripts/build-panel.mjs from the panel live-actor mean of info_access; this is the fallback and what that build last produced' };

/** Least-squares logistic L/(1+exp(-r(y-t0))) over [[year, value], ...] by coarse grid then local refinement. */
export function fitLogistic(series) {
  const pts = series.filter(([, v]) => v != null && Number.isFinite(v));
  if (pts.length < 10) return null;
  const sse = (L, r, t0) => { let s = 0; for (const [y, v] of pts) { const f = L / (1 + Math.exp(-r * (y - t0))); s += (v - f) * (v - f); } return s; };
  let best = null;
  for (let L = 0.80; L <= 1.0001; L += 0.005) for (let r = 0.04; r <= 0.30; r += 0.002) for (let t0 = 1985; t0 <= 2020; t0 += 0.25) {
    const s = sse(L, r, t0); if (!best || s < best.sse) best = { L, r, t0, sse: s };
  }
  return { L: +best.L.toFixed(4), r: +best.r.toFixed(4), t0: +best.t0.toFixed(2), rmse: +Math.sqrt(best.sse / pts.length).toFixed(5), n: pts.length };
}

/** The fitted frontier: the share of a live actor's population with ready access to independent information. */
export const infoFrontier = (y, w = INFO_WAVE) => w.L / (1 + Math.exp(-w.r * (y - w.t0)));

/** One year of diffusion: close `kappa` of the remaining gap to the frontier, never downward. */
export function infoStep(x, y, w = INFO_WAVE) {
  if (x == null) return null;
  return Math.min(1, x + Math.max(0, (w.kappa ?? INFO_WAVE.kappa) * (infoFrontier(y, w) - x)));
}

/**
 * Fit `kappa` to what the rule does: run the diffusion forward from each of `starts` to `to` and score the
 * live-actor mean it produces against the one the panel observed. `actorSeries` is one Map(year -> value) per actor.
 * Returns the rate, its rmse on that objective, and the number of year-points scored.
 */
export function fitDiffusionRate(actorSeries, wave, starts, to) {
  const score = (k) => {
    let ss = 0, n = 0;
    for (const s of starts) {
      const xs = new Map();
      actorSeries.forEach((m, i) => { const x = m.get(s); if (x != null) xs.set(i, x); });
      if (!xs.size) continue;
      for (let y = s + 1; y <= to; y++) {
        for (const [i, x] of xs) xs.set(i, Math.min(1, x + Math.max(0, k * (infoFrontier(y, wave) - x))));
        let sim = 0; for (const v of xs.values()) sim += v; sim /= xs.size;
        let o = 0, m = 0; for (const i of xs.keys()) { const z = actorSeries[i].get(y); if (z == null) continue; o += z; m++; }
        if (!m) continue;
        ss += (sim - o / m) ** 2; n++;
      }
    }
    return { ss, n };
  };
  let best = null;
  for (let k = 0.02; k <= 0.9001; k += 0.005) { const r = score(+k.toFixed(3)); if (!r.n) continue; if (!best || r.ss < best.ss) best = { kappa: +k.toFixed(3), ...r }; }
  return best ? { kappa: best.kappa, kappa_rmse: +Math.sqrt(best.ss / best.n).toFixed(5), kappa_n: best.n } : null;
}
