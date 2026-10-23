// The fork scorer (docs/plan-structure.md A4): a forecast frame set graded against the record's frame set over the
// same years, generically by variable kind. It reads both through src/contract/read.js and knows nothing about the
// engine: any variable in the registry that both providers carry is scored, and a new variable is scored the day it is
// added to the registry.
//
//   binary        Brier per lead year and pooled, with base-rate skill 1 - brier / p(1-p)
//   categorical   multi-class Brier against the marginal of the scored rows; ordered levels also as the cumulative
//                 binaries "level >= l" (intrastate >= 1 and >= 2 are the old occupancy rows by name)
//   continuous    Spearman rank of the median against the truth at lead 10 and 20, the pinball (quantile) loss over
//                 p10/p50/p90 — a three-point approximation of CRPS — and the share of truths inside [p10, p90]
//   records       status as multi-class, plus the domain binaries the registry's record kinds imply (impaired
//                 corridor/chokepoint, unsettled territory)
//
// The unit set is the record's: every actor live in the record that year with an observed value, every pair of such
// actors, every record in force. A unit the forecast does not carry is scored at P = 0 (binary) — silence is a miss,
// not a pass — and is skipped for continuous variables, where there is no zero to stand in.
import { distAt, rawAt, liveAt, covered, idsOf } from './read.js';

const IMPAIRED = ['closed', 'contested'];
const pairKey = (a, b) => (a < b ? `${a}|${b}` : `${b}|${a}`);

export function acc() { return { n: 0, brier: 0, p: 0, obs: 0 }; }
export function accAdd(a, p, y) { a.n++; a.brier += (p - y) ** 2; a.p += p; a.obs += y; }
export function accStat(a, extra = {}) {
  if (!a.n) return { n: 0, ...extra };
  const brier = a.brier / a.n, base = a.obs / a.n, bb = base * (1 - base);
  return { n: a.n, expected: +a.p.toFixed(2), observed: a.obs, exp_obs: a.obs ? +(a.p / a.obs).toFixed(3) : null, brier: +brier.toFixed(5), base_rate: +base.toFixed(5), brier_base: +bb.toFixed(5), skill: bb > 0 ? +(1 - brier / bb).toFixed(4) : null, ...extra };
}
/** Multi-class Brier over rows {k, dist, actual}: sum_c (p_c - 1{c = actual})^2, against the rows' own marginal. */
export function mcBrier(rows, horizon) {
  if (!rows.length) return { n: 0 };
  const cnt = {}; for (const r of rows) cnt[r.actual] = (cnt[r.actual] ?? 0) + 1;
  const q = Object.fromEntries(Object.entries(cnt).map(([c, n]) => [c, n / rows.length]));
  const cats = new Set(Object.keys(q)); for (const r of rows) for (const c of Object.keys(r.dist)) cats.add(c);
  const sq = (r) => { let s = 0; for (const c of cats) s += ((r.dist[c] ?? 0) - (c === String(r.actual) ? 1 : 0)) ** 2; return s; };
  let s = 0; for (const r of rows) s += sq(r);
  const brier = s / rows.length, base = [...cats].reduce((t, c) => t + (q[c] ?? 0) * (1 - (q[c] ?? 0)), 0);
  const byLead = []; for (let k = 1; k <= horizon; k++) { const rs = rows.filter(r => r.k === k); if (!rs.length) continue; byLead.push({ k, n: rs.length, brier: +(rs.reduce((t, r) => t + sq(r), 0) / rs.length).toFixed(5) }); }
  return { n: rows.length, brier: +brier.toFixed(5), brier_base: +base.toFixed(5), skill: base > 0 ? +(1 - brier / base).toFixed(4) : null, classes: cats.size, marginal: Object.fromEntries(Object.entries(q).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([c, v]) => [c, +v.toFixed(3)])), by_lead: byLead };
}
/** Spearman rank correlation over [[x, y]] pairs; null under 5 pairs. */
export function spearman(pairs) {
  if (pairs.length < 5) return null;
  const rank = (get) => { const idx = pairs.map((_, i) => i).sort((a, b) => get(pairs[a]) - get(pairs[b])); const r = new Array(pairs.length); for (let i = 0; i < idx.length;) { let j = i; while (j < idx.length && get(pairs[idx[j]]) === get(pairs[idx[i]])) j++; const avg = (i + j - 1) / 2; for (let k = i; k < j; k++) r[idx[k]] = avg; i = j; } return r; };
  const rx = rank(p => p[0]), ry = rank(p => p[1]); const n = pairs.length;
  const mx = rx.reduce((s, x) => s + x, 0) / n, my = ry.reduce((s, x) => s + x, 0) / n;
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) { const a = rx[i] - mx, b = ry[i] - my; sxy += a * b; sxx += a * a; syy += b * b; }
  return sxx && syy ? +(sxy / Math.sqrt(sxx * syy)).toFixed(3) : null;
}
const pinball = (q, x) => { const taus = [0.1, 0.5, 0.9]; let s = 0; for (let i = 0; i < 3; i++) { const u = x - q[i]; s += u >= 0 ? taus[i] * u : (taus[i] - 1) * u; } return (2 * s) / 3; };

/**
 * Score one fork. `truth` is the record's frame set, `model` the forecast's; lead k = 1 is the year model.meta.from.
 * Returns raw material (accumulators and rows) so a caller can pool across origins; `report()` turns it into numbers.
 */
export function scoreFork(truth, model, { horizon = model.meta.years, actorIds = null } = {}) {
  const from = model.meta.from; const out = { binary: {}, multiclass: {}, continuous: {}, horizon };
  const bin = (name, k, p, y) => { const a = out.binary[name] ??= { lead: Array.from({ length: horizon }, acc), all: acc() }; accAdd(a.lead[k - 1], p, y); accAdd(a.all, p, y); };
  const mc = (name, row) => (out.multiclass[name] ??= []).push(row);
  const cont = (name, row) => (out.continuous[name] ??= []).push(row);
  const vars = Object.entries(truth.meta.vars ?? {}).filter(([key]) => model.meta.vars?.[key]);
  const truthActors = actorIds ?? idsOf(truth, 'actor');
  for (let k = 1; k <= horizon; k++) {
    const y = from + k - 1;
    const live = truthActors.filter(id => liveAt(truth, id, y) > 0);
    for (const [key, vm] of vars) {
      const [entity, v] = key.split(':'); if (!covered(truth, key, y)) continue;
      if (entity === 'actor') {
        if (v === 'live') continue;
        for (const id of live) {
          const t = distAt(truth, 'actor', id, v, y); if (!t) continue;
          const m = liveAt(model, id, y) > 0 ? distAt(model, 'actor', id, v, y) : null;
          if (vm.kind === 'binary') bin(v, k, m?.p ?? 0, t.p);
          else if (vm.kind === 'categorical' && vm.levels) {
            const actual = t.level; const d = m?.dist ?? null;
            if (d) mc(`${v}_multiclass`, { k, dist: Object.fromEntries(d.map((p, l) => [String(vm.levels[l]), p])), actual: String(vm.levels[actual]) });
            for (let l = 1; l < vm.levels.length; l++) { const name = v === 'intrastate' ? (l === 1 ? 'intrastate' : l === 2 ? 'intrastate_war' : `intrastate_ge${l}`) : `${v}_ge${l}`; bin(name, k, d ? d.slice(l).reduce((s, p) => s + p, 0) : 0, actual >= l ? 1 : 0); }
          } else if (vm.kind === 'continuous') { if (m?.q) cont(v, { k, id, q: m.q, x: t.q[1] }); }
        }
      } else if (entity === 'dyad') {
        const name = v === 'at_war' ? 'dyad_at_war' : `dyad_${v}`;
        for (let i = 0; i < live.length; i++) for (let j = i + 1; j < live.length; j++) {
          const pk = pairKey(live[i], live[j]);
          bin(name, k, rawAt(model, 'dyad', pk, v, y) ?? 0, rawAt(truth, 'dyad', pk, v, y) ? 1 : 0);
        }
      } else if (entity === 'record') {
        // the units are the records the FORECAST carries (a record whose history opens inside the horizon is not a
        // unit the forecaster holds — scripts/backtest.mjs reports those separately), scored where the record has a status
        for (const id of idsOf(model, 'record')) {
          const m = distAt(model, 'record', id, v, y); const t = rawAt(truth, 'record', id, v, y); if (!m || t == null) continue;
          const terr = (model.records[id].kind ?? truth.records?.[id]?.kind) === 'territory';
          mc(terr ? 'territory_status_multiclass' : 'record_status_multiclass', { k, dist: m.dist, actual: t });
          if (terr) bin('territory_unsettled', k, 1 - (m.dist.settled ?? 0), t === 'settled' ? 0 : 1);
          else bin('record_impaired', k, IMPAIRED.reduce((s, c) => s + (m.dist[c] ?? 0), 0), IMPAIRED.includes(t) ? 1 : 0);
        }
      } else if (entity === 'world') {
        const t = distAt(truth, 'world', '_', v, y), m = distAt(model, 'world', '_', v, y); if (!t || !m) continue;
        if (vm.kind === 'categorical') mc(`world_${v}`, { k, dist: Array.isArray(m.dist) ? Object.fromEntries(m.dist.map((p, l) => [String(vm.levels[l]), p])) : m.dist, actual: vm.levels ? String(vm.levels[t.level]) : t.level });
        else if (vm.kind === 'continuous') cont(`world_${v}`, { k, id: '_', q: m.q, x: t.q[1] });
      }
    }
  }
  return out;
}

/** Pool raw score material from several forks (same variable names). */
export function pool(into, s) {
  into.horizon = Math.max(into.horizon ?? 0, s.horizon);
  for (const [name, a] of Object.entries(s.binary)) {
    const g = (into.binary ??= {})[name] ??= { lead: [], all: acc() };
    a.lead.forEach((x, i) => { const t = g.lead[i] ??= acc(); t.n += x.n; t.brier += x.brier; t.p += x.p; t.obs += x.obs; });
    g.all.n += a.all.n; g.all.brier += a.all.brier; g.all.p += a.all.p; g.all.obs += a.all.obs;
  }
  for (const [name, rows] of Object.entries(s.multiclass)) ((into.multiclass ??= {})[name] ??= []).push(...rows);
  for (const [name, rows] of Object.entries(s.continuous)) ((into.continuous ??= {})[name] ??= []).push(...rows);
  return into;
}

/** Numbers from raw score material. */
export function report(s, { notes = {}, coverage = {} } = {}) {
  const H = s.horizon; const vars = {};
  for (const [name, a] of Object.entries(s.binary ?? {})) vars[name] = { ...accStat(a.all, { coverage: coverage[name] ?? null, note: notes[name] }), by_lead: a.lead.map((x, i) => accStat(x, { k: i + 1 })).filter(x => x.n) };
  for (const [name, rows] of Object.entries(s.multiclass ?? {})) vars[name] = { ...mcBrier(rows, H), note: notes[name] };
  const continuous = {};
  for (const [name, rows] of Object.entries(s.continuous ?? {})) {
    const rank = {}; for (const k of [10, 20]) { const ps = rows.filter(r => r.k === k).map(r => [r.q[1], r.x]); if (ps.length) rank[`k${k}`] = { n: ps.length, spearman: spearman(ps) }; }
    const inBand = rows.filter(r => r.x >= r.q[0] && r.x <= r.q[2]).length;
    const scale = rows.reduce((t, r) => t + Math.abs(r.x), 0) / Math.max(1, rows.length);
    continuous[name] = { n: rows.length, rank, coverage_p10_p90: rows.length ? +(inBand / rows.length).toFixed(3) : null, pinball: rows.length ? +(rows.reduce((t, r) => t + pinball(r.q, r.x), 0) / rows.length).toPrecision(4) : null, pinball_rel: rows.length && scale ? +(rows.reduce((t, r) => t + pinball(r.q, r.x), 0) / rows.length / scale).toFixed(4) : null };
  }
  return { vars, continuous };
}
