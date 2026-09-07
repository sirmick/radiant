# Fixer procedure

You receive a ranked, deduplicated list of findings for one turn. Fix what can be fixed within the turn, measure it, record it, commit it.

## Constraints
- **No country names in `data/templates.yaml` or `src/engine/`.** Country specifics go in data files.
- Every hand-set number carries `source:` or `estimate`. Every promoted/rejected candidate gets a `lifecycle`/`rejected` record with the evidence (numbers) that decided it.
- State-transition templates use `lead: 1`. Era-interacted covariates need a `holdout_split` that leaves the era partly in training.
- Ground truth is scored only inside dataset coverage windows (`COVERAGE` in `scripts/backtest.mjs`); extend it when you add an event source.
- Do not delete data; retire it (`retired:`), and keep `rejected:` entries.
- Keep the build green: `node scripts/build-panel.mjs && node scripts/build-events.mjs && node scripts/fit-hazards.mjs` must succeed; `npx vite build` must succeed if you touched `src/`.
- Minimal, justified diffs. If a finding needs data you cannot fetch offline, record it in `docs/refine-log.md` under **deferred** with the URL/dataset name and skip it.

## What you may do without asking
- Add or correct **data**: events, corridor/chokepoint/territory histories, actor lifecycles, overrides, sources, geometry.
- Tweak **data structures**: new fields on existing entities, `status_history`, `load_bearing_for`, coverage windows.
- Change **templates over existing panel variables**: add/remove covariates that already exist in `data/panel.json`, priors, samples, splits, `lead`, split or merge templates, promote/reject candidates with evidence.
- Fix **bugs** in scripts, scoring, engine state rewrites.

## What you must escalate (do not implement)
A **new effect, variable or mechanism**: a variable that needs a new dataset or a new derivation in `build-panel.mjs`, a new latent, a new template kind (new event type), a new engine dynamic (e.g. contagion, decay laws), a new entity type. For each, append to `docs/escalations.md`:
`## <turn id> / <finding id> — <title>` with: what it would add, why (the finding's evidence), the data it needs (URL/dataset), the templates it would feed, the test that would decide it. Then list it under `escalations` in your result and move on.

## Procedure
1. Read `agent/adversary.md` for context, then the findings. Note the baseline scores for the turn's as-of years from `scores/backtest-1870-2010-h20-all.json` (`byAsOf[]` rows within the turn, and `pooled`).
2. Apply fixes in severity order. For corridor/territory findings, add dated entries to `data/history/events.yaml` (kind `corridor` / `chokepoint` / `territory`) and, for corridors that still exist, entries in `data/corridors.yaml` with `status_history` if not present.
3. Rebuild: `node scripts/build-panel.mjs && node scripts/build-events.mjs && node scripts/fit-hazards.mjs`.
4. Re-run the turn's backtest: `node scripts/backtest.mjs --from <from> --to <to> --step 10 --horizon 20 --runs 100 --universe all` (writes `scores/backtest-<from>-<to>-h20-all.json`). Compare pooled skill/AUC per template against the same as-of rows in the baseline file.
5. Append a section to `docs/refine-log.md`: `## Turn <id> — <date>`, with **applied** (finding → change → files → score delta), **skipped** (finding → reason), **deferred**, and the before/after table.
6. `git add -A && git commit` with message `refine(<turn id>): <one line>` and a body listing applied findings. Use `-c user.name=mick -c user.email=sirmick@gmail.com`.

## Output
Return the structured result the workflow asks for: applied/skipped/deferred with finding ids, the before/after pooled scores for the turn, and the commit hash.
