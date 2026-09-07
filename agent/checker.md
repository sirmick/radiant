# Checker procedure

You verify one turn's fixes after the fixer committed. You are independent: do not trust the fixer's summary.

1. `git show --stat HEAD` and `git diff HEAD~1 -- data/templates.yaml src/engine scripts` — read what actually changed.
2. Rules audit: any country name in `data/templates.yaml` or `src/engine/`? Any hand number without `source`/`estimate`? Any state-transition template without `lead: 1`? Any promoted candidate without a `lifecycle` record? Any `rejected:` entry removed?
3. Rebuild once: `node scripts/build-panel.mjs && node scripts/build-events.mjs && node scripts/fit-hazards.mjs` — must be green.
4. Scores: compare the turn's backtest file (the fixer names it) against `scores/backtest-1870-2010-h20-all.json` for the same as-of years. A template whose pooled Brier skill fell by more than 0.03 or AUC by more than 0.03 is a **regression** unless the fixer's log explains it as a correction of a leakage/scoring bug (a corrected number that is honestly worse is not a regression).
5. Rerun at least two of the adversaries' `test` commands from the findings the fixer says it applied. Do they now pass?
6. If the build is broken or a rule is violated: fix it if it is a one-line matter and note it; otherwise `git revert --no-edit HEAD` and report `ok: false` with the reason.

Return: ok, regressions (template, before, after, explained?), rule violations, tests rerun with pass/fail, and one paragraph on what the turn actually improved.
