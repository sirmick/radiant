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

/** An actor whose splice factor is further than this from 1 is not extended from the composite: the factor has
 *  stopped being a level correction and has become a fabricated constant standing in for the missing personnel
 *  indicator (era-1991-2026-r2/statistics-7 — PRK 5.07, ERI 9.75). Its last CINC is carried instead, with the
 *  staleness recorded. */
export const MAX_LOG_FACTOR = Math.LN2;

/**
 * Splice the composite onto CINC and extend it past CINC's last year.
 *   `cincOf(id, y)` -> CINC or null;  `liveAt(id, y)` -> boolean;  `lastCinc` = last year CINC covers.
 * Per actor the splice factor is the geometric mean of cinc/composite over the last SPLICE_YEARS overlap years it
 * has both in — a level correction, so the extension inherits CINC's scale and the composite supplies the movement.
 *
 * Two rules make the extension honest about what it does not know (era-1991-2026-r2/data-3, statistics-7):
 *
 *  - An actor live in the extension year that has no composite share for it (MIN_COMPONENTS of five World Bank /
 *    OWID series, which the Bank does not publish for sanctioned or unrecognised states) does NOT vanish. Eleven
 *    live actors lost their 2024 value that way — PRK (CINC rank 12 in 2022, above Germany's), TWN (which the
 *    World Bank does not cover at all, so it has no composite in any year — pass `ids` to reach it), SYR, YEM, ERI,
 *    SSD, CUB, KOSOVO and three European microstates — and a null capability for them at the live forecast origin
 *    is worse than a stale one. Their last CINC-scale value is carried and `carried[id]` records how many years
 *    back it was measured, which is the panel's existing staleness convention.
 *  - An actor whose |log factor| exceeds MAX_LOG_FACTOR is carried the same way rather than extended: at that size
 *    the factor is no longer correcting a level, it is standing in for the whole missing personnel indicator.
 *
 * The normalisation is then per year over THE ACTORS PRESENT IN THAT YEAR, not over `lastCinc`'s live set. Holding
 * the total at the old mass while the membership shrank silently redistributed the ~3.1% of world capability the
 * 2024 dropouts held over everyone who survived, inflating every remaining actor's share.
 */
export function spliceComposite({ composite, cincOf, liveAt, lastCinc, extendTo, ids = null }) {
  const factor = {}, factorN = {};
  for (const [id, years] of Object.entries(composite)) {
    const ratios = [];
    for (let y = lastCinc; y > lastCinc - SPLICE_YEARS; y--) {
      const c = cincOf(id, y), k = years[y];
      if (c != null && c > 0 && k != null && k > 0) ratios.push(Math.log(c / k));
    }
    if (ratios.length) { factor[id] = Math.exp(ratios.reduce((a, b) => a + b, 0) / ratios.length); factorN[id] = ratios.length; }
  }
  const refused = Object.keys(factor).filter(id => Math.abs(Math.log(factor[id])) > MAX_LOG_FACTOR).sort();
  // the last CINC each actor was actually measured at, and the year of it — the source of every carried value
  const lastObs = {};
  for (const id of new Set(ids ?? [...Object.keys(composite), ...Object.keys(factor)])) {
    for (let y = lastCinc; y > lastCinc - 40; y--) { const c = cincOf(id, y); if (c != null && c > 0) { lastObs[id] = { v: c, y }; break; } }
  }
  const values = {}, carried = {}, extendedIds = {};   // year -> { id: cinc_hat } / { id: years since measured }
  for (let y = lastCinc + 1; y <= extendTo; y++) {
    const raw = {}, carry = {};
    for (const id of Object.keys(lastObs)) {
      if (!liveAt(id, y)) continue;
      const k = composite[id]?.[y];
      if (k != null && factor[id] != null && !refused.includes(id)) raw[id] = k * factor[id];
      else carry[id] = lastObs[id];
    }
    const tot = Object.values(raw).reduce((a, b) => a + b, 0);
    if (!tot) continue;
    // the mass CINC carried at `lastCinc` over exactly the actors being extended this year
    let mass = 0; for (const id of Object.keys(raw)) { const c = cincOf(id, lastCinc); if (c != null) mass += c; }
    if (!(mass > 0)) continue;
    values[y] = Object.fromEntries(Object.entries(raw).map(([id, v]) => [id, v * mass / tot]));
    carried[y] = {};
    for (const [id, o] of Object.entries(carry)) { values[y][id] = o.v; carried[y][id] = y - o.y; }
    extendedIds[y] = Object.keys(raw).length;
  }
  return { values, carried, extended: extendedIds, refused, factor, factorN };
}

/** Spearman rank correlation: Pearson on midrank-transformed values. */
export const spearman = (xs, ys) => {
  const rank = (v) => { const idx = v.map((x, i) => [x, i]).sort((a, b) => a[0] - b[0]); const r = new Array(v.length);
    for (let i = 0; i < idx.length;) { let j = i; while (j < idx.length && idx[j][0] === idx[i][0]) j++; const m = (i + j + 1) / 2; for (let k = i; k < j; k++) r[idx[k][1]] = m; i = j; } return r; };
  return pearson(rank(xs), rank(ys));
};

/**
 * Correlation of the composite with CINC over [from, to] — the package's r >= 0.95 test, level and log — plus the
 * statistic the extension is actually used for.
 *
 * era-1991-2026-r2/statistics-7: the acceptance test was a POOLED PEARSON ON LEVELS, which is dominated by CHN and
 * USA and returns r >= 0.95 while the ranking disagrees by forty places. The composite drops CINC's military
 * personnel indicator (declared in MISSING_COMPONENTS) and stands GDP at PPP in for iron and steel, so it moves
 * conscript-heavy poor states down and small rich states up: at 2022, PRK is CINC rank 12 and composite rank 55,
 * ERI 46 against 145, while IRL rises 122 -> 78 and CHE 85 -> 59. `rho` (Spearman) and `rank_shift_top20` (the
 * largest displacement among CINC's own top 20) are computed per year on the actors both series score, and the
 * worst year of each is reported so the substitution's direction is on the record rather than discovered later.
 */
export function validate({ composite, cincOf, liveAt, from, to }) {
  const xs = [], ys = [], lx = [], ly = [];
  let n = 0;
  const byYear = {};
  for (const [id, years] of Object.entries(composite)) for (const [ys_, k] of Object.entries(years)) {
    const y = +ys_; if (y < from || y > to) continue;
    if (liveAt && !liveAt(id, y)) continue;
    const c = cincOf(id, y); if (c == null) continue;
    n++; xs.push(k); ys.push(c);
    (byYear[y] ??= []).push([id, k, c]);
    if (k > 0 && c > 0) { lx.push(Math.log(k)); ly.push(Math.log(c)); }
  }
  let rhoMin = null, rhoMinYear = null, shiftMax = 0, shiftWho = null, shiftYear = null;
  for (const [y, rows] of Object.entries(byYear)) {
    if (rows.length < 20) continue;
    const rho = spearman(rows.map(r => r[1]), rows.map(r => r[2]));
    if (rho != null && (rhoMin == null || rho < rhoMin)) { rhoMin = rho; rhoMinYear = +y; }
    const byCinc = [...rows].sort((a, b) => b[2] - a[2]).map(r => r[0]);
    const byComp = [...rows].sort((a, b) => b[1] - a[1]).map(r => r[0]);
    const pos = new Map(byComp.map((id, i) => [id, i + 1]));
    for (let i = 0; i < Math.min(20, byCinc.length); i++) {
      const d = Math.abs(pos.get(byCinc[i]) - (i + 1));
      if (d > shiftMax) { shiftMax = d; shiftWho = byCinc[i]; shiftYear = +y; }
    }
  }
  return { n, r: pearson(xs, ys), r_log: pearson(lx, ly), n_log: lx.length,
    rho_min: rhoMin, rho_min_year: rhoMinYear, rank_shift_top20: shiftMax, rank_shift_actor: shiftWho, rank_shift_year: shiftYear };
}
