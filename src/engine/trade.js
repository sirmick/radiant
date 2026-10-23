// Bilateral trade dependence of a pair in a year (data/trade.json, scripts/build-trade.mjs): the weak-link share
// min(s_ij, s_ji) of each side's recorded trade. A pair's last observed year carries forward (the series ends 2006-2009);
// before 1870 or for a pair never recorded it is 0 — an imputation, stated. A forecast holds it at as-of.
export function tradeIndex(data) {
  const pairs = data?.pairs ?? {};
  // returned on the scale the templates read: log(1 + 100 d) — 0 for a pair with no recorded trade, 0.7 at 1%, 2.4 at
  // 10%, 3.9 at 50%. log(d + 0.001) gave no-trade pairs a value of -6.9, which a negative coefficient turned into a war
  // boost for every distant pair (Kenya-Morocco ranked among the region's likeliest wars)
  return (k, y) => { const p = pairs[k]; if (!p || y < p.y0) return 0; const i = Math.min(y - p.y0, p.v.length - 1); return Math.log1p(100 * (p.v[i] ?? 0)); };
}
