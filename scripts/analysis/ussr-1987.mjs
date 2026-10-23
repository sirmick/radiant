// Case study: the end of the Soviet bloc, forecast from 1987 (docs/plan-structure.md, "Case: 1987").
// Reads sample-path files written by scripts/run-forward.mjs (one record-shaped world per run) and counts JOINT
// outcomes per run, which the ensemble's marginals cannot give: how many of the six Warsaw Pact members step up a
// regime category by 1991, how many Soviet republics become states by 1992, whether East Germany is gone.
// Run:
//   MEMBERSHIP_HAZARD=1 node scripts/run-forward.mjs --as-of 1987 --runs 200 --horizon 10 --paths 200 --out /tmp/u87.json
//   node scripts/analysis/ussr-1987.mjs /tmp/u87-paths.json
// The ids below are the record's; the model itself names no country.
import { readFileSync } from 'node:fs';
const BLOC = ['POL', 'HUN', 'CZECHOSLOVAKIA', 'DDR', 'BGR', 'ROU'];
const REP = ['EST', 'LVA', 'LTU', 'UKR', 'BLR', 'GEO', 'ARM', 'AZE', 'KAZ', 'UZB', 'MDA', 'KGZ', 'TJK', 'TKM'];
const pct = (x) => (100 * x).toFixed(1).padStart(5) + '%';
for (const f of process.argv.slice(2)) {
  const runs = JSON.parse(readFileSync(f)).runs; const N = runs.length;
  let b1 = 0, b3 = 0, r1 = 0, r10 = 0, r1L = 0, r10L = 0, rusUp = 0, b3GivenRus = 0, rus = 0, both = 0, ddrGone = 0; const nBloc = [];
  for (const r of runs) {
    const ev = r.events.flat(); const by = (y) => ev.filter(e => e.year <= y);
    const blocUp = new Set(by(1991).filter(e => e.k === 'regime_change' && e.direction === 'democratize' && BLOC.includes(e.actor)).map(e => e.actor)).size;
    const reps97 = new Set(by(1997).filter(e => e.k === 'state_birth' && REP.includes(e.actor)).map(e => e.actor)).size; if (reps97 >= 1) r1L++; if (reps97 >= 10) r10L++;
    const reps = new Set(by(1992).filter(e => e.k === 'state_birth' && REP.includes(e.actor)).map(e => e.actor)).size;
    const ru = by(1990).some(e => e.k === 'regime_change' && e.direction === 'democratize' && e.actor === 'RUS');
    nBloc.push(blocUp); if (blocUp >= 1) b1++; if (blocUp >= 3) b3++; if (reps >= 1) r1++; if (reps >= 10) r10++;
    if (ru) { rus++; if (blocUp >= 3) b3GivenRus++; } if (blocUp >= 3 && reps >= 1) both++;
    if (by(1991).some(e => e.k === 'state_death' && e.actor === 'DDR')) ddrGone++;
  }
  console.log(`\n${f.split('/').pop()}  (${N} runs, from 1987)`);
  console.log(`  Warsaw Pact members democratising by 1991   ≥1 ${pct(b1 / N)}   ≥3 ${pct(b3 / N)}   mean ${(nBloc.reduce((a, b) => a + b, 0) / N).toFixed(2)} of 6   [record: 6 of 6]`);
  console.log(`  USSR democratises by 1990                   ${pct(rus / N)}   → P(≥3 bloc | USSR moved) ${rus ? pct(b3GivenRus / rus) : '  n/a'}`);
  console.log(`  Soviet republics independent by 1992        ≥1 ${pct(r1 / N)}   ≥10 ${pct(r10 / N)}   [record: 12 of 14 in the panel]`);
  console.log(`  ... by 1997                                ≥1 ${pct(r1L / N)}   ≥10 ${pct(r10L / N)}`);
  console.log(`  East Germany gone by 1991                   ${pct(ddrGone / N)}   [record: yes, 1990]`);
  console.log(`  bloc ≥3 AND a republic independent          ${pct(both / N)}`);
}
