// Supranational and regional unions as state (docs/plan-structure.md, "unions"): membership, entry, exit, the
// dissolution of a whole union, and joint membership as a dyad covariate split by depth. The data are data/unions.yaml
// (dated membership, a `depth` per union: deep | customs | political). Nothing here names a country or a union: every
// hazard is POOLED across the unions in the file, which is what gives it events to learn from.
//
// Entry is drawn in two stages, like a breakup (src/engine/membership.js): unions admit in negotiated ROUNDS (the EU's
// 2004 round took ten), so
//   round   P(a union admits anyone in t), per union-year, on log1p(years since its last round) and whether it is a
//           political organisation (they admit states at independence; an economic union negotiates)
//   joiner  P(a candidate joins | a round in t), per candidate, on: electoral democracy (RoW >= 2), democracy x a deep
//           union (the EU's accession criteria; a political organisation has none), log GDP per capita (z within the
//           candidates), contiguous with a member, the share of its region already in, a state born in the last 3 years
// A candidate is a live state, not a member, contiguous with a member or with its capital within 3,000 km of a member's
// (data/capitals.json): Cyprus, Malta, Iceland, the Seychelles are in reach; Canada is not. (The first rule — any state
// in a V-Dem region with three members — had Canada joining the EU in half the runs: V-Dem puts North America with
// Western Europe.) Exits (6 recorded) and dissolutions (2: 1977, 1991) are too few for covariates: each RUN draws its own rates from
// the posteriors Gamma(0.5 + events, exposure) (Jeffreys prior on a Poisson rate), so a forecast carries that
// uncertainty instead of a point rate. All fitted on the record up to as-of.
const sigmoid = (x) => 1 / (1 + Math.exp(-x));
export const UNIONS = { prior_sd: 1, min_rounds: 2, near_km: 3000, new_state_years: 3 };
export const DEPTHS = ['deep', 'customs', 'political'];

export function memberIndex(unions) {
  const list = unions ?? []; const m = new Map(); const meta = {};
  for (const u of list) { m.set(u.id, (u.members ?? []).map(([id, from, to]) => [id, from, to ?? null])); meta[u.id] = { name: u.name, depth: u.depth ?? 'political', founded: u.founded, dissolved: u.dissolved ?? null }; }
  const alive = (u, y) => y >= meta[u].founded && (meta[u].dissolved == null || y < meta[u].dissolved);
  return {
    unions: list.map(u => u.id), meta, alive,
    founded: Object.fromEntries(list.map(u => [u.id, u.founded])),
    isMember: (u, id, y) => alive(u, y) && (m.get(u) ?? []).some(([x, f, t]) => x === id && y >= f && (t == null || y < t)),
    members: (u, y) => (alive(u, y) ? (m.get(u) ?? []).filter(([, f, t]) => y >= f && (t == null || y < t)).map(([x]) => x) : []),
  };
}
/** Joint membership of a pair by depth at year y: { deep, customs, political } as 0/1 (any union of that depth). */
export function jointByDepth(idx, a, b, y) {
  const o = { deep: 0, customs: 0, political: 0 };
  for (const u of idx.unions) if (idx.isMember(u, a, y) && idx.isMember(u, b, y)) o[idx.meta[u].depth] = 1;
  return o;
}

function fitLogit(X, y) {
  const p = X[0].length; let b = new Array(p).fill(0);
  const base = Math.min(0.5, Math.max(1e-6, y.reduce((s, v) => s + v, 0) / y.length)); b[0] = Math.log(base / (1 - base));
  const lam = 1 / UNIONS.prior_sd ** 2;
  for (let it = 0; it < 100; it++) {
    const g = new Array(p).fill(0), H = Array.from({ length: p }, () => new Array(p).fill(0));
    for (let i = 0; i < X.length; i++) { const x = X[i]; let eta = 0; for (let j = 0; j < p; j++) eta += b[j] * x[j]; const mu = sigmoid(eta), w = Math.max(1e-9, mu * (1 - mu)); for (let j = 0; j < p; j++) { g[j] += (y[i] - mu) * x[j]; for (let k = 0; k < p; k++) H[j][k] += w * x[j] * x[k]; } }
    for (let j = 1; j < p; j++) { g[j] -= lam * b[j]; H[j][j] += lam; }
    const A = H.map((r, i) => [...r, g[i]]);
    for (let i = 0; i < p; i++) { let mx = i; for (let r = i + 1; r < p; r++) if (Math.abs(A[r][i]) > Math.abs(A[mx][i])) mx = r; [A[i], A[mx]] = [A[mx], A[i]]; for (let r = i + 1; r < p; r++) { const f = A[r][i] / A[i][i]; for (let c = i; c <= p; c++) A[r][c] -= f * A[i][c]; } }
    const d = new Array(p).fill(0); for (let i = p - 1; i >= 0; i--) { let s = A[i][p]; for (let c = i + 1; c < p; c++) s -= A[i][c] * d[c]; d[i] = s / A[i][i]; }
    // damped: a nearly separated feature (a new state joining a political union at independence) made the undamped
    // Newton step overshoot into the millions on the pooled sample
    const mx = Math.max(...d.map(Math.abs)); const sc = mx > 2 ? 2 / mx : 1;
    b = b.map((v, j) => v + sc * d[j]); if (mx < 1e-8) break;
  }
  return b;
}
const roundX = (s) => [1, Math.log1p(s.since ?? 0), s.depth === 'political' ? 1 : 0];
// tested 2026-10-23 on the EU alone: `waited` (years in the pool as a democracy without joining) as a revealed preference
// to stay out came out +0.82 — Austria, Sweden and Finland waited 37 years and joined — so it is not in the vector
export const joinerX = (s) => [1, s.democracy ? 1 : 0, s.democracy && s.depth === 'deep' ? 1 : 0, s.gdpZ ?? 0, s.contiguous ? 1 : 0, (s.regionShare ?? 0) * 3, s.newState ? 1 : 0];

/** Capital of a state in year y from data/capitals.json spans: [lat, lng] or null. */
export const capitalIndex = (data) => { const c = data?.capitals ?? {}; return (id, y) => { const sp = c[id]; if (!sp) return null; let best = null; for (const [f, t, la, ln] of sp) { if (y >= f && y <= t) return [la, ln]; if (f <= y) best = [la, ln]; } return best ?? (sp[0] ? [sp[0][2], sp[0][3]] : null); }; };
const RAD = Math.PI / 180;
export const kmBetween = (p, q) => { const a = Math.sin((q[0] - p[0]) * RAD / 2) ** 2 + Math.cos(p[0] * RAD) * Math.cos(q[0] * RAD) * Math.sin((q[1] - p[1]) * RAD / 2) ** 2; return 12742 * Math.asin(Math.sqrt(a)); };
/**
 * Candidates of a union in year y: [{ id, democracy, gdpZ, contiguous, regionShare, newState }]. `members` = the union's
 * members; `st(id)` = { live, regime, log_gdp_pc, region, born } for the year; `contig(a, b)` true if contiguous;
 * `cap(id)` = the state's capital [lat, lng] or null.
 */
export function candidates(members, y, ids, st, contig, cap = () => null) {
  const mem = new Set(members); const byRegion = new Map();
  for (const id of ids) { const s = st(id); if (!s?.live || s.region == null) continue; const r = byRegion.get(s.region) ?? byRegion.set(s.region, { n: 0, m: 0 }).get(s.region); r.n++; if (mem.has(id)) r.m++; }
  const out = [];
  for (const id of ids) {
    if (mem.has(id)) continue; const s = st(id); if (!s?.live) continue;
    const contiguous = [...mem].some(m => contig(id, m)); const reg = byRegion.get(s.region);
    const c0 = cap(id); const near = !!c0 && [...mem].some(m => { const c1 = cap(m); return c1 && kmBetween(c0, c1) <= UNIONS.near_km; });
    if (!contiguous && !near) continue;
    out.push({ id, democracy: (s.regime ?? 0) >= 2, lg: s.log_gdp_pc ?? null, contiguous, regionShare: reg ? reg.m / reg.n : 0, newState: s.born != null && y - s.born <= UNIONS.new_state_years });
  }
  const g = out.map(c => c.lg).filter(x => x != null); const mu = g.reduce((a, b) => a + b, 0) / Math.max(1, g.length); const sd = Math.sqrt(g.reduce((a, b) => a + (b - mu) ** 2, 0) / Math.max(1, g.length)) || 1;
  for (const c of out) c.gdpZ = c.lg == null ? 0 : (c.lg - mu) / sd;
  return out;
}

/** Fit the pooled entry model and the exit / dissolution posteriors on the record up to maxYear. */
export function fitUnions({ unions, panel, contiguity, capitals = null }, maxYear) {
  const idx = memberIndex(unions); const capAt = capitalIndex(capitals); const Y0 = panel.meta.y0; const ids = Object.keys(panel.actors);
  let yy = 0; const contig = (a, b) => { const k = a < b ? `${a}|${b}` : `${b}|${a}`; return (contiguity?.[k] ?? []).some?.(([f, t]) => yy >= f && yy <= t) ?? false; };
  const born = (id) => { const i = panel.actors[id]?.live?.findIndex(x => x === 1); return i == null || i < 0 ? null : Y0 + i; };
  const R = { X: [], y: [] }, J = { X: [], y: [] }; const lastRound = {}; let exits = 0, memberYears = 0, dissolutions = 0, unionYears = 0;
  for (const u of idx.unions) {
    const depth = idx.meta[u].depth; lastRound[u] = idx.founded[u];
    for (let y = idx.founded[u] + 1; y <= Math.min(maxYear, panel.meta.y1); y++) {
      if (!idx.alive(u, y - 1)) break;
      unionYears++; if (!idx.alive(u, y)) { dissolutions++; break; }
      yy = y - 1; const i = y - Y0;
      const st = (id) => { const a = panel.actors[id]; return { live: a.live?.[i - 1] === 1 || a.live?.[i] === 1, regime: a.regime?.[i - 1] ?? a.regime?.[i], log_gdp_pc: a.log_gdp_pc?.[i - 1] ?? a.log_gdp_pc?.[i], region: a.region_pol?.[i - 1] ?? a.region_pol?.[i], born: born(id) }; };
      const cands = candidates(idx.members(u, y - 1), y, ids, st, contig, (id) => capAt(id, y - 1));
      const joined = new Set(cands.filter(c => idx.isMember(u, c.id, y)).map(c => c.id));
      R.X.push(roundX({ since: y - lastRound[u], depth })); R.y.push(joined.size ? 1 : 0);
      if (joined.size) { for (const c of cands) { J.X.push(joinerX({ ...c, depth })); J.y.push(joined.has(c.id) ? 1 : 0); } lastRound[u] = y; }
      for (const m of idx.members(u, y - 1)) { memberYears++; if (!idx.isMember(u, m, y) && panel.actors[m]?.live?.[i]) exits++; }
    }
  }
  const nR = R.y.reduce((a, b) => a + b, 0);
  return {
    idx,
    fit: {
      trained_through: maxYear, lastRound,
      round: nR >= UNIONS.min_rounds ? { status: 'fitted', beta: fitLogit(R.X, R.y), events: nR, n: R.y.length } : { status: 'unfitted', events: nR },
      joiner: J.y.length ? { status: 'fitted', beta: fitLogit(J.X, J.y), events: J.y.reduce((a, b) => a + b, 0), n: J.y.length } : { status: 'unfitted' },
      exit: { shape: 0.5 + exits, rate: Math.max(1, memberYears), events: exits, exposure: memberYears },
      dissolve: { shape: 0.5 + dissolutions, rate: Math.max(1, unionYears), events: dissolutions, exposure: unionYears },
    },
  };
}
const hz = (f, x) => { if (f?.status !== 'fitted') return null; let eta = 0; for (let j = 0; j < x.length; j++) eta += f.beta[j] * x[j]; return sigmoid(eta); };
export const roundHazard = (f, since, depth) => hz(f?.round, roundX({ since, depth }));
export const joinerHazard = (f, c) => hz(f?.joiner, joinerX(c));
