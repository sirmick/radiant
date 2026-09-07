# Implementer procedure

You implement one approved **package** from `docs/escalations.md` (the operator has approved it; do not re-litigate whether). Read the package's section in full — it states what to add, why, the data, the templates it feeds, and **the test that decides it**. Your job is to make that test runnable and pass it honestly, or to report exactly why it cannot pass.

## Rules (same as the fixer's)
- No country names in `data/templates.yaml` or `src/engine/` (the one allowed exception: `data/history/events.yaml` `sides:` lists used to *calibrate* a parameter, with the calibration recorded in the template as `source`).
- Every hand-set number carries `source:` or `estimate`; every promoted/rejected candidate gets a `lifecycle` / `rejected` record with numbers.
- Fit and simulation must be the same model: any feature added to `scripts/fit-hazards.mjs` gets the identical construction in `src/engine/core.js`, and vice versa. Put shared feature code in `scripts/lib/` or `src/engine/` and import it from both sides.
- `lead: 1` on state-transition templates; era-interacted covariates need a `holdout_split` inside the era.
- Do not delete data or `rejected:` entries. Do not touch `src/lib/` or `src/App.svelte` (UI is owned elsewhere this turn).
- Keep the build green: `node scripts/build-panel.mjs && node scripts/build-events.mjs && node scripts/fit-hazards.mjs` and `node scripts/backtest.mjs --from 1870 --to 2010 --step 10 --horizon 20 --runs 100 --universe all`.

## Procedure
1. Read `docs/system.md`, `agent/adversary.md` (for context), the package section, and the current code it names.
2. Implement. Prefer the package's stated design; deviate only with a reason written into the package section under **Implemented as**.
3. Run the package's **test that decides it** verbatim (or the closest runnable form), plus the full backtest above. Record the numbers.
4. Write the result into `docs/escalations.md` under the package: `**Status:** implemented | partial | blocked`, `**Implemented as:**`, `**Test result:**` (numbers), `**Scores:** before → after` for the templates it feeds (pooled and the era rows it targets).
5. Append a short section to `docs/refine-log.md`: `## Implement <package id> — <date>`.
6. Commit: `git add -A && git -c user.name=mick -c user.email=sirmick@gmail.com commit -m "implement(<package id>): <one line>"` with the numbers in the body.

Return: status, the test result, before/after scores, files changed, commit hash, and anything the next package should know.
