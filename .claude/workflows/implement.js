export const meta = {
  name: 'implement',
  description: 'Implement approved escalation packages sequentially (implementer then checker per package), then re-baseline',
  whenToUse: 'After the operator approves items in docs/escalations.md. args: {packages:[{id, section, note}], date}',
  phases: [
    { title: 'Implement', detail: 'one Opus implementer per package, sequential (shared files)', model: 'opus' },
    { title: 'Check', detail: 'independent checker per package', model: 'opus' },
    { title: 'Baseline', detail: 'full backtest + forward run, committed as the new baseline', model: 'opus' },
  ],
}
const MODEL = (args && args.model) || 'opus'
const DATE = (args && args.date) || '2026-09-07'
const packages = (args && args.packages) || []

const RESULT = {
  type: 'object',
  properties: {
    status: { type: 'string', enum: ['implemented', 'partial', 'blocked'] },
    test_result: { type: 'string' }, scores_before: { type: 'string' }, scores_after: { type: 'string' },
    files: { type: 'array', items: { type: 'string' } }, commit: { type: 'string' }, notes_for_next: { type: 'string' },
  },
  required: ['status', 'test_result', 'scores_before', 'scores_after', 'commit'],
}
const CHECK = {
  type: 'object',
  properties: {
    ok: { type: 'boolean' }, violations: { type: 'array', items: { type: 'string' } },
    test_rerun: { type: 'string' }, regressions: { type: 'array', items: { type: 'string' } }, summary: { type: 'string' }, reverted: { type: 'boolean' },
  },
  required: ['ok', 'violations', 'test_rerun', 'regressions', 'summary'],
}

const out = []
for (const pkg of packages) {
  log(`implement ${pkg.id}`)
  const impl = await agent(
    `Follow agent/implementer.md exactly. Working directory: /home/mick/radiant. Date: ${DATE}.
Package: **${pkg.id}** — the section in docs/escalations.md headed "${pkg.section}".
Operator note: ${pkg.note || 'approved as written'}.
Previous packages this run (already committed; build on them): ${out.map(o => `${o.id}: ${o.impl ? o.impl.status : 'n/a'} — ${o.impl ? o.impl.notes_for_next : ''}`).join(' | ') || 'none'}.`,
    { label: `impl:${pkg.id}`, phase: 'Implement', schema: RESULT, model: MODEL },
  )
  log(`${pkg.id}: ${impl ? impl.status : 'no result'} — commit ${impl ? impl.commit.slice(0, 7) : 'none'}`)
  const check = await agent(
    `Follow agent/checker.md, adapted to an implementation commit. Working directory: /home/mick/radiant.
Package: ${pkg.id} ("${pkg.section}" in docs/escalations.md). Implementer's report (verify, do not trust): ${JSON.stringify(impl)}.
Audit: rules (no country names in templates/engine; fit and engine build features identically — diff the two feature constructions side by side; sources on numbers; lead:1), build green, rerun the package's "test that decides it" yourself and compare to the implementer's numbers, and confirm the full 1870–2010 backtest runs. A regression is a pooled skill or AUC drop > 0.03 on any template the package does not target, unless explained as a leakage/scoring correction. Revert only if the build is broken or a rule is violated beyond a one-line fix.`,
    { label: `check:${pkg.id}`, phase: 'Check', schema: CHECK, model: MODEL },
  )
  log(`${pkg.id}: check ${check && check.ok ? 'OK' : 'FAILED'}${check && check.reverted ? ' (reverted)' : ''} — ${check ? check.summary.slice(0, 160) : ''}`)
  out.push({ id: pkg.id, impl, check })
}

log('re-baseline')
const base = await agent(
  `Working directory: /home/mick/radiant. All approved packages are implemented and committed. Produce the new baseline:
1. node scripts/build-panel.mjs && node scripts/build-events.mjs && node scripts/fit-hazards.mjs
2. node scripts/backtest.mjs --from 1870 --to 2010 --step 10 --horizon 20 --runs 100 --universe all   (this is the baseline file the refine loop compares against)
3. node scripts/run-forward.mjs --runs 300 --horizon 40; node scripts/build-history-slice.mjs; node scripts/build-news.mjs; node scripts/build-world.mjs
4. Replace the baseline table at the top of docs/refine-log.md with the new pooled numbers (keep the old table below it, labelled "baseline before implementation, ${DATE}"), and add a "Baseline ${DATE}" section listing per-template pooled exp/obs, skill, AUC and, where the backtest reports it, auc_at_risk.
5. git add -A && git -c user.name=mick -c user.email=sirmick@gmail.com commit -m "baseline(${DATE}): after implementing approved escalations"
Return the new pooled table as text and the commit hash.`,
  { label: 'baseline', phase: 'Baseline', model: MODEL },
)
return { packages: out, baseline: base }
