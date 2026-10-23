# Plan — one state contract, then unfreeze the structure

Status: proposed 2026-10-23. Two goals that share one mechanism:

1. **The viewer stops distinguishing past from future.** It reads *frames* from a provider; the record and the engine
   are two providers of the same schema.
2. **The world's structure becomes simulated state.** Capability shares, great-power status, polarity, alliances,
   nuclear status and state membership move inside a run instead of being frozen at as-of
   (`docs/system.md` → *Derived world state*; escalations `era-1945-1991-r2 / engine-8`, `era-1991-2026-r2 / engine-2`).

Phase A (contract + replay) lands first so every structural variable in phase C appears in the viewer, past and
future, with no UI work.

Decision recorded: event-score regressions are **accepted** where structural calibration improves (operator,
2026-10-23). The gate changes accordingly — see *Gate*.

---

## Phase A — the frame contract and engine replay

### A1. The contract (`src/contract/`)

One schema for any (source, year). Entities: `actor`, `dyad` (`A|B`, sorted), `record` (corridor / chokepoint /
territory), `world`. Each entity-variable-year carries one **value object**:

| field | meaning |
|---|---|
| `kind` | `categorical` · `binary` · `continuous` · `count` |
| `dist` | categorical/binary: probability vector over `meta.vars[v].levels`; continuous: `[p10, p50, p90]` |
| `n` | runs behind it (1 for the record) |
| `prov` | `observed` · `carried` (with `stale` years) · `simulated` · `imputed` · `frozen` (engine holds it at as-of) |

Plus per year: `events[]` (`{t, u, run?}` — template/kind, unit) and, for ensembles, `paths` (N whole runs, the
existing packed format generalised to every tracked variable).

Variables are declared once in a registry (`src/contract/vars.js`): id, kind, levels, label, unit, format, which
providers can supply it. The viewer's variable picker, legend and hover card read the registry, not the files.

**The record is an ensemble of one.** `n = 1`, every `dist` a point mass, `paths` = the one actual path, `events` =
the event log. Consensus / sample / odds then reduce to the fact (odds = 0/1) without a branch.

### A2. Engine replay (`src/engine/replay.js`)

`replayWorld({asOf: 1816, to: 2025, ...})` steps the same engine but, instead of drawing each hazard, **applies the
recorded events** for that year (leader exits, coups, regime steps, MID onsets/ends, intrastate on/off, record status
changes, births/retirements, pact entry/exit, nuclear acquisition) and overwrites continuous state from the panel
where observed. The same state tracker that writes forecast occupancy writes the replay.

Why replay instead of a separate history builder:
- one exporter → the two schemas cannot drift;
- **replay is a test**: after each year, engine state vs panel row must agree (regime level, at_war, intrastate,
  great_power, pact set, live set). Every disagreement is an engine transition bug or a data inconsistency, listed by
  `scripts/analysis/replay-diff.mjs`, and CI fails on new ones;
- every structural variable added in phase C gets its historical series as a by-product.

### A3. Exporter (`scripts/export-frames.mjs`)

Writes `public/frames/<source>/<family>.json`, chunked by variable family (politics, conflict, capability, structure,
records, events) and loaded lazily. Sources: `record`, `fc-2025`, `fc-1900` … `fc-2005`. `run-forward.mjs` and the
replay both call it; `build-history-slice.mjs`, `build-news.mjs`, `build-alliance-slice.mjs`,
`build-presence-slice.mjs` and the `state` block of `forecast*.json` are replaced by it.

Acceptance: the viewer driven by the new files paints every view at 1870, 1942, 1989, 2025, 2040 identically to today
(`scripts/shot2.mjs` before/after, pixel diff below a threshold, differences listed and explained). Load size no
larger than today's ~8 MB on first paint.

## Phase B — the viewer on providers

`src/lib/provider.js`: `frame(source, year, {family, mode, run})` → `{entityId: value}`. Static-file implementation
first; the interface admits a later in-browser engine (web worker) for live scenarios.

- `seriesAt` loses its history/forecast branches and its per-variable special cases: one generic reducer per `kind`
  × read mode (consensus with hysteresis, sample, odds) over `dist`.
- News reads `events` from any source; forecast news = sampled run's events, or ranked hazards in consensus.
- Actual-vs-forecast = two providers over the same years (`record` and `fc-1955`), not a special column.
- Delete: the history branch in `seriesAt`, `forecastNews`/`sampleNews` split, `alliancesAt` carry-forward,
  `presenceAt` static read, `statusAt` vs `recordStateAt` split.

Acceptance: same screenshots as A3; `src/lib/data.js` shrinks; adding a variable to the registry + engine tracker
makes it paintable with no viewer edit (tested by adding one).

## Phase C — unfreeze the structure

Each step follows the repo's existing rule: template or process in data, fitted, ablatable by `ENGINE_ABLATE`, scored
by the backtest, and published in frames. Order matters — later steps read earlier ones.

| step | what becomes state | process | data | feeds |
|---|---|---|---|---|
| C1 | capability shares (`cinc` components, `pol_share`) | stochastic growth (fitted variance by size/era), war-outcome shocks (loss/gain by result), demographic drift; re-normalised to world share each year | NMC 7.0, Maddison, panel war outcomes | everything dyadic; polarity |
| C2 | `great_power`, poles, era flags | **derived**, not hazarded: GP = logistic on simulated share with entry/exit hysteresis, fitted to the CoW GP list; polarity module unchanged | CoW GP spans in `data/history/actors.yaml` | `major_power_any`, PRD filter, `great_game`, `aid_conditionality`, `cold_war` |
| C3 | alliance graph | dyad hazards: pact formation and termination (ATOP dates). Covariates: shared rival / common threat, regime similarity, GP status, contiguity, neighbour capability growth, existing pacts | ATOP 5.1 (already fetched) | `allied`, coalition joining (unblocks the candidate), `defence_pacts` |
| C4 | `world.nukes` | fit the existing `weaponization` template (≈10 events; literature priors carry it) | nuclear events in `data/history/events.yaml` | `nuclear_both`, war hazards |
| C5 | live set and borders | secession hazard (from intrastate conflict, separatist flag), absorption/union hazard; successor and contiguity edges inherited as `src/engine/core.js` already does for successors | CoW system membership, CShapes | closes the *existence* leak in backtests; decolonisation-era backtests |
| C6 | military presence | base/garrison open-close hazards on patron–host dyads | `data/presence.yaml` | `guarantor_withdrawal`, patron terms |

## Gate

Event scores alone reward freezing (less variance, better Brier). Each phase-C step is judged on both:

**Structural calibration** (new, `scripts/analysis/structure.mjs`, also written into `scores/`): simulated vs observed
per 100 world-years, per as-of year and pooled —
polarity transitions (observed 2.38; today 0.00), GP entries/exits, pact formations/terminations, nuclear
acquisitions, state births/deaths, rank correlation of capability share at +10/+20, and the spread of capability share
(the p10–p90 band must cover the realised share at the nominal rate).

**Event scores** (`scripts/backtest.mjs`, unchanged): reported beside it. A step is **promoted** when its structural
targets move inside a factor of 2 of observed and no event template's calibration (exp/obs) leaves 0.5–2. Brier/AUC
regressions are recorded in `docs/refine-log.md` with the numbers and accepted.

## Files

- new: `src/contract/{schema,vars}.js`, `src/engine/replay.js`, `src/lib/provider.js`, `scripts/export-frames.mjs`,
  `scripts/analysis/{replay-diff,structure}.mjs`, one module per phase-C process under `src/engine/`
  (`capability.js`, `alliances.js`, `membership.js`; `polarity.js` extended)
- changed: `src/engine/core.js` (tracker writes the contract; hooks for C1–C6), `scripts/run-forward.mjs`,
  `scripts/backtest.mjs` (structural block), `src/lib/data.js`, `Map.svelte`, `Panel.svelte`, `data/templates.yaml`
- retired: the four `build-*-slice.mjs` / `build-news.mjs` scripts and the old `forecast*.json` layout (kept for one
  release behind a flag for the before/after screenshots)
- docs: `docs/schema.md` (contract), `docs/ui.md` (providers, read modes), `docs/system.md` (structural gate),
  `docs/escalations.md` (close engine-8 and engine-2 when C2 lands)

## Open questions

- Replay of continuous variables: overwrite from the panel every observed year (exact, but hides drift-model error) or
  replay drift and report the residual (diagnostic). Plan: overwrite, and report the residual in `replay-diff`.
- Frame size for 300 runs × 100 years × all dyads: keep the existing dyad floor (peak P) and widen `paths` only for
  the 12 sample runs.
- C1 war-outcome shocks need a result coding (win/lose/draw) per belligerent; CoW MID has `outcome` — verify coverage
  before fitting.
