# Analysis one-offs

Scripts written by implementation packages to measure a specific question. Not part of the build; kept so their numbers in `docs/escalations.md` and `docs/refine-log.md` can be reproduced. Run from the repo root.

- `war-spells.mjs` — simulated interstate-war spell lengths vs the panel's (`--as-of`, `--runs`); package 2's duration test.
- `coalition-calib.mjs` — `p_join` calibration from the `sides:` lists in `data/history/events.yaml`; package 3.
- `corridor-fit.mjs` — corridor-year / chokepoint-year unit diagnostics; package 4.
- `capability-composite.mjs` — the modern capability composite against CINC (r), and cinc staleness in the 2025 world; package 10's test.
- `termination.mjs` — the four termination samples and their fits, simulated spell lengths against the panel, the four named cases as modal-decade tests, and the 2026 direction check; package 8's deciding test (`--runs`).
- `polarity.mjs` — the derived world state against the typed era flags, the threshold grid, and the information wave; package 9's test.
- `presence.mjs` — the presence layer's falsifiers, per-split ablations and the 2026 direction check; package 7's test.
- `compare-backtests.mjs` — pooled and per-as-of diff of two `scores/backtest-*.json` files.
