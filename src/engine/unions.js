// Supranational unions as state (docs/plan-structure.md, "unions"): membership, entry and exit, and joint membership
// as a dyad covariate. The data are data/unions.yaml (dated membership). Nothing here names a country.
//
// Entry is drawn in two stages, like a breakup (src/engine/membership.js): enlargement comes in negotiated ROUNDS
// (1973, 1981, 1986, 1995, 2004, 2007, 2013 — ten states in 2004), so
//   round   P(the union admits anyone in t), per union-year, on log1p(years since its last round)
//   joiner  P(a candidate joins | a round in t), per candidate, on: electoral democracy (RoW >= 2), log GDP per capita
//           (z within the candidates), contiguous with a member, the share of its region's states already members
// A candidate is a live state, not a member, contiguous with a member or in a V-Dem region where at least three
// members are. Exit has one recorded event (2020), too few for any covariate: each RUN draws its own exit rate from the
// posterior Gamma(0.5 + exits, member-years) (Jeffreys prior on a Poisson rate), so a forecast carries the uncertainty
// of n = 1 instead of a point rate. Both fitted on the record up to as-of.
const sigmoid = (x) => 1 / (1 + Math.exp(-x));
export const UNIONS = { prior_sd: 1, min_rounds: 2, region_min: 3 };

export function memberIndex(unions) {
  const m = new Map();   // union id -> [[id, from, to]]
  for (const u of unions ?? []) m.set(u.id, (u.members ?? []).map(([id, from, to]) => [id, from, to ?? null]));
  return {
    unions: (unions ?? []).map(u => u.id),
    founded: Object.fromEntries((unions ?? []).map(u => [u.id, u.founded])),
    isMember: (u, id, y) => (m.get(u) ?? []).some(([x, f, t]) => x === id && y >= f && (t == null || y < t)),
    members: (u, y) => (m.get(u) ?? []).filter(([, f, t]) => y >= f && (t == null || y < t)).map(([x]) => x),
    spells: (u) => m.get(u) ?? [],
  };
}

function fitLogit(X, y) {
  const p = X[0].length; let b = new Array(p).fill(0);
  const base = Math.min(0.5, Math.max(1e-6, y.reduce((s, v) => s + v, 0) / y.length)); b[0] = Math.log(base / (1 - base));
  const lam = 1 / UNIONS.prior_sd ** 2;
  for (let it = 0; it < 40; it++) {
    const g = new Array(p).fill(0), H = Array.from({ length: p }, () => new Array(p).fill(0));
    for (let i = 0; i < X.length; i++) { const x = X[i]; let eta = 0; for (let j = 0; j < p; j++) eta += b[j] * x[j]; const mu = sigmoid(eta), w = Math.max(1e-9, mu * (1 - mu)); for (let j = 0; j < p; j++) { g[j] += (y[i] - mu) * x[j]; for (let k = 0; k < p; k++) H[j][k] += w * x[j] * x[k]; } }
    for (let j = 1; j < p; j++) { g[j] -= lam * b[j]; H[j][j] += lam; }
    const A = H.map((r, i) => [...r, g[i]]);
    for (let i = 0; i < p; i++) { let mx = i; for (let r = i + 1; r < p; r++) if (Math.abs(A[r][i]) > Math.abs(A[mx][i])) mx = r; [A[i], A[mx]] = [A[mx], A[i]]; for (let r = i + 1; r < p; r++) { const f = A[r][i] / A[i][i]; for (let c = i; c <= p; c++) A[r][c] -= f * A[i][c]; } }
    const d = new Array(p).fill(0); for (let i = p - 1; i >= 0; i--) { let s = A[i][p]; for (let c = i + 1; c < p; c++) s -= A[i][c] * d[c]; d[i] = s / A[i][i]; }
    b = b.map((v, j) => v + d[j]); if (Math.max(...d.map(Math.abs)) < 1e-8) break;
  }
  return b;
}
const roundX = (s) => [1, Math.log1p(s.since ?? 0)];
// tested 2026-10-23: `waited` (years in the pool as a democracy without joining) as a revealed preference to stay out
// came out +0.82 — Austria, Sweden and Finland waited 37 years and joined — so it is not in the vector, and a state that
// has stayed out by choice (Norway, Switzerland) reads like any eligible democracy: a stated limitation.
export const joinerX = (s) => [1, s.democracy ? 1 : 0, s.gdpZ ?? 0, s.contiguous ? 1 : 0, (s.regionShare ?? 0) * 3];

/**
 * Candidates of union u in year y: [{ id, democracy, gdpZ, contiguous, regionShare }]. `st(id)` = { live, regime,
 * log_gdp_pc, region } for the year; `contig(a, b)` true if contiguous; `ids` = the states to consider.
 */
export function candidates(idx, u, y, ids, st, contig) {
  const mem = new Set(idx.members(u, y)); const byRegion = new Map();
  for (const id of ids) { const s = st(id); if (!s?.live || s.region == null) continue; const r = byRegion.get(s.region) ?? byRegion.set(s.region, { n: 0, m: 0 }).get(s.region); r.n++; if (mem.has(id)) r.m++; }
  const out = [];
  for (const id of ids) {
    if (mem.has(id)) continue; const s = st(id); if (!s?.live) continue;
    const contiguous = [...mem].some(m => contig(id, m)); const reg = byRegion.get(s.region);
    if (!contiguous && !(reg && reg.m >= UNIONS.region_min)) continue;
    out.push({ id, democracy: (s.regime ?? 0) >= 2, lg: s.log_gdp_pc ?? null, contiguous, regionShare: reg ? reg.m / reg.n : 0 });
  }
  const g = out.map(c => c.lg).filter(x => x != null); const mu = g.reduce((a, b) => a + b, 0) / Math.max(1, g.length); const sd = Math.sqrt(g.reduce((a, b) => a + (b - mu) ** 2, 0) / Math.max(1, g.length)) || 1;
  for (const c of out) c.gdpZ = c.lg == null ? 0 : (c.lg - mu) / sd;
  return out;
}

/** Fit entry (rounds, joiners) and the exit posterior on the record up to maxYear. */
export function fitUnions({ unions, panel, contiguity }, maxYear) {
  const idx = memberIndex(unions); const Y0 = panel.meta.y0; const ids = Object.keys(panel.actors);
  const contig = (a, b) => { const k = a < b ? `${a}|${b}` : `${b}|${a}`; return (contiguity?.[k] ?? []).some?.(([f, t]) => yy >= f && yy <= t) ?? false; };
  let yy = 0;
  const out = {};
  for (const u of idx.unions) {
    const R = { X: [], y: [] }, J = { X: [], y: [] }; let lastRound = idx.founded[u]; let exits = 0, memberYears = 0; const waited = new Map();
    for (let y = idx.founded[u] + 1; y <= Math.min(maxYear, panel.meta.y1); y++) {
      yy = y - 1; const i = y - Y0;
      const st = (id) => { const a = panel.actors[id]; return { live: a.live?.[i - 1] === 1, regime: a.regime?.[i - 1], log_gdp_pc: a.log_gdp_pc?.[i - 1], region: a.region_pol?.[i - 1] }; };
      const cands = candidates(idx, u, y - 1, ids, st, contig); for (const c of cands) c.waited = waited.get(c.id) ?? 0;
      const joined = new Set(cands.filter(c => idx.isMember(u, c.id, y)).map(c => c.id));
      R.X.push(roundX({ since: y - lastRound })); R.y.push(joined.size ? 1 : 0);
      if (joined.size) { for (const c of cands) { J.X.push(joinerX(c)); J.y.push(joined.has(c.id) ? 1 : 0); } lastRound = y; }
      for (const c of cands) if (c.democracy && !joined.has(c.id)) waited.set(c.id, (waited.get(c.id) ?? 0) + 1);
      for (const m of idx.members(u, y - 1)) { memberYears++; if (!idx.isMember(u, m, y) && panel.actors[m]?.live?.[i]) exits++; }
    }
    const nR = R.y.reduce((a, b) => a + b, 0);
    out[u] = {
      trained_through: maxYear, lastRound,
      round: nR >= UNIONS.min_rounds ? { status: 'fitted', beta: fitLogit(R.X, R.y), events: nR, n: R.y.length } : { status: 'unfitted', events: nR },
      joiner: J.y.length ? { status: 'fitted', beta: fitLogit(J.X, J.y), events: J.y.reduce((a, b) => a + b, 0), n: J.y.length } : { status: 'unfitted' },
      exit: { shape: 0.5 + exits, rate: Math.max(1, memberYears), exits, memberYears },
    };
  }
  return { idx, fits: out };
}
const hz = (f, x) => { if (f?.status !== 'fitted') return null; let eta = 0; for (let j = 0; j < x.length; j++) eta += f.beta[j] * x[j]; return sigmoid(eta); };
export const roundHazard = (f, since) => hz(f?.round, roundX({ since }));
export const joinerHazard = (f, c) => hz(f?.joiner, joinerX(c));
