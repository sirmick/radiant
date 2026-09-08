# Runbook

All commands run from the repo root with Node 22. Everything after the fetch is offline and deterministic (fixed seeds).

## Fetch

```
./scripts/fetch-raw.sh              # Natural Earth, World Bank, UN WPP, OWID energy, IEA EV -> data/raw
```
Historical sources (CoW via Dataverse, Maddison/OWID, V-Dem, REIGN, UCDP, CShapes, countrycode, troopdata) are listed with URLs in `docs/data-catalogue.md`; `scripts/build-panel.mjs` documents each file it reads.

## Build the model

```
node scripts/build-contiguity.mjs   # CShapes -> data/contiguity.json (slow, ~45 s; only when CShapes changes)
npm run build:hist                  # = build-panel -> build-events -> fit-hazards
   node scripts/build-panel.mjs     #   data/panel.json     actor-year covariates 1816–2025, all states
   node scripts/build-events.mjs    #   data/events.json    dated events (machine + data/history/events.yaml); fails on unresolvable corridor/territory ids
   node scripts/fit-hazards.mjs     #   data/fits.json      MAP logistic per template, era holdout, calibration, candidate ablations
   node scripts/fit-hazards.mjs coup_attempt --split 2005     # one template, custom holdout, no write
```

## Score

```
npm run backtest                    # = backtest.mjs --from 1950 --to 2000 --step 10 --horizon 20 --runs 100 --universe all
node scripts/backtest.mjs --from 1870 --to 2010 --step 10 --horizon 20 --runs 100 --universe all     # the baseline file the loop compares against
   --no-refit                       # full-sample coefficients (leaks; for comparison only)
   --universe modeled               # simulate only the 64 modelled actors
```
Output: `scores/backtest-<from>-<to>-h<H>-<universe>[-norefit].json` with `byAsOf[]` rows (n, expected, observed, Brier, AUC, `auc_at_risk`, `n_at_risk`, `fit_source`, `underpowered`) and `pooled`. Ground truth is scored only inside each dataset's window.

Every run also carries an **occupancy** score (`operator / occupancy`, 2026-09-08): the event score above grades *first occurrence within the horizon*, which cannot see whether the simulated process is still running twenty years later. The occupancy score grades the **state each year** — P(at war), P(internal armed conflict ≥ 1 and ≥ 2), P(occupied), the dyadic war-years, and the corridor/chokepoint/territory status layer (binary "impaired" plus the multi-class distribution) — as a Brier score against the panel and the record histories, per lead year k = 1…H and pooled, with the same base-rate skill, plus the Spearman rank correlation of the ensemble's median capability share against CoW's at k = 10 and 20. It lands in `byAsOf[].occupancy` and top-level `occupancy`; the console prints, per as-of year, the lead years where **the simulated war occupancy exceeds the panel's** (the hot-process diagnosis). Turning it on moves no event number: the tracking reads state and draws no random numbers.

## Forecast

```
npm run forecast                                     # 2026–2065 from 2025, 300 runs  -> public/forecast.json
node scripts/run-forward.mjs --as-of 1955 --runs 200 --horizon 30   # past forecast, coefficients refit on labels <= 1955 -> public/forecast-1955.json (+ index forecasts.json)
```

## Viewer data

```
node scripts/build-geo.mjs          # Natural Earth -> data/geo/world.topo.json
node scripts/build-world.mjs        # modern YAML + raw -> public/world.json (validates paths and sources)
npm run build:ui-data               # = build-history-slice (public/history.json) + build-news (public/news.json)
node scripts/build-alliance-slice.mjs    # public/alliances.json
node scripts/build-presence-slice.mjs    # public/presence.json
node scripts/build-scores-slice.mjs      # public/scores.json from the baseline backtest
npm run dev  |  npx vite build && npx vite preview
```

## The loops (Claude Code workflows)

Procedures the agents follow are in `agent/` (`adversary.md`, `fixer.md`, `checker.md`, `implementer.md`). Both workflows commit per turn/package and never touch `data/raw`.

- **Refine** — `.claude/workflows/refine.js`. Per turn: four adversaries (lenses: data, corridors, statistics, engine) attack the model for an as-of range; one fixer applies what is allowed (data, structures, templates over existing variables, bugs), rebuilds, backtests, writes `docs/refine-log.md`, commits; one checker audits the commit and reverts if a rule is broken. Anything that adds a new variable, effect or mechanism goes to `docs/escalations.md` for the operator. Launch with `Workflow({scriptPath: '.claude/workflows/refine.js', args: {date, model: 'opus', turns: [{id, from, to, focus}]}})`; default turns are the four eras.
- **Implement** — `.claude/workflows/implement.js`. For each approved package: implementer (follows the package's own "test that decides it"), checker, commit; then a re-baseline commit. Launch with `args: {date, model, packages: [{id, section, note}]}` where `section` is the heading in `docs/escalations.md`.

While a workflow runs, commit only your own paths (`git add <paths>`), never `git add -A` — the fixer/implementer has uncommitted work in the tree.

## Reproducibility checks

- A checker's standard: rebuild panel/events/fits and rerun the turn's backtest; the committed artefacts must reproduce byte-for-byte except timestamps.
- Golden numbers live in `docs/refine-log.md` (baseline tables) and `scores/`.


## Forecast length

`node scripts/run-forward.mjs --runs 300 --horizon 100` builds the main ensemble a century long (`public/forecast.json`, ~4 MB); the viewer's **to** control offers +40…+100 years up to the loaded ensemble's horizon. Cost is linear in runs × years: 20 runs × 40 years take ~14 s on the dev machine including the fit, so 300 × 100 took 432 s (7 min). Past-as-of ensembles run 200 runs × 40 years:

```
for y in 1900 1930 1955 1975 1990 2005; do node scripts/run-forward.mjs --as-of $y --runs 200 --horizon 40; done
node scripts/build-scores-slice.mjs && npx vite build
```

Every ensemble carries the `state` (occupancy) block described in `docs/schema.md`; it is what the Conflict and Routes views paint after the seam, so a rebuild that skips these leaves those views frozen at the last record.
