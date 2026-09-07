// The modern capability composite and its splice onto CINC — operator / modern-capability (package 10).
//
// CoW NMC ends (7.0: 2022; 3.02: 2001). Past its last year the panel used to carry the last CINC forward, so every
// dyad in the forecast horizon was scored on a capability distribution measured years or decades earlier. This
// module rebuilds CINC's own construction from series that are still published, on the same share-of-system logic,
// and splices the result onto CINC over their overlap so the extension is on CINC's scale rather than its own.
//
// CINC = the unweighted mean of six share-of-system indicators: military expenditure, military personnel, iron and
// steel production, primary energy consumption, total population, urban population. Five of the six have an open
// annual successor in data/raw; the sixth (personnel) does not, and iron and steel is stood in for. Both departures
// are declared in COMPONENTS and reported by the diagnostic, not hidden inside a number.
import { resolveFetch } from './modern.mjs';

/** Years of overlap used to fit each actor's splice factor (the geometric mean of cinc/composite over them). */
export const SPLICE_YEARS = 10;
/** An actor-year needs this many of the components to get a composite share at all. */
export const MIN_COMPONENTS = 3;

export const COMPONENTS = [
  {
    id: 'milex', stands_for: 'milex',
    label: 'Military expenditure, current US$',
    parts: [{ fetch: 'wb', field: 'milex_gdp', transform: 'pct' }, { fetch: 'wb', field: 'gdp_mer' }],
    source: 'World Bank WDI MS.MIL.XPND.GD.ZS × NY.GDP.MKTP.CD (SIPRI military expenditure over WDI GDP)',
  },
  {
    id: 'gdp_ppp', stands_for: 'irst',
    label: 'GDP at PPP',
    parts: [{ fetch: 'wb', field: 'gdp_ppp' }],
    source: 'World Bank WDI NY.GDP.MKTP.PP.CD',
    substitution: 'CINC\'s industrial component is iron and steel production, which no open source still publishes annually for every state; GDP at PPP is the stand-in and it is not the same measurement.',
  },
  {
    id: 'energy', stands_for: 'energy_nmc',
    label: 'Primary energy consumption, TWh',
    parts: [{ fetch: 'owid', field: 'primary_energy_consumption' }],
    source: 'OWID energy (Energy Institute Statistical Review) primary_energy_consumption',
  },
  {
    id: 'tpop', stands_for: 'tpop',
    label: 'Total population',
    parts: [{ fetch: 'wb', field: 'population' }],
    source: 'World Bank WDI SP.POP.TOTL',
  },
  {
    id: 'upop', stands_for: 'upop',
    label: 'Urban population',
    parts: [{ fetch: 'wb', field: 'population' }, { fetch: 'wb', field: 'urban_share', transform: 'pct' }],
    source: 'World Bank WDI SP.POP.TOTL × SP.URB.TOTL.IN.ZS',
  },
];

/** CINC's sixth indicator, with no open annual successor in data/raw — declared, not silently dropped. */
export const MISSING_COMPONENTS = [{
  stands_for: 'milper',
  reason: 'Military personnel. SIPRI publishes expenditure but not personnel; IISS Military Balance is not openly '
    + 'redistributable and the World Bank series (MS.MIL.TOTL.P1) was not reachable when this was built. The '
    + 'composite is therefore a five-indicator mean where CINC is a six-indicator mean; the per-actor splice factor '
    + 'absorbs the level difference, the year-to-year movement of the missing indicator is not represented.',
}];

/**
 * Component levels by actor and year: { componentId: { actorId: { year: level } } }.
 * `idOf(iso3, year)` maps a source's ISO3 code onto an actor id (build-panel's `owid` map); codes it rejects are dropped.
 */
export function componentLevels({ from, to, idOf }) {
  const out = {};
  for (const c of COMPONENTS) {
    const series = c.parts.map(p => resolveFetch(p, { from, to }));
    const byActor = {};
    for (const code of Object.keys(series[0])) {
      for (const ys of Object.keys(series[0][code])) {
        const y = +ys;
        let v = 1;
        for (const s of series) { const x = s[code]?.[y]; if (x == null) { v = null; break; } v *= x; }
        if (v == null || !Number.isFinite(v) || v < 0) continue;
        const id = idOf(code, y); if (!id) continue;
        (byActor[id] ??= {})[y] = (byActor[id][y] ?? 0) + v;   // two source codes onto one actor sum (a union of states)
      }
    }
    out[c.id] = byActor;
  }
  return out;
}

/**
 * The composite share of system capability: { actorId: { year: share } }, plus the per-year component count.
 * Each component is turned into a share of that year's total over the actors that report it (CINC's own
 * construction), and the composite is the unweighted mean of the shares an actor has — so an actor missing one
 * indicator is scored on the rest rather than on a zero.
 */
export function compositeShares({ from, to, idOf, liveAt }) {
  const levels = componentLevels({ from, to, idOf });
  const shares = {};   // actor -> year -> [share...]
  for (const c of COMPONENTS) {
    const byActor = levels[c.id];
    const totals = {};
    for (const [id, years] of Object.entries(byActor)) for (const [y, v] of Object.entries(years)) { if (liveAt && !liveAt(id, +y)) continue; totals[y] = (totals[y] ?? 0) + v; }
    for (const [id, years] of Object.entries(byActor)) for (const [y, v] of Object.entries(years)) {
      if (liveAt && !liveAt(id, +y)) continue;
      if (!totals[y]) continue;
      ((shares[id] ??= {})[y] ??= []).push(v / totals[y]);
    }
  }
  const out = {}, counts = {};
  for (const [id, years] of Object.entries(shares)) for (const [y, xs] of Object.entries(years)) {
    if (xs.length < MIN_COMPONENTS) continue;
    (out[id] ??= {})[+y] = xs.reduce((a, b) => a + b, 0) / xs.length;
    (counts[id] ??= {})[+y] = xs.length;
  }
  return { composite: out, counts };
}

/** Pearson r between two aligned arrays. */
export const pearson = (xs, ys) => {
  const n = xs.length; if (n < 2) return null;
  const mx = xs.reduce((a, b) => a + b, 0) / n, my = ys.reduce((a, b) => a + b, 0) / n;
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) { const a = xs[i] - mx, b = ys[i] - my; sxy += a * b; sxx += a * a; syy += b * b; }
  return sxx && syy ? sxy / Math.sqrt(sxx * syy) : null;
};

/**
 * Splice the composite onto CINC and extend it past CINC's last year.
 *   `cincOf(id, y)` -> CINC or null;  `liveAt(id, y)` -> boolean;  `lastCinc` = last year CINC covers.
 * Per actor the splice factor is the geometric mean of cinc/composite over the last SPLICE_YEARS overlap years it
 * has both in — a level correction, so the extension inherits CINC's scale and the composite supplies the movement.
 * Each extension year is then renormalised to the share mass CINC itself carried in `lastCinc` over the same live
 * set, so the column keeps summing to (approximately) one the way CINC does.
 */
export function spliceComposite({ composite, cincOf, liveAt, lastCinc, extendTo }) {
  const factor = {}, factorN = {};
  for (const [id, years] of Object.entries(composite)) {
    const ratios = [];
    for (let y = lastCinc; y > lastCinc - SPLICE_YEARS; y--) {
      const c = cincOf(id, y), k = years[y];
      if (c != null && c > 0 && k != null && k > 0) ratios.push(Math.log(c / k));
    }
    if (ratios.length) { factor[id] = Math.exp(ratios.reduce((a, b) => a + b, 0) / ratios.length); factorN[id] = ratios.length; }
  }
  // the mass CINC itself carried in its last year, over the live set: the extension is normalised to it
  let mass = 0; for (const id of Object.keys(composite)) { if (!liveAt(id, lastCinc)) continue; const c = cincOf(id, lastCinc); if (c != null) mass += c; }
  const values = {};   // year -> { id: cinc_hat }
  for (let y = lastCinc + 1; y <= extendTo; y++) {
    const raw = {};
    for (const [id, years] of Object.entries(composite)) {
      if (!liveAt(id, y) || factor[id] == null || years[y] == null) continue;
      raw[id] = years[y] * factor[id];
    }
    const tot = Object.values(raw).reduce((a, b) => a + b, 0);
    if (!tot) continue;
    values[y] = Object.fromEntries(Object.entries(raw).map(([id, v]) => [id, v * mass / tot]));
  }
  return { values, factor, factorN, mass };
}

/** Correlation of the composite with CINC over [from, to] — the package's r >= 0.95 test, level and log. */
export function validate({ composite, cincOf, liveAt, from, to }) {
  const xs = [], ys = [], lx = [], ly = [];
  let n = 0;
  for (const [id, years] of Object.entries(composite)) for (const [ys_, k] of Object.entries(years)) {
    const y = +ys_; if (y < from || y > to) continue;
    if (liveAt && !liveAt(id, y)) continue;
    const c = cincOf(id, y); if (c == null) continue;
    n++; xs.push(k); ys.push(c);
    if (k > 0 && c > 0) { lx.push(Math.log(k)); ly.push(Math.log(c)); }
  }
  return { n, r: pearson(xs, ys), r_log: pearson(lx, ly), n_log: lx.length };
}
