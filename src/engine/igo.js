// Shared IGO memberships of a pair in a year, from data/igo.json spans. Past the source's last year the last count
// stands (a forecaster at 2025 knows 2014's), and a forecast holds the count at as-of — institutions are not simulated.
export function igoIndex(data) {
  const pairs = data?.pairs ?? {}; const last = data?.meta?.years?.[1] ?? 2014;
  return (k, y) => { const sp = pairs[k]; if (!sp) return 0; const yy = Math.min(y, last); let v = 0; for (const [a, b, n] of sp) { if (yy >= a && yy <= b) return n; if (a <= yy) v = n; } return v; };
}
