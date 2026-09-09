# Glossary

**Actor** — a state in the system (CoW/GW membership), with a lifecycle. *Modelled* actors (64) are simulated; the rest of the 217-state universe is fit-only.

**As-of** — the year a world is built from the panel. `createWorld(asOf)` is the same function for a backtest (1870…2010) and a forecast (2025). With `--refit`, coefficients use only labels ≤ as-of.

**Candidate / promoted / rejected / monitored** — the lifecycle of a covariate or template. Candidates are ablated on the era holdout; promoted ones carry a `lifecycle` record with the numbers; rejected ones stay listed so the loop does not re-propose them; monitored templates are fitted and scored but not simulated.

**Coverage window** — the years a dataset actually observes an event kind. Absence outside it is not a non-event; the backtest scores only inside it.

**Corridor / chokepoint** — dated infrastructure records (rail, canal, pipeline, HVDC, cable, strait) with `transits` and `load_bearing_for`. The corridor-year unit makes them scorable.

**Corridor dampener** — the hypothesis that infrastructure load-bearing for a third party suppresses disputes between its transit states. Tested in package 4 and not kept (Berlin–Baghdad falsified it).

**CINC** — CoW composite index of national capability (share of world). Ends 2001; carried forward.

**Display-only** — a registry variable with `model: false`: shown in the viewer as an estimate, never read by the fitter or engine.

**Dyad** — an unordered pair of actors. *Politically relevant* dyads (contiguous or involving a great power) are the sample for dispute/war templates.

**Escalation** — a proposal that adds a new variable, effect or mechanism; agents may not implement it, they write it to `docs/escalations.md` for the operator.

**Era holdout** — fit on years before a split (1946, 1986, 1990, 2005 depending on the template), test after. Era-interacted terms need a split that leaves the era partly in training.

**Field** — a continuous geographic overlay computed from sources and distance kernels (spheres of influence, conflict intensity). An estimate, not a fitted quantity.

**Great game** — covariate: superpower client × bipolar era (1947–1991). Promoted on coups and closures.

**Info access** — derived: max(internet users, mobile penetration, scaled fixed lines). Promoted on coups (negative) via the "seize the TV station" hypothesis.

**Lead-1** — labelling a state-transition template with next year's event so the hazard from this year's state applies to the coming year (prevents leakage).

**Lifecycle** — `introduced` / `retired` / `successor` / `spans` on actors; `introduced` / `saturates` / `retired` on waves; `history` on corridors and territories.

**Wave / mass / attainment** — a capability wave is a dated technology (`data/waves.yaml`); an actor **attains** it when it reaches sovereign production at scale (`sovereign_by`). A wave's **mass** coefficient in [0,1] says how much of its military value is production rate rather than possession, and is the exponent on the actor's share of world industrial output in the wave-weighted capability share (`src/engine/waves.js`).

**Panel** — the actor-year table 1816–2025 (`data/panel.json`).

**Presence** — where great-power forces sit: bases, garrisons, fleet areas, advisors, dated.

**Refit (rolling-origin)** — coefficients fitted per as-of year on labels ≤ as-of. Default since package 1.

**Rivalry trace** — decaying memory of past disputes on a dyad (δ = 0.85), replacing a binary five-year flag.

**Template** — a generic hazard sub-model: event kind, unit, covariates with literature priors, fitted coefficients, holdout scores, state rewrites.

**Truth** — `data/events.json`: what actually happened, machine-derived plus the hand log.

**Wave** — a technology capability with introduction, first-sovereign year, diffusion, saturation, retirement.
