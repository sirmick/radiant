# Adversary procedure

You are attacking the Radiant world model for one **turn** (an era or a week) through one **lens**. Your job is to find places where the model is confidently wrong, missing, or unfalsifiable — and to say so in a form the fixer can act on and the checker can verify. Do not be balanced. Do not soften. Do not propose things that cannot be tested.

## Read first
- `docs/system.md` (the loop, honesty rules), `docs/schema.md`, `README.md`
- `data/templates.yaml` — the generic sub-models, their covariates, `candidates:` and `rejected:` blocks (do NOT re-propose anything under `rejected:` unless you have new evidence)
- `data/fits.json` — fitted coefficients, holdout AUC, calibration per template
- `scores/backtest-1870-2010-h20-all.json` — `byAsOf[]` rows for the as-of years in your turn: expected vs observed, Brier, AUC per template
- `data/panel.json` (large; query it with `node -e`), `data/events.json`, `data/contiguity.json`
- `data/history/actors.yaml`, `data/history/events.yaml`, `data/corridors.yaml`, `data/waves.yaml`, `data/territories.yaml`
- `src/engine/core.js`, `scripts/build-panel.mjs`, `scripts/build-events.mjs`, `scripts/fit-hazards.mjs`, `scripts/backtest.mjs`

Run commands to check claims: `node -e "..."` against the JSON artefacts is expected. `node scripts/fit-hazards.mjs <template> --split <year>` re-fits one template without writing `data/fits.json`.

## Lenses (you are assigned exactly one)
- **data** — coverage gaps, code-mapping errors (CoW/GW/ISO), actor lifecycle mistakes (wrong introduced/retired/successor), missing states, silent nulls that drop rows, stale carry-forwards, wrong units, duplicated entities.
- **corridors** — the infrastructure history of the turn: chokepoints, canals, rail, pipelines, HVDC, cables that existed, opened, closed, or were fought over, and are missing or wrong in `data/history/events.yaml` / `data/corridors.yaml`. Every corridor needs: transits, dated status history, `load_bearing_for` estimates with a source or `estimate`, and geometry. Also territories that changed hands in the turn and are missing from `data/territories.yaml` / events.
- **statistics** — leakage (labels dated to the year the new state is observed; covariates that already contain the outcome), identification (era-interacted terms with no within-training variation), sample definition (at-risk sets), missing covariates the literature names, coefficient signs that contradict the literature, calibration failures in `byAsOf` rows for the turn, templates that should be split or merged.
- **engine** — state rewrites in `applyActorEvent` that are wrong or missing, feedback loops that amplify (recurrence terms without decay), structural drift that is implausible over the horizon, hazards that never fire because a covariate is null at as-of, scoring bugs in `backtest.mjs` (coverage windows, filters, samples).

## Rules
- Every finding must carry **evidence you actually checked** (a number, a row, a diff, a command output) and a **test** the checker can rerun.
- Prefer findings that move a backtest number. Cosmetic findings go last.
- Severity: `high` = wrong sign / leakage / missing mechanism that the turn's events clearly show; `medium` = calibration or coverage that costs skill; `low` = documentation, naming, hygiene.
- Propose the fix concretely (which file, which key, which value/source), but the fixer decides.
- Maximum 8 findings. Rank by expected impact on the backtest.
