// Bilateral trade dependence of a pair in a year (data/trade.json, scripts/build-trade.mjs): the weak-link share
// min(s_ij, s_ji) of each side's recorded trade. A pair's last observed year carries forward (the series ends 2006-2009);
// before 1870 or for a pair never recorded it is 0 — an imputation, stated. A forecast holds it at as-of.
export function tradeIndex(data) {
  const pairs = data?.pairs ?? {};
  return (k, y) => { const p = pairs[k]; if (!p || y < p.y0) return 0; const i = Math.min(y - p.y0, p.v.length - 1); return p.v[i] ?? 0; };
}
