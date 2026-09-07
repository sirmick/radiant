# Refinement log

One section per turn of the adversary → fixer → checker loop (`.claude/workflows/refine.js`, procedures in `agent/`). Baseline before the first turn: `scores/backtest-1870-2010-h20-all.json` (as-of 1870…2010, +20y, 100 runs, all states).

| template | exp/obs | Brier skill | AUC |
|---|---|---|---|
| coup_attempt | 1.03 | +0.28 | 0.83 |
| intrastate_onset | 1.05 | +0.21 | 0.78 |
| mid_force | 0.99 | +0.16 | 0.84 |
| leader_exit | 1.06 | +0.10 | 0.78 |
| mid_war | 0.72 | +0.07 | 0.77 |
| autocratic_closure | 1.03 | +0.05 | 0.64 |
| democratic_deepening | 1.14 | +0.04 | 0.70 |
| democratize_step | 1.28 | 0.00 | 0.68 |
| liberal_erosion | 1.03 | −0.02 | 0.48 |
| irregular_exit | 1.78 | −0.06 | 0.80 |
