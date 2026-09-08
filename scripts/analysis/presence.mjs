// operator/presence — the diagnostics the package's test asks for. Prints, never asserts.
//   1. the layer itself: records, powers, hosts, and the ordinal levels against the measured US troop series
//   2. the named falsifiers: the presence/withdrawal state around Iran 1979, Vietnam 1973-75, Suez 1956,
//      Subic 1992 -> Mischief Reef 1995, Aden 1967
//   3. where the guarantor terms are non-zero over time (an era-bound term the backtest window cannot see is worth
//      knowing about before it is promoted)
//   4. the guarantor ablation at several holdout splits — one split with 7 holdout events is not a result
//   5. the direction check on the 2026 state: with guarantor_withdrawal firing, does the closure hazard rise?
// Run: node scripts/analysis/presence.mjs
import { readFileSync } from 'node:fs';
import { Y } from '../lib/hist.mjs';
import { createFitter, loadFitInputs, predict } from '../lib/fit.mjs';
import { corridorFirstYear, corridorStateAt, corridorTransits, corridorTransitionYears, corridorFeatures } from '../../src/engine/core.js';
import { PRESENCE, presenceIndex, powerLevel, hostLevel, lastFall, guarantorLevel, guarantorFall } from '../../src/engine/presence.js';

const inputs = loadFitInputs();
const { panel, templates, presence, corridors } = inputs;
const Y0 = panel.meta.y0;
const index = presenceIndex(presence, { y0: Y0, y1: Math.max(panel.meta.y1, PRESENCE.covers[1]) });

console.log(`\n=== 1. the layer ===`);
console.log(`${presence.length} records, ${index.powers.length} powers, ${index.byHost.size} hosts; per-power columns for ${index.columnPowers.join(' ')} (>= ${PRESENCE.min_hosts} distinct land hosts)`);
console.log(`levels: ${JSON.stringify(index.hostCount)}`);
{   // the hand-coded ordinal against the measured series
  const b = new Map();
  for (const [id, v] of Object.entries(panel.actors)) (v.presence_USA ?? []).forEach((L, i) => {
    const t = v.troops_usa_host?.[i]; if (L == null || t == null) return;
    const k = b.get(L) ?? b.set(L, []).get(L); k.push(t);
  });
  for (const [L, xs] of [...b].sort((x, y) => x[0] - y[0])) {
    xs.sort((p, q) => p - q);
    console.log(`  presence_USA = ${L}: n=${xs.length} troops median ${xs[Math.floor(xs.length / 2)]} p10 ${xs[Math.floor(xs.length * 0.1)]} p90 ${xs[Math.floor(xs.length * 0.9)]}`);
  }
}

console.log(`\n=== 2. the named falsifiers (host, years around the case) ===`);
const show = (host, ys, powers) => {
  for (const y of ys) {
    const per = powers.map(p => `${p}=${powerLevel(index, host, p, y)}`).join(' ');
    console.log(`  ${host} ${y}: any=${hostLevel(index, host, y)} ${per} withdrawal=${lastFall(index, host, y) != null ? `1 (fell ${lastFall(index, host, y)})` : 0}`);
  }
};
show('IRN', [1977, 1978, 1979, 1980], ['USA', 'RUS']);
show('VNM', [1972, 1973, 1974, 1975, 1976], ['USA', 'RUS', 'FRA']);
show('EGY', [1954, 1955, 1956, 1957], ['GBR', 'RUS']);
show('PHL', [1991, 1992, 1993, 1994, 1995], ['USA']);
show('YEM', [1966, 1967, 1968], ['GBR']);

console.log(`\n=== 2b. the same cases as the corridor layer sees them ===`);
const look = (y) => ({
  year: y,   // diagnostics only: past the panel's last year the actor state is read from that last year
  i: Math.min(y, panel.meta.y1) - Y0,
  live: (id) => panel.actors[id]?.live?.[Math.min(y, panel.meta.y1) - Y0] === 1,
  atWar: (id) => panel.actors[id]?.at_war?.[Math.min(y, panel.meta.y1) - Y0] ?? null,
  intrastate: (id) => panel.actors[id]?.intrastate?.[Math.min(y, panel.meta.y1) - Y0] ?? null,
  gdpGrowth: (id) => panel.actors[id]?.gdp_growth?.[Math.min(y, panel.meta.y1) - Y0] ?? null,
  greatPower: (id) => panel.actors[id]?.great_power?.[Math.min(y, panel.meta.y1) - Y0] ?? null,
  successor: (id) => inputs.successors[id] ?? null,
  guarantor: (rec, T) => ({ level: guarantorLevel(index, rec, T, y), fall: guarantorFall(index, rec, T, y) }),
});
const recOf = (id) => corridors.find(r => r.id === id);
const trace = (id, ys) => {
  const rec = recOf(id); if (!rec) return console.log(`  ${id}: no record`);
  for (const y of ys) {
    const st = corridorStateAt(rec, y - 1) ?? corridorStateAt(rec, y);
    const f = corridorFeatures(rec, st, look(y));
    const trans = corridorTransitionYears(rec, y, y).has(y);
    console.log(`  ${id} ${y}: status ${st?.status}/${st?.controller ?? '—'} guarantor=${f.guarantor_presence} withdrawal=${f.guarantor_withdrawal} war=${f.adjacent_war}${trans ? '   <-- TRANSITION' : ''}`);
  }
};
trace('suez', [1954, 1955, 1956, 1957, 1958]);
trace('hormuz', [2022, 2023, 2024, 2025]);
trace('bab_al_mandab', [2021, 2022, 2023, 2024, 2025]);

console.log(`\n=== 3. where the guarantor terms are non-zero, by decade (chokepoint-years) ===`);
{
  const t = templates.find(x => x.id === 'chokepoint_status');
  const by = new Map();
  for (const rec of corridors) {
    if (rec.kind !== 'chokepoint') continue;
    const first = corridorFirstYear(rec, t.window[0]); if (first == null) continue;
    const trans = corridorTransitionYears(rec, first, panel.meta.y1);
    for (let y = first; y <= panel.meta.y1; y++) {
      const st = corridorStateAt(rec, y - 1) ?? corridorStateAt(rec, y);
      const f = corridorFeatures(rec, st, look(y));
      const d = Math.floor(y / 10) * 10;
      const b = by.get(d) ?? by.set(d, { n: 0, g: 0, w: 0, ev: 0, wev: 0 }).get(d);
      b.n++; if (f.guarantor_presence > 0) b.g++; if (f.guarantor_withdrawal > 0) b.w++;
      if (trans.has(y)) { b.ev++; if (f.guarantor_withdrawal > 0) b.wev++; }
    }
  }
  for (const [d, b] of [...by].sort((a, c) => a[0] - c[0])) console.log(`  ${d}s n=${String(b.n).padStart(3)} guarded ${String(b.g).padStart(3)} withdrawal ${String(b.w).padStart(2)} transitions ${b.ev} (of which after a withdrawal: ${b.wev})`);
}

console.log(`\n=== 4. the guarantor ablation at several splits (chokepoint_status / corridor_status) ===`);
{
  const fitter = createFitter(inputs);
  for (const id of ['chokepoint_status', 'corridor_status']) {
    const t = templates.find(x => x.id === id);
    for (const split of [1940, 1946, 1960, 1970, 1980]) {
      const tv = { ...t, candidates: (t.candidates ?? []).map(c => ({ ...c, holdout_split: split })) };
      const { fit } = fitter.fitTemplate(tv, { holdout: false });
      const row = (fit.ablation ?? []).map(a => `${a.variant}=${a.note ? 'n/a' : `${a.auc_holdout?.toFixed(3)}/${a.brier_holdout?.toFixed(4)}`}`).join('  ');
      console.log(`  ${id} split ${split}: ${row}`);
    }
  }
}

console.log(`\n=== 5. direction check on the 2026 state (chokepoint closure hazard) ===`);
{
  const fits = JSON.parse(readFileSync('data/fits.json', 'utf8')).fits;
  const t = templates.find(x => x.id === 'chokepoint_status');
  const fit = fits[t.id];
  const has = t.covariates.some(c => c.var === 'guarantor_withdrawal');
  console.log(`  guarantor_withdrawal is ${has ? 'a fitted covariate' : 'NOT in the published fit (candidate only)'}; coef ${fit?.coefs?.guarantor_withdrawal?.value?.toFixed(3) ?? '—'}`);
  for (const id of ['hormuz', 'bab_al_mandab', 'malacca', 'suez']) {
    const rec = recOf(id); if (!rec) continue;
    for (const y of [2025, 2026]) {
      const st = corridorStateAt(rec, y - 1) ?? corridorStateAt(rec, y);
      const T = corridorTransits(rec, st, look(y));
      const f = corridorFeatures(rec, st, look(y));
      if (!fit || fit.status !== 'fitted') { console.log(`  ${id} ${y}: guarantor=${f.guarantor_presence} withdrawal=${f.guarantor_withdrawal} (no fit)`); continue; }
      // a covariate with no observation in the year is imputed 0 here and the imputation is printed: this is a
      // direction check on one record, not a forecast (the panel's last year is 2025, so 2026 has no at_war or
      // intrastate observation at all).
      const imputed = [];
      const eta = (feats) => {
        let e = fit.intercept;
        for (const c of t.covariates) {
          let x = feats[c.var] ?? (c.default_outside && (y < c.default_outside.window[0] || y > c.default_outside.window[1]) ? c.default_outside.value : null);
          if (x == null) { x = 0; if (!imputed.includes(c.var)) imputed.push(c.var); }
          if (c.transform === 'z') { const s = fit.stats[c.var]; e += fit.coefs[`z(${c.var})`].value * ((x - s.mean) / (s.sd || 1)); }
          else e += fit.coefs[c.var].value * (x > 0 ? 1 : 0);
        }
        return e;
      };
      const p = (feats) => { const e = eta(feats); return e == null ? null : 1 / (1 + Math.exp(-e)); };
      const on = p(f), off = p({ ...f, guarantor_withdrawal: 0 });
      console.log(`  ${id} ${y}: transits ${T.join(',') || '—'} guarantor=${f.guarantor_presence} withdrawal=${f.guarantor_withdrawal} war=${f.adjacent_war}  P(transition) ${on == null ? '—' : (on * 100).toFixed(2) + '%'} vs ${off == null ? '—' : (off * 100).toFixed(2) + '%'} with the withdrawal term forced off${imputed.length ? `  [imputed 0: ${imputed.join(',')}]` : ''}`);
    }
  }
}
