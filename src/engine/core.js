// Radiant engine v0 — annual-step stochastic world model, pure ESM (node + browser).
// State is built from the historical panel as-of a year; hazards are the fitted templates (data/fits.json);
// events fire per actor-year / dyad-year and rewrite state; a thin structural layer drifts the slow variables.
// No country names anywhere in this file.

export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const sigmoid = (x) => 1 / (1 + Math.exp(-x));
const pairKey = (a, b) => (a < b ? `${a}|${b}` : `${b}|${a}`);

/** Build a world state at `asOf` from the panel. Only actors live at asOf with a regime value are included. */
export function createWorld({ panel, events, fits, templates, asOf, pacts, contiguity, universe = 'modeled' }) {
  const Y0 = panel.meta.y0; const idx = asOf - Y0;
  const pv = (id, v, y) => { const arr = panel.actors[id]?.[v]; const i = y - Y0; return arr && i >= 0 && i < arr.length ? arr[i] : null; };
  const actors = {};
  for (const [id, vars] of Object.entries(panel.actors)) {
    if (!vars.live?.[idx]) continue;
    if (universe === 'modeled' && !vars.modeled?.[idx]) continue;
    const cur = {}; for (const v of Object.keys(vars)) cur[v] = vars[v][idx];
    // trailing growth rates for the structural layer
    const g = []; for (let k = 1; k <= 10; k++) { const x = pv(id, 'gdp_growth', asOf - k); if (x != null) g.push(x); }
    const pg = []; for (let k = 1; k <= 10; k++) { const a = pv(id, 'population', asOf - k), b = pv(id, 'population', asOf - k - 1); if (a && b) pg.push(Math.log(a / b)); }
    // recent-event memory (for win5 covariates) seeded from the panel/events
    const recent = {};
    for (const v of ['coup_attempt', 'intrastate', 'mid_force', 'at_war']) { recent[v] = []; for (let k = 1; k <= 5; k++) { const x = pv(id, v, asOf - k); recent[v].push(x != null && x > 0 ? 1 : 0); } }
    recent.leader_exit = []; for (let k = 1; k <= 5; k++) recent.leader_exit.push(events.some(e => e.kind === 'leader_exit' && e.actor === id && Math.floor(e.year) === asOf - k) ? 1 : 0);
    const prev = {}; for (const v of Object.keys(vars)) prev[v] = pv(id, v, asOf - 1);
    actors[id] = { id, cur, prev, recent, growth: g.length ? g.reduce((a, b) => a + b, 0) / g.length : 0.015, popGrowth: pg.length ? pg.reduce((a, b) => a + b, 0) / pg.length : 0.01, fired: {} };
  }
  // dyad memory: recent disputes, alliances at asOf
  const dyadRecent = new Map();
  for (const e of events) if ((e.kind === 'mid_force' || e.kind === 'mid_war') && e.a && e.b && e.year <= asOf && e.year > asOf - 5) dyadRecent.set(pairKey(e.a, e.b), asOf);
  const nukes = new Set(); for (const e of events) if (e.kind === 'nuclear' && e.status === 'weapon' && e.year <= asOf) nukes.add(e.actor);
  return { year: asOf, asOf, actors, dyadRecent, nukes, pacts: pacts ?? new Set(), contiguity: contiguity ?? {}, fits, templates, log: [] };
}

/** Feature value for a covariate spec, mirroring scripts/fit-hazards.mjs. */
function featureActor(world, a, c) {
  const v = c.var;
  const derived = {
    milper_share: (s) => (s.milper != null && s.tpop ? (s.milper * 1e3) / s.tpop : null),
    leader_exit_recent: () => (a.recent.leader_exit.some(x => x) ? 1 : 0),
    regime_change: () => (a.fired.regime_change ? 1 : 0),
  };
  if (c.transform === 'win5') { if (derived[v]) return derived[v](a.cur); return a.recent[v]?.some(x => x) ? 1 : 0; }
  const lag = c.lag ?? (c.transform === 'lag1' ? 1 : 0);
  const src = lag ? a.prev : a.cur;
  if (derived[v]) return derived[v](src);
  return src[v] ?? null;
}
function encodeValue(fit, name, x) { return x; }
function linearPredictor(fit, t, feats) {
  let eta = fit.intercept;
  for (const c of t.covariates) {
    const v = c.var, x = feats[v]; if (x == null) return null;
    if (c.transform === 'cat') { const levels = Object.keys(c.prior).map(Number).sort(); for (const L of levels.slice(1)) { const k = `${v}=${L}`; if (fit.coefs[k] && x === L) eta += fit.coefs[k].value; } }
    else if (c.transform === 'z') { const s = fit.stats[v]; eta += fit.coefs[`z(${v})`].value * ((x - s.mean) / (s.sd || 1)); }
    else if (c.transform === 'log') { const s = fit.stats[`log_${v}`]; eta += fit.coefs[`log(${v})`].value * (Math.log(x + 1e-3) - s.mean); }
    else { const k = c.transform === 'win5' ? `win5(${v})` : c.transform === 'lag1' ? `lag1(${v})` : v; eta += fit.coefs[k].value * (x > 0 ? 1 : 0); }
  }
  return eta;
}

/** Annual probability of each fitted actor-year template for one actor in the current state. */
export function actorHazards(world, a) {
  const out = {};
  for (const t of world.templates) {
    const fit = world.fits[t.id]; if (!fit || fit.status !== 'fitted' || t.unit !== 'actor-year') continue;
    const feats = {}; let ok = true;
    for (const c of t.covariates) { const x = featureActor(world, a, c); if (x == null) { ok = false; break; } feats[c.var] = x; }
    if (!ok) continue;
    const eta = linearPredictor(fit, t, feats); if (eta == null) continue;
    out[t.id] = sigmoid(eta);
  }
  return out;
}
export function dyadHazards(world, a, b) {
  const out = {}; const ca = a.cur.cinc, cb = b.cur.cinc; if (ca == null || cb == null || a.cur.regime == null || b.cur.regime == null) return out;
  const k = pairKey(a.id, b.id); const y = world.year;
  const contiguous = (world.contiguity[k] ?? []).some(([f, t]) => y >= f && y <= t) ? 1 : 0;
  const major = (a.cur.great_power || b.cur.great_power) ? 1 : 0;
  if (!contiguous && !major) return out;   // politically relevant dyads only
  const feats = {
    contiguous,
    allied: world.pacts.has(`${pairKey(a.id, b.id)}|${world.year}`) || world.pacts.has(`${pairKey(a.id, b.id)}|*`) ? 1 : 0,
    joint_democracy: a.cur.regime >= 2 && b.cur.regime >= 2 ? 1 : 0,
    cap_ratio: Math.max(ca, cb) / Math.max(1e-6, Math.min(ca, cb)),
    major_power_any: (a.cur.great_power || b.cur.great_power) ? 1 : 0,
    mid_force: (world.dyadRecent.get(pairKey(a.id, b.id)) ?? -1e9) > world.year - 6 ? 1 : 0,
    at_war_any: (a.prev.at_war || b.prev.at_war) ? 1 : 0,
    nuclear_both: world.nukes.has(a.id) && world.nukes.has(b.id) ? 1 : 0,
  };
  for (const t of world.templates) {
    const fit = world.fits[t.id]; if (!fit || fit.status !== 'fitted' || t.unit !== 'dyad-year') continue;
    const eta = linearPredictor(fit, t, feats); if (eta != null) out[t.id] = sigmoid(eta);
  }
  return out;
}

/** Effects of a fired event on state — the generic rewrites. */
function applyActorEvent(world, a, kind, rng) {
  const y = world.year; a.fired[kind] = y;
  switch (kind) {
    case 'leader_exit': a.cur.leader_tenure = 0; a.cur.leader_age = 45 + Math.floor(rng() * 25); a.cur.leader_military = rng() < 0.2 ? 1 : 0; a.recent.leader_exit[0] = 1; break;
    case 'coup': a.cur.coup_attempt = 1; if (rng() < 0.5) { a.cur.coup_success = 1; applyActorEvent(world, a, 'leader_exit', rng); a.cur.leader_irregular_entry = 1; if (a.cur.regime > 0 && rng() < 0.6) a.cur.regime -= 1; } break;
    case 'autocratization_onset': if (a.cur.regime > 0) a.cur.regime -= 1; a.cur.polyarchy = Math.max(0, (a.cur.polyarchy ?? 0.5) - 0.1); break;
    case 'democratization_onset': if (a.cur.regime < 3) a.cur.regime += 1; a.cur.polyarchy = Math.min(1, (a.cur.polyarchy ?? 0.5) + 0.1); break;
    case 'intrastate_onset': a.cur.intrastate = 1; a.conflictLeft = 1 + Math.floor(rng() * 6); a.cur.gdp_pc *= 0.97; break;
  }
}

/** One annual step: structural drift, then hazards. */
export function stepYear(world, rng, opts = {}) {
  world.year += 1; const y = world.year; const fired = [];
  const ids = Object.keys(world.actors);
  // snapshot prev, structural drift
  for (const id of ids) {
    const a = world.actors[id]; a.prev = { ...a.cur };
    const warShock = a.cur.at_war ? -0.04 : 0;
    const shock = (rng() - 0.5) * 0.04;
    if (a.cur.gdp_pc != null) { const g = a.growth + warShock + shock; a.cur.gdp_pc *= Math.exp(g); a.cur.gdp_growth = g; a.cur.log_gdp_pc = Math.log(a.cur.gdp_pc); }
    if (a.cur.population != null) a.cur.population *= Math.exp(a.popGrowth);
    if (a.cur.tpop != null) a.cur.tpop *= Math.exp(a.popGrowth);
    if (a.cur.leader_age != null) { a.cur.leader_age += 1; a.cur.leader_tenure = (a.cur.leader_tenure ?? 0) + 1; }
    // information access diffuses as a wave: logistic toward 1, rate from the observed 1990–2020 global trajectory (~0.15/yr), slow before 1985
    // superpower structure: bipolarity is a world-level state (1947–1991 historically; later a function of how many actors hold >10% CINC)
    a.cur.bipolar = y >= 1947 && y <= 1991 ? 1 : 0;
    a.cur.sp_client_any = (a.cur.pact_usa || a.cur.pact_rus) ? 1 : 0;
    a.cur.sp_client_one = ((a.cur.pact_usa ? 1 : 0) + (a.cur.pact_rus ? 1 : 0)) === 1 ? 1 : 0;
    a.cur.great_game = a.cur.bipolar && a.cur.sp_client_any ? 1 : 0;
    if (a.cur.info_access != null) { const r = y >= 1985 ? 0.15 : 0.03; const x = Math.max(0.02, a.cur.info_access); a.cur.info_access = Math.min(1, x + r * x * (1 - x)); }
    // clear annual flags; decay conflicts
    a.cur.coup_attempt = 0; a.cur.coup_success = 0; a.cur.at_war = 0; a.cur.mid_force = 0; a.cur.mid_war = 0;
    if (a.cur.intrastate) { a.conflictLeft = (a.conflictLeft ?? 1) - 1; if (a.conflictLeft <= 0) a.cur.intrastate = 0; }
    for (const v of Object.keys(a.recent)) { a.recent[v].unshift(0); a.recent[v].length = 5; }
    if (a.prev.coup_attempt) a.recent.coup_attempt[0] = 1; if (a.prev.intrastate) a.recent.intrastate[0] = 1; if (a.prev.mid_force) a.recent.mid_force[0] = 1; if (a.prev.at_war) a.recent.at_war[0] = 1;
  }
  // actor hazards
  for (const id of ids) {
    const a = world.actors[id]; const hz = actorHazards(world, a);
    for (const [kind, p] of Object.entries(hz)) {
      if (rng() < p) { const ev = { kind: world.templates.find(t => t.id === kind).event, template: kind, actor: id, year: y }; fired.push(ev); applyActorEvent(world, a, ev.kind === 'coup' ? 'coup' : ev.kind, rng); }
    }
  }
  // dyad hazards
  if (!opts.skipDyads) for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
    const a = world.actors[ids[i]], b = world.actors[ids[j]]; const hz = dyadHazards(world, a, b);
    if (hz.mid_force != null && rng() < hz.mid_force) { fired.push({ kind: 'mid_force', a: a.id, b: b.id, year: y }); world.dyadRecent.set(pairKey(a.id, b.id), y); a.cur.mid_force = 1; b.cur.mid_force = 1; }
    if (hz.mid_war != null && rng() < hz.mid_war) { fired.push({ kind: 'mid_war', a: a.id, b: b.id, year: y }); world.dyadRecent.set(pairKey(a.id, b.id), y); a.cur.at_war = 1; b.cur.at_war = 1; a.cur.mid_war = 1; b.cur.mid_war = 1; }
  }
  world.log.push(...fired);
  return fired;
}

/** Run an ensemble from a world factory. Returns per-run event logs and aggregated probabilities. */
export function runEnsemble(makeWorld, { runs = 200, horizon = 20, seed = 1, skipDyads = false } = {}) {
  const anyBy = {};   // `${kind}|${actor}` -> count of runs with ≥1 event within horizon
  const countBy = {}; // expected counts
  const dyadAny = {};
  const yearHist = {}; // `${kind}|${actor}` -> [count per year offset]
  const firstBy = {};  // first-occurrence histogram, for P(any within k years)
  for (let r = 0; r < runs; r++) {
    const rng = mulberry32(seed * 7919 + r); const w = makeWorld();
    const seen = new Set(), seenD = new Set();
    for (let h = 1; h <= horizon; h++) {
      const fired = stepYear(w, rng, { skipDyads });
      for (const e of fired) {
        if (e.actor) { const k = `${e.kind}|${e.actor}`; countBy[k] = (countBy[k] ?? 0) + 1; (yearHist[k] ??= new Array(horizon).fill(0))[h - 1]++; if (!seen.has(k)) { seen.add(k); anyBy[k] = (anyBy[k] ?? 0) + 1; (firstBy[k] ??= new Array(horizon).fill(0))[h - 1]++; } }
        else { const k = `${e.kind}|${pairKey(e.a, e.b)}`; if (!seenD.has(k)) { seenD.add(k); dyadAny[k] = (dyadAny[k] ?? 0) + 1; (firstBy[k] ??= new Array(horizon).fill(0))[h - 1]++; } }
      }
    }
  }
  const norm = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, v / runs]));
  const pAnyWithin = (k, years) => (firstBy[k] ?? []).slice(0, years).reduce((a, b) => a + b, 0) / runs;
  return { runs, horizon, pAny: norm(anyBy), expected: norm(countBy), pAnyDyad: norm(dyadAny), yearHist, pAnyWithin };
}
