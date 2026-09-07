export const meta = {
  name: 'refine',
  description: 'Adversary/fixer/checker refinement loop over turns (eras or weeks): attack the model, fix it, verify, commit',
  whenToUse: 'Run with args {turns:[{id,from,to,focus}]} to refine the model turn by turn; each turn commits.',
  phases: [
    { title: 'Attack', detail: 'four adversaries per turn, one lens each' },
    { title: 'Fix', detail: 'one fixer per turn applies, rebuilds, backtests, commits' },
    { title: 'Check', detail: 'independent checker audits the commit and scores' },
  ],
}

// Turns are sequential (the fixer mutates the repo). Adversaries within a turn run in parallel with distinct lenses.
const turns = (args && args.turns) || [
  { id: 'era-1870-1914', from: 1870, to: 1910, focus: 'industrial era: rail, Suez, telegraph, steel; great-power alliances; Bremer dyads; Austria-Hungary/Ottoman/Prussia lifecycles' },
  { id: 'era-1914-1945', from: 1910, to: 1940, focus: 'world wars as contagion not independent dyads; regime collapses of the interwar; corridor closures (Bosphorus 1914, Hejaz 1917); territorial change' },
  { id: 'era-1945-1991', from: 1950, to: 1980, focus: 'decolonisation (new states, lifecycles), Cold War clients and coups, UCDP civil wars, pipelines and canals (Suez 1956/67, TAPline), nuclear acquisitions' },
  { id: 'era-1991-2026', from: 1990, to: 2010, focus: 'unipolarity, aid conditionality, the 2010s autocratisation wave, BTC/Nord Stream/BRI/Middle Corridor, Ukraine 2014/2022, present-day wiring of corridors and territories' },
]
const LENSES = ['data', 'corridors', 'statistics', 'engine']

const FINDINGS = {
  type: 'object',
  properties: {
    findings: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' }, lens: { type: 'string' }, severity: { type: 'string', enum: ['high', 'medium', 'low'] },
          title: { type: 'string' }, evidence: { type: 'string' }, files: { type: 'array', items: { type: 'string' } },
          proposed_fix: { type: 'string' }, test: { type: 'string' },
        },
        required: ['id', 'lens', 'severity', 'title', 'evidence', 'proposed_fix', 'test'],
      },
    },
  },
  required: ['findings'],
}
const FIX_RESULT = {
  type: 'object',
  properties: {
    applied: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, summary: { type: 'string' }, files: { type: 'array', items: { type: 'string' } } }, required: ['id', 'summary'] } },
    skipped: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, reason: { type: 'string' } }, required: ['id', 'reason'] } },
    deferred: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, needs: { type: 'string' } }, required: ['id', 'needs'] } },
    escalations: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, title: { type: 'string' }, needs: { type: 'string' } }, required: ['id', 'title'] } },
    scores_before: { type: 'string' }, scores_after: { type: 'string' }, scores_file: { type: 'string' }, commit: { type: 'string' },
  },
  required: ['applied', 'skipped', 'deferred', 'escalations', 'scores_before', 'scores_after', 'commit'],
}
const CHECK = {
  type: 'object',
  properties: {
    ok: { type: 'boolean' },
    regressions: { type: 'array', items: { type: 'object', properties: { template: { type: 'string' }, before: { type: 'string' }, after: { type: 'string' }, explained: { type: 'boolean' } }, required: ['template', 'before', 'after', 'explained'] } },
    violations: { type: 'array', items: { type: 'string' } },
    tests: { type: 'array', items: { type: 'object', properties: { test: { type: 'string' }, pass: { type: 'boolean' } }, required: ['test', 'pass'] } },
    summary: { type: 'string' }, reverted: { type: 'boolean' },
  },
  required: ['ok', 'regressions', 'violations', 'tests', 'summary'],
}

const key = (f) => (f.title || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().slice(0, 60)
const results = []

for (const turn of turns) {
  log(`turn ${turn.id}: attacking (${LENSES.length} lenses)`)
  const attacks = await parallel(LENSES.map(lens => () => agent(
    `Follow agent/adversary.md exactly. Working directory: /home/mick/radiant.
Turn: ${turn.id} (as-of years ${turn.from}–${turn.to}, each +20y). Your lens: **${lens}**.
Turn focus from the operator: ${turn.focus}
Standing instruction from the operator: corridors, chokepoints and territories are under-built for every era — the corridors lens must produce concrete dated entries; other lenses should flag corridor-related gaps they notice too.
Return up to 8 findings ranked by expected backtest impact, ids like "${turn.id}/${lens}/1".`,
    { label: `attack:${turn.id}:${lens}`, phase: 'Attack', schema: FINDINGS },
  )))
  const found = attacks.filter(Boolean).flatMap(r => r.findings)
  const seen = new Set(); const fresh = []
  for (const f of found) { const k = key(f); if (seen.has(k)) continue; seen.add(k); fresh.push(f) }
  const order = { high: 0, medium: 1, low: 2 }
  fresh.sort((a, b) => order[a.severity] - order[b.severity])
  log(`turn ${turn.id}: ${found.length} findings, ${fresh.length} after dedup (${fresh.filter(f => f.severity === 'high').length} high)`)
  if (!fresh.length) { results.push({ turn: turn.id, findings: 0 }); continue }

  const fix = await agent(
    `Follow agent/fixer.md exactly. Working directory: /home/mick/radiant.
Turn: ${turn.id}; backtest as-of range --from ${turn.from} --to ${turn.to}. Today's date for the log: ${args && args.date ? args.date : '2026-09-06'}.
Findings (ranked; apply in this order, skip with a reason if not fixable this turn):
${JSON.stringify(fresh, null, 1)}`,
    { label: `fix:${turn.id}`, phase: 'Fix', schema: FIX_RESULT },
  )
  log(`turn ${turn.id}: fixer applied ${fix ? fix.applied.length : 0}, skipped ${fix ? fix.skipped.length : 0}, deferred ${fix ? fix.deferred.length : 0}, escalated ${fix ? fix.escalations.length : 0}; commit ${fix ? fix.commit : 'none'}`)

  const check = await agent(
    `Follow agent/checker.md exactly. Working directory: /home/mick/radiant.
Turn: ${turn.id}; as-of range ${turn.from}–${turn.to}; the fixer's scores file: ${fix ? fix.scores_file : 'unknown'}; commit: ${fix ? fix.commit : 'unknown'}.
Fixer's own report (do not trust it, verify it): ${JSON.stringify(fix)}
Findings the fixer received (rerun at least two of the applied ones' tests): ${JSON.stringify(fresh.map(f => ({ id: f.id, test: f.test })), null, 1)}`,
    { label: `check:${turn.id}`, phase: 'Check', schema: CHECK },
  )
  log(`turn ${turn.id}: check ${check && check.ok ? 'OK' : 'FAILED'}${check && check.reverted ? ' (reverted)' : ''} — ${check ? check.summary.slice(0, 160) : ''}`)
  results.push({ turn: turn.id, findings: fresh.length, high: fresh.filter(f => f.severity === 'high').length, fix, check })
}
return results
