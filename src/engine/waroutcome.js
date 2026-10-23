// War outcomes (docs/plan-structure.md): who loses when a simulated war ends. Fitted on CoW inter-state wars that ended
// at or before as-of: for every belligerent with a decisive outcome (won / lost), P(lost) on the log ratio of its side's
// capability (CINC summed over its co-belligerents, at the war's first year) to the other side's. Penalised logistic,
// two parameters. A defeat is a state the engine carries for a year (`war_defeat`), read by great-power exit
// (src/engine/greatpower.js) and by any template that declares it. Nothing here names a country.
const sigmoid = (x) => 1 / (1 + Math.exp(-x));
export function fitWarOutcome(panel, wars, maxYear) {
  if (!wars?.length) return null;
  const Y0 = panel.meta.y0; const cinc = (id, y) => panel.actors[id]?.cinc?.[y - Y0] ?? null;
  const byWar = new Map(); for (const w of wars) if (w.end <= maxYear) (byWar.get(w.war) ?? byWar.set(w.war, []).get(w.war)).push(w);
  const X = [], Y = [];
  for (const list of byWar.values()) {
    const sideCap = (s) => list.filter(w => w.side === s).reduce((a, w) => a + (cinc(w.actor, w.start) ?? 0), 0);
    for (const w of list) { if (w.outcome !== 1 && w.outcome !== 2) continue; const own = sideCap(w.side), oth = sideCap(w.side === 1 ? 2 : 1); if (!(own > 0) || !(oth > 0)) continue; X.push(Math.log(own / oth)); Y.push(w.outcome === 2 ? 1 : 0); }
  }
  if (Y.length < 20) return null;
  let b0 = 0, b1 = 0; const lam = 1;   // Newton, prior sd 1 on the slope
  for (let it = 0; it < 50; it++) {
    let g0 = 0, g1 = 0, h00 = 0, h01 = 0, h11 = 0;
    for (let i = 0; i < X.length; i++) { const p = sigmoid(b0 + b1 * X[i]), w = p * (1 - p); g0 += Y[i] - p; g1 += (Y[i] - p) * X[i]; h00 += w; h01 += w * X[i]; h11 += w * X[i] * X[i]; }
    g1 -= lam * b1; h11 += lam; const det = h00 * h11 - h01 * h01; const d0 = (h11 * g0 - h01 * g1) / det, d1 = (h00 * g1 - h01 * g0) / det; b0 += d0; b1 += d1; if (Math.abs(d0) + Math.abs(d1) < 1e-9) break;
  }
  return { trained_through: maxYear, n: Y.length, beta: [b0, b1] };
}
/** P(the side with capability `own` loses against `other`). */
export const loseProb = (fit, own, other) => (fit && own > 0 && other > 0 ? sigmoid(fit.beta[0] + fit.beta[1] * Math.log(own / other)) : 0.5);
