// Clustered events across a group of states, per run (docs/plan-structure.md, "case studies"): how many members of a
// group have at least one of the given events in a window, in each sample world, against the record. The ensemble's
// marginals say how likely each member is; only the sample worlds say whether they go together — the Arab Spring
// (four leaders out in eighteen months) and 1989 are clusters, not four independent coins.
//   dispersion = Var(count over runs) / sum p(1 - p): 1 = independent members, > 1 = they cluster.
// Run: node scripts/analysis/cluster.mjs <paths.json> --group region_pol=3,regime<=1 [--kinds irregular_exit,intrastate_onset] [--from 2010 --to 2013]
import { readFileSync } from 'node:fs';
const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i >= 0 ? process.argv[i + 1] : d; };
const file = process.argv[2]; const paths = JSON.parse(readFileSync(file, 'utf8')); const runs = paths.runs;
const panel = JSON.parse(readFileSync('data/panel.json', 'utf8')); const Y0 = panel.meta.y0;
const asOf = (runs[0].meta?.from ?? +arg('asof')) - 1;
const KINDS = arg('kinds', 'irregular_exit,intrastate_onset,coup_attempt,opening').split(',');
const FROM = +arg('from', asOf + 1), TO = +arg('to', asOf + 5);
// group: conditions on the panel at as-of, e.g. region_pol=3,regime<=1
const conds = arg('group', 'region_pol=3,regime<=1').split(',').map(c => { const m = c.match(/^(\w+)(<=|>=|=)(.+)$/); return { v: m[1], op: m[2], x: +m[3] }; });
const at = (id, v) => panel.actors[id]?.[v]?.[asOf - Y0];
const group = Object.keys(panel.actors).filter(id => at(id, 'live') === 1 && conds.every(c => { const x = at(id, c.v); return x != null && (c.op === '=' ? x === c.x : c.op === '<=' ? x <= c.x : x >= c.x); }));
// an engine event's kind: the template that produced it where there is one (irregular_exit fires as k=leader_exit, t=irregular_exit)
const kindOf = (e) => e.t ?? (e.k === 'leader_exit' && e.irregular ? 'irregular_exit' : e.k === 'coup' ? 'coup_attempt' : e.k);
// `leader_exit` counts every exit, irregular ones included (REIGN codes Ben Ali's flight and Gaddafi's death as regular)
const match = (k, K, e) => k === K || (K === 'leader_exit' && (e.k ?? e.kind) === 'leader_exit');
const { events } = JSON.parse(readFileSync('data/events.json', 'utf8'));
const recKind = (e) => (e.kind === 'leader_exit' && e.irregular ? 'irregular_exit' : e.kind === 'coup' ? 'coup_attempt' : e.kind);
console.log(`${file.split('/').pop()}: as-of ${asOf}, window ${FROM}-${TO}, group (${conds.map(c => c.v + c.op + c.x).join(', ')}) = ${group.length}: ${group.join(' ')}`);
for (const K of KINDS) {
  const hit = runs.map(r => new Set(r.events.flat().filter(e => Math.floor(e.year) >= FROM && Math.floor(e.year) <= TO && match(kindOf(e), K, e) && group.includes(e.actor ?? e.u)).map(e => e.actor ?? e.u)));
  const counts = hit.map(s => s.size); const N = counts.length; const mean = counts.reduce((a, b) => a + b, 0) / N;
  const varc = counts.reduce((a, b) => a + (b - mean) ** 2, 0) / N;
  const p = group.map(id => hit.filter(s => s.has(id)).length / N); const indep = p.reduce((a, q) => a + q * (1 - q), 0);
  const rec = new Set(events.filter(e => match(recKind(e), K, e) && Math.floor(e.year) >= FROM && Math.floor(e.year) <= TO && group.includes(e.actor)).map(e => e.actor));
  const ge = (k) => counts.filter(c => c >= k).length / N;
  const top = group.map((id, i) => [id, p[i]]).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([id, q]) => `${id}${rec.has(id) ? '*' : ''} ${(100 * q).toFixed(0)}%`).join(' ');
  console.log(`  ${K.padEnd(17)} mean ${mean.toFixed(2)}  P(>=1) ${(100 * ge(1)).toFixed(0)}%  P(>=3) ${(100 * ge(3)).toFixed(1)}%  P(>=${Math.max(1, rec.size)}) ${(100 * ge(Math.max(1, rec.size))).toFixed(1)}%  dispersion ${(varc / Math.max(1e-9, indep)).toFixed(2)}   record ${rec.size}: ${[...rec].join(' ')}   top: ${top}`);
}
