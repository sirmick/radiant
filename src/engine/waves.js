// Capability as a portfolio of waves — operator / capability-waves (package 12). No country names anywhere in this
// file; every identifier it handles comes out of data/waves.yaml, data/panel.json or the simulated world.
//
// WHAT THIS REPLACES. CINC is the unweighted mean of six share-of-system indicators — military expenditure and
// personnel, iron and steel, primary energy, total and urban population. Four of the six are latent mass and none of
// them is a technology. A drone war between a large steel producer and a small one is called for the steel producer
// by construction, and the operator's question — whether a shrinking manufacturing base loses the *mass-heavy* waves
// to a larger one while still leading the low-mass ones — cannot even be stated in that index, let alone tested.
//
// THE CONSTRUCTION, in three pieces, each of which is separately falsifiable:
//
//   1. ATTAINMENT.  Per actor and wave, a discrete-time hazard of reaching sovereign production (I -> S). The unit is
//      the actor-wave-year while the wave exists and the actor has not attained it; the label is attainment in the
//      following year (`lead: 1`, like every other state-transition template). Fitted on the dated `sovereign_by`
//      histories in data/waves.yaml. `attainFeatures` below is the one construction, called by scripts/lib/fit.mjs
//      and by src/engine/core.js so the sample the coefficients come from and the sample the simulation draws are the
//      same object (agent/implementer.md).
//
//   2. MASS.  Each wave carries a `mass` coefficient in [0,1]: how much of its military value is production RATE
//      rather than possession. Stealth is low (a handful of airframes decide it); artillery munitions and attritable
//      drones are high (the war is the factory). An actor's contribution from a wave is
//          attained x industry_share^mass
//      so mass = 0 makes every attainer equal and mass = 1 makes the wave a pure read on manufacturing share. The
//      coefficients are hand-typed per wave in data/waves.yaml with a `mass_source` each; they are the package's
//      testable claim, not a measurement.
//
//   3. DISPLACEMENT.  A wave's weight rises from `introduced` on its own diffusion clock, and decays after `retired`.
//      Effective capability is the weighted portfolio, normalised to a world share. See `waveWeight`.
//
// The result, `waveShares`, is a share-of-world series on the same scale as CINC's, so the dyadic capability ratio and
// src/engine/polarity.js can read it in place of `cinc` (behind `WAVE_CAPABILITY` / `ENGINE_ABLATE=waves`, so the two
// can be scored apart).

/** Constants that are choices rather than measurements. Every one is an estimate and says what it is worth. */
export const WAVES = {
  /** Logistic ramp: a wave reaches half weight `median_years_to_S` after its introduction and the ramp's width is
   *  `spread / SPREAD_TO_SCALE` (so +/- one `spread` spans roughly 12%-88% of the weight). estimate: the wave's own
   *  diffusion profile is used as the displacement clock rather than a second set of numbers — the years by which
   *  half the followers can build a thing are the years by which it is worth something to everyone. */
  spread_to_scale: 1.7,
  /** After `retired` the weight halves every this many years. estimate: 20. A retired wave is displaced as a
   *  *capability*, not deleted: rail was still worth something in 1970. Sensitivity is reported by
   *  scripts/analysis/waves.mjs. */
  retire_half_life: 20,
  /** Where a wave declares no diffusion profile, the ramp midpoint in years. estimate: 20, the median of the profiles
   *  that are declared. */
  default_median_years: 20,
  /** ... and its width in years. estimate: 12, likewise. */
  default_spread: 12,
  /** Weight on raw industrial mass beside the wave portfolio. estimate: 0.25. The coded wave list is not exhaustive —
   *  it has fourteen entries and no rifles, ships, rail gauge or chemistry line of its own — so an actor with a real
   *  industrial base and no *coded* wave must not come out at exactly zero capability. This is the share of the index
   *  that is the mass itself, and setting it to 0 (`WAVE_BASE=0`) is a scored ablation, not a hidden default. */
  base_weight: 0.25,
  /** Floor added to every live actor's share before normalisation, so a dyadic ratio can never divide by zero.
   *  estimate: 1e-6 — four orders of magnitude below the smallest observed non-zero share. */
  floor: 1e-6,
  /** The at-risk floor: an actor is a candidate attainer of a wave only while it holds at least this share of world
   *  industrial output. estimate: 3e-4 (0.03%). The wave ladder is N -> I -> S and this stands in for "is at least at
   *  I": nothing in the data says which states IMPORT a technology, and without the floor the sample is 167,506
   *  actor-wave-years carrying 175 attainments (0.10%), nine tenths of them microstates that were never candidates for
   *  sovereign steel, let alone sovereign stealth. At 3e-4 the sample is 65,879 rows and 153 attainments (0.23%); the
   *  22 attainments below the floor are structural misses and are counted, not hidden — scripts/analysis/waves.mjs
   *  prints them and the sweep over {0, 1e-4, 3e-4, 1e-3, 3e-3} that chose it. */
  min_industry: 3e-4,
  /** An importer (level I) contributes this fraction of an attainer's wave value. estimate: 0 — the package's own
   *  definition ("S = makes it at scale") with no partial credit, kept explicit because it is the assumption most
   *  likely to be wrong: an actor that buys the whole inventory is not militarily at zero. */
  import_value: 0,
};

/** log-share, the scale every industrial covariate is on. A zero share is a floor, not a missing observation. */
export const logShare = (s) => Math.log10(Math.max(s ?? 0, WAVES.floor));

/**
 * Normalise the wave list out of data/waves.yaml and check that every hand-typed number carries a source.
 *
 * The rule the operator set for this package: a modern wave's `sovereign_by` dates are claims about who first built
 * a thing, and each one has to say where it came from. `sovereign_source` is a parallel map keyed the same way, whose
 * value is either a citation or a string beginning `estimate`. Waves introduced before `documented_from` are covered
 * by the file header's blanket note (Bairoch / Mitchell industrialisation levels) and are not required to carry one.
 */
export const DOCUMENTED_FROM = 1900;

/** The template unit this module owns, named once so the fitter and the engine cannot disagree about the string. */
export const WAVE_UNIT = 'actor-wave-year';

export function loadWaves(doc, { strict = true } = {}) {
  const list = (doc?.waves ?? []).map(w => ({ ...w }));
  const problems = [];
  for (const w of list) {
    if (w.mass == null) problems.push(`${w.id}: no mass coefficient`);
    else if (!(w.mass >= 0 && w.mass <= 1)) problems.push(`${w.id}: mass ${w.mass} outside [0,1]`);
    if (w.mass != null && !w.mass_source) problems.push(`${w.id}: mass has no mass_source`);
    if (w.introduced >= DOCUMENTED_FROM) {
      const src = w.sovereign_source ?? {};
      for (const id of Object.keys(w.sovereign_by ?? {})) {
        if (!src[id]) problems.push(`${w.id}/${id}: sovereign_by has no sovereign_source entry`);
      }
    }
  }
  if (problems.length && strict) throw new Error(`data/waves.yaml: ${problems.length} undocumented entries\n  ${problems.join('\n  ')}`);
  return { waves: list, problems };
}

/** Waves that exist in year `y` and are not a declared candidate with no history. */
export const activeWaves = (waves, y) => waves.filter(w => w.introduced != null && w.introduced <= y);

/**
 * Displacement weight of a wave in year `y` — a logistic ramp on the wave's own diffusion clock, times an exponential
 * decay after `retired`. Zero before `introduced`.
 */
export function waveWeight(w, y) {
  if (w.introduced == null || y < w.introduced) return 0;
  const m = w.diffusion?.median_years_to_S ?? WAVES.default_median_years;
  const s = Math.max(1, (w.diffusion?.spread ?? WAVES.default_spread) / WAVES.spread_to_scale);
  const ramp = 1 / (1 + Math.exp(-((y - w.introduced) - m) / s));
  const decay = w.retired != null && y > w.retired ? Math.pow(0.5, (y - w.retired) / WAVES.retire_half_life) : 1;
  return ramp * decay;
}

/** Who is sovereign in a wave at year `y`, from its dated history. */
export function holdersAt(w, y) {
  const out = new Set();
  for (const [id, yr] of Object.entries(w.sovereign_by ?? {})) if (yr != null && yr <= y) out.add(id);
  return out;
}

/**
 * The wave-weighted capability share, one year.
 *
 *   cap_i = ( sum_w weight_w(y) * a_iw * industry_i^mass_w ) / sum_w weight_w(y)   +   base_weight * industry_i
 *
 * `a_iw` is the actor's attainment in the wave: 1 sovereign, `import_value` otherwise. The first term is the fraction
 * of the *current* portfolio the actor holds, discounted by its production share exactly as far as each wave's mass
 * coefficient says; the second is the industrial mass no coded wave carries. Normalised over the actors passed in, so
 * the result is a share of the world as this call defines it — pass the live set.
 *
 * @param attained (id, waveId) => boolean
 * @param industry (id) => share of world industrial output in [0,1]
 */
export function waveShares({ waves, year, ids, attained, industry }) {
  const active = activeWaves(waves, year);
  const wts = active.map(w => waveWeight(w, year));
  const total = wts.reduce((a, b) => a + b, 0);
  const raw = new Map();
  for (const id of ids) {
    const ind = Math.max(industry(id) ?? 0, 0);
    let s = 0;
    if (total > 0) {
      for (let i = 0; i < active.length; i++) {
        if (!wts[i]) continue;
        const a = attained(id, active[i].id) ? 1 : WAVES.import_value;
        if (!a) continue;
        s += wts[i] * a * Math.pow(Math.max(ind, WAVES.floor), active[i].mass ?? 0.5);
      }
      s /= total;
    }
    raw.set(id, s + WAVES.base_weight * ind + WAVES.floor);
  }
  let sum = 0; for (const v of raw.values()) sum += v;
  const out = new Map();
  if (!(sum > 0)) return out;
  for (const [k, v] of raw) out.set(k, v / sum);
  return out;
}

/**
 * The attainment hazard's covariates, one actor-wave-year. ONE construction, read by the fitter (over the panel) and
 * by the engine (over the simulated world) — the two differ only in where `ctx` comes from.
 *
 * The package names four channels; these are them, plus the diffusion clock without which the hazard is a base rate:
 *   industrial base   `wave_industry`  log10 share of world industrial output (steel historically, manufacturing
 *                                      value added where the World Bank publishes it — scripts/build-panel.mjs)
 *   income            `log_gdp_pc`     Maddison, as everywhere else in the model
 *   access            `wave_access`    a defence pact with an actor that is already sovereign in THIS wave
 *   demand            `at_war`, `great_power`
 *   the clock         `wave_clock`     log1p(years since the wave was introduced)
 *                     `wave_diffusion` the share of live actors already sovereign in it
 */
export function attainFeatures({ wave, year, industryShare, logGdpPc, access, diffusion, atWar, greatPower }) {
  if (logGdpPc == null) return null;
  return {
    wave_clock: Math.log1p(Math.max(0, year - wave.introduced)),
    wave_industry: logShare(industryShare),
    log_gdp_pc: logGdpPc,
    wave_access: access ? 1 : 0,
    wave_diffusion: diffusion ?? 0,
    at_war: atWar ? 1 : 0,
    great_power: greatPower ? 1 : 0,
  };
}

/**
 * Build the attainment design rows over the panel. Used by scripts/lib/fit.mjs for the production template and by
 * scripts/analysis/waves.mjs for the held-out-wave test, so test (a) grades the template the engine actually runs.
 *
 * The sample is the actor-wave-year while the wave exists, the actor is live, and it has not yet attained; the label
 * is attainment in year + `lead`. An actor that never attains inside the window is right-censored by the window, not
 * scored as a permanent non-attainer past the data.
 *
 * @param allied (a, b, year) => boolean — the defence-pact edge, passed in because the fitter reads dated pacts and
 *        the engine reads the edge set frozen at as-of, and neither belongs in this module
 * @param waveFilter optional (wave) => boolean, for fitting on one cohort of waves and predicting another
 */
export function attainRows({ waves, panel, allied, window: win, lead = 1, waveFilter = null, minIndustry = WAVES.min_industry }) {
  const Y0 = panel.meta.y0;
  const [w0, w1] = win;
  const pv = (id, v, y) => panel.actors[id]?.[v]?.[y - Y0] ?? null;
  const live = (id, y) => panel.actors[id]?.live?.[y - Y0] === 1;
  const rows = [];
  const ids = Object.keys(panel.actors);
  for (const w of waves) {
    if (w.introduced == null) continue;
    if (waveFilter && !waveFilter(w)) continue;
    const by = w.sovereign_by ?? {};
    // the diffusion pressure term, precomputed per year: the share of live actors already sovereign
    const nHold = new Map();
    for (let y = w0; y <= w1; y++) {
      let n = 0, d = 0;
      for (const id of ids) { if (!live(id, y)) continue; d++; if (by[id] != null && by[id] <= y) n++; }
      nHold.set(y, d ? n / d : 0);
    }
    for (const id of ids) {
      const got = by[id] ?? null;
      for (let y = Math.max(w0, w.introduced); y <= w1; y++) {
        if (got != null && y >= got) break;                 // no longer at risk once sovereign
        if (!live(id, y)) continue;
        const ind = pv(id, 'industry_share', y);
        if (!(ind >= minIndustry)) continue;                // below the at-risk floor: see WAVES.min_industry
        const holders = holdersAt(w, y);
        let access = 0;
        for (const h of holders) { if (h === id) continue; if (allied(id, h, y)) { access = 1; break; } }
        const feats = attainFeatures({
          wave: w, year: y,
          industryShare: ind,
          logGdpPc: pv(id, 'log_gdp_pc', y),
          access, diffusion: nHold.get(y),
          atWar: pv(id, 'at_war', y), greatPower: pv(id, 'great_power', y),
        });
        if (!feats) continue;
        rows.push({ unit: `${w.id}|${id}`, wave: w.id, actor: id, year: y, feats, y: got != null && got === y + lead ? 1 : 0 });
      }
    }
  }
  return rows;
}
