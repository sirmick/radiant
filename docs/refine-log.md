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

---

## Turn era-1870-1914 — 2026-09-06

Lenses: data, corridors, statistics, engine (24 findings). Backtest re-run: `node scripts/backtest.mjs --from 1870 --to 1910 --step 10 --horizon 20 --runs 100 --universe all` → `scores/backtest-1870-1910-h20-all.json`, compared against the same as-of rows in `scores/backtest-1870-2010-h20-all.json`. A regression check outside the turn was run for 1950–2000 (`scores/backtest-1950-2000-h20-all.json`, overwritten; the previous file is in git at `5b6ab0c`).

### Applied

| finding | change | files |
|---|---|---|
| data/1, statistics/1a, engine/4 | `aid_conditionality` is a **structural zero** outside 1992–2016, not a null: `build-panel.mjs` emits 0 for every actor-year outside the promotion era (null only inside it when `aid_gni` is missing), and `core.stepYear` drops the `aid_gni != null` guard. This alone was killing every regime template before 1960. | `scripts/build-panel.mjs`, `src/engine/core.js` |
| statistics/1b | New covariate field `default_outside: { window, value, source }`, honoured by `fit-hazards.rawValue`, `core.featureActor` and `backtest.hasCoverage`. Applied to `intrastate` (UCDP 1946–2024) on `autocratization_onset`, `autocratize_step`, `democratic_deepening`, `autocratic_closure`. The imputation is declared in the template with its source, not hidden in the panel. | `data/templates.yaml`, `scripts/fit-hazards.mjs`, `src/engine/core.js`, `scripts/backtest.mjs` |
| data/4 | `loadActors` keeps the codelist's **interior gaps**: actors carry `spans: [[from,to), …]` and `isLive` is span membership, not `[min,max]`. Ten colonised states (DZA, TUN, MMR, MDG, LBY, VNM, MAR, AFG, KOR, EGY) leave the universe while they are colonies. | `scripts/lib/hist.mjs`, `data/history/actors.yaml` |
| data/4 | Hand lifecycle corrections where the codelist's GW span outlives CoW membership: HANOVER → 1866, SAXONY → 1867, MECKLENBURG_SCHWERIN → 1867, VAT (Papal States) → 1860. Entries are `modeled: false` (fit sample and dyad universe, not simulated). | `data/history/actors.yaml` |
| data/5 | EGY gets `spans: [[1855,1883],[1922,null]]` — the Khedivate is a CoW/GW member and the host of the Suez corridor; its 13 NMC capability rows now reach the world (`EGY.cinc[1875] = 0.0053`). | `data/history/actors.yaml` |
| data/3, engine/5 | `great_power` advances during a run from the dated CoW major-power list (the same class of fact as introduced/retired), so USA and JPN become major powers inside a horizon that crosses 1898/1895. Verified: world at as-of 1890, +20y → `USA.great_power = 1`, `JPN.great_power = 1`. `cinc` stays frozen (reading a capability index forward is an outcome, not a list). | `src/engine/core.js` |
| engine/1 | Actors are **born and retired during a run** from `panel.live`, with the successor inheriting the dyadic rivalry memory. Verified: as-of 1870 + 20y → PRUSSIA gone, DEU present. `backtest.mjs` scores dyads over every actor live at any point in the horizon, so truth involving actors born inside it (DEU, POL, TUR, the Baltics) is scored instead of silently dropped. | `src/engine/core.js`, `scripts/backtest.mjs` |
| engine/3 | `applyActorEvent` gains `autocratic_closure`, `liberal_erosion`, `democratic_deepening` rewrites (previously ~64 regime moves per run changed nothing), plus a `HANDLED` guard that throws if a simulated template has no rewrite. | `src/engine/core.js` |
| statistics/7 | Alliance and border graphs are **frozen at as-of** (`world.allied`, `world.contiguous`) instead of being read forward on their historical dates. For an as-of before the contiguity source starts (CShapes 2.0 begins 1886) the first available snapshot stands in — a documented imputation, recorded in `data/templates.yaml`; without it 15 of the 20 forecast years at as-of 1870 have every non-major dyad at hazard 0. | `src/engine/core.js`, `scripts/backtest.mjs`, `data/templates.yaml` |
| statistics/2 | Every scored row now carries `n_at_risk`, `auc_at_risk` and `n_structural_miss`. The turn's headline dyadic AUCs (0.85–0.95) are mostly the relevance filter: at-risk AUC is 0.58 (1870), 0.67 (1880), 0.75 (1890), 0.72 (1900), 0.65 (1910). | `scripts/backtest.mjs`, `docs/system.md` |
| statistics/1c | A template with no at-risk unit is reported (`n: 0`, `reason`) instead of vanishing from `byAsOf`; actor-year rows with `n_at_risk < 10` are marked `underpowered` and kept out of the pooled summary (liberal_erosion at n=2/n=4 was setting a pooled number). | `scripts/backtest.mjs` |
| data/6 (partial) | Successor-border population series dropped for the multinational empires via `successor_borders_until` in `data/history/actors.yaml` (AUT_HUN, OTTOMAN, PRUSSIA, RUS pre-1918): 365 actor-years where OWID modern-borders population contradicted CoW NMC `tpop` by up to 8×. `build-panel` now prints the remaining population/tpop disagreement (900/11858 rows > 30%). `gdp_pc` is **not** dropped — see escalations. | `scripts/build-panel.mjs`, `data/history/actors.yaml` |
| corridors/1, data/8 | Every corridor and territory record carries a dated `history: [{year, status/controller, source}]`; the 2026 `status`/`controller` is now explicitly the snapshot. 27 new corridor records so that **every** `kind: corridor`/`chokepoint` event id resolves. `build-events.mjs` and `build-world.mjs` fail the build on an unresolvable corridor/chokepoint/territory id or a record with no history. `controller`, `sponsor`, `capacity`, `mode: cable` and `status: abandoned` added to the schema. | `data/corridors.yaml`, `data/territories.yaml`, `scripts/build-events.mjs`, `scripts/build-world.mjs`, `docs/schema.md` |
| corridors/2 | Suez 1869–1914 goes from one row to five: opening (1869.87), the British share purchase (1875.86), Tel el-Kebir and the occupation (1882.70), the Convention of Constantinople (1888.82), the Entente (1904.29) — with `controller` OTTOMAN → GBR. EGY is now a live actor for the era (data/5), so `transits: [EGY]` resolves. | `data/history/events.yaml`, `data/corridors.yaml` |
| corridors/3 | Turkish Straits 1877–1913: the Russo-Turkish restriction, the **Dardanelles closure of Apr–May 1912** (the one in-era closure whose `adjacent_war` covariate would fire, against the italo_turkish war already in the file), the Balkan-war contestation and the 1913 reopening. Chokepoint events in 1869–1914: 2 → 16. | `data/history/events.yaml`, `data/corridors.yaml` |
| corridors/4 | Cable corridors added as a first-class mode: `eastern_telegraph`, `all_red_pacific`, `german_atlantic_cables`, `spanish_colonial_cables`, with the two denial events (Manila/Cienfuegos 1898.35, CS Alert 1914.60). `waves.yaml telegraph_cable.saturates` corrected 1880 → 1910 with the reason: routing concentration is a corridor property, not a diffusion one. | `data/corridors.yaml`, `data/history/events.yaml`, `data/waves.yaml`, `docs/schema.md` |
| corridors/5 | Manchurian rail complex: `chinese_eastern_railway`, `south_manchuria_railway` (controller RUS → JPN at Portsmouth 1905.68), `trans_siberian` with dated `capacity` (0.3 single track 1904 → 0.7 in 1916), and the `liaodong_port_arthur` territory. | `data/corridors.yaml`, `data/territories.yaml`, `data/history/events.yaml` |
| corridors/6 | 16 territory events dated ≤1914 (was 0) and 13 new territory records with history: Alsace-Lorraine, Bosnia (1878 occupation, 1908 annexation), Cyprus, Tunisia, Egypt, Heligoland, Kiaochow, Liaodong, Weihaiwei, the Philippines, the Canal Zone, Korea, Libya. The dangling `golan_buffer_2025` event id is renamed to the record it meant (`syria_buffer`). | `data/territories.yaml`, `data/history/events.yaml` |
| corridors/7 | Berlin–Baghdad becomes a record with `sponsor: DEU`, `load_bearing_for` and seven dated rows including the **Anglo-German convention of 15 Jun 1914** that settled the dispute six weeks before the DEU\|GBR war. The note now states the dampener as a test, not a conclusion. | `data/corridors.yaml`, `data/history/events.yaml` |
| corridors/8 | `status: abandoned` added and used for Panama 1889.1 (and Cape-to-Cairo); Panama 1881 building / 1904 US takeover; Kiel's 1907–1914.48 widening; trans_caspian, uganda_railway, cape_bulawayo, gotthard_tunnel, simplon_tunnel, baku_batumi_rail. Corridor+chokepoint events in 1869–1914: 9 → 48. | `data/history/events.yaml`, `data/corridors.yaml`, `docs/schema.md` |

### Before / after — the turn's as-of rows

`brier` lower is better; `auc@risk` is new (no baseline). `n` changes because the actor universe lost fictional colonial actors (data/4) and gained actors born inside the horizon (engine/1).

| as-of | template | n | exp | obs | Brier | AUC | AUC@risk | miss0 |
|---|---|---|---|---|---|---|---|---|
| 1870 | mid_force | 1770 → 1653 | 43.8 → 57.9 | 22 → 27 | 0.0150 → 0.0193 | 0.847 → 0.875 | 0.583 | 4 |
| 1870 | mid_war | 1770 → 1653 | 21.7 → 25.9 | 7 → 9 | 0.0056 → 0.0077 | 0.731 → 0.827 | 0.525 | 2 |
| 1880 | mid_force | 1485 → 1431 | 54.9 → 63.2 | 38 → 38 | 0.0232 → 0.0239 | 0.900 → 0.946 | 0.674 | 0 |
| 1880 | mid_war | 1485 → 1431 | 25.3 → 28.5 | 16 → 18 | 0.0113 → 0.0134 | 0.761 → 0.820 | 0.612 | 4 |
| 1890 | mid_force | 1485 → 1596 | 68.1 → 77.3 | 52 → 53 | 0.0314 → 0.0303 | 0.830 → 0.853 | 0.748 | 10 |
| 1890 | mid_war | 1485 → 1596 | 29.9 → 34.5 | 21 → 21 | 0.0147 → 0.0136 | 0.755 → 0.848 | 0.729 | 4 |
| 1900 | mid_force | 1485 → 2211 | 94.5 → 94.5 | 87 → 109 | 0.0410 → 0.0367 | 0.906 → 0.852 | 0.719 | 22 |
| 1900 | mid_war | 1485 → 2211 | 39.6 → 39.6 | 41 → 62 | 0.0226 → 0.0240 | 0.886 → 0.827 | 0.712 | 15 |
| 1900 | democratize_step | — → 33 | — → 17.2 | — → 13 | — → 0.265 | — → 0.513 | 0.513 | 0 |
| 1900 | autocratic_closure | — → 15 | — → 9.0 | — → 4 | — → 0.268 | — → 0.818 | 0.818 | 0 |
| 1900 | democratic_deepening | — → 1 | — → 0.1 | — → 0 | — → 0.005 | — | — | underpowered |
| 1910 | mid_force | 1830 → 2415 | 95.8 → 88.4 | 89 → 114 | 0.0357 → 0.0364 | 0.903 → 0.861 | 0.652 | 20 |
| 1910 | mid_war | 1830 → 2415 | 40.4 → 36.5 | 46 → 55 | 0.0205 → 0.0206 | 0.885 → 0.841 | 0.633 | 11 |
| 1910 | democratize_step | — → 31 | — → 14.9 | — → 15 | — → 0.255 | — → 0.583 | 0.583 | 0 |
| 1910 | autocratic_closure | — → 19 | — → 10.2 | — → 6 | — → 0.221 | — → 0.865 | 0.865 | 0 |
| 1910 | liberal_erosion | 4 → 4 | 0.9 → 0.8 | 2 → 2 | 0.348 → 0.315 | 0.250 → 0.750 | 0.750 | underpowered |

Fit samples (`data/fits.json`): democratize_step n 4288 → 6981 / events 205 → 312; autocratic_closure 4112 → 5828 / 164 → 249; democratic_deepening 1544 → 1965 / 12 → 30. All three now have rows in the 1900s and 1910s.

**Reading the deltas honestly.** Three of the four score movements are corrections, not gains:
- The as-of 1900/1910 dyadic AUC falls (0.906 → 0.852, 0.903 → 0.861) because 22 and 25 observed dyads that were previously *unscorable* — one party was born inside the horizon — are now in the sample, and because the fictional colonial actors that supplied free true negatives are gone. Brier at 1900 improves (0.0410 → 0.0367); the model is not better at ranking, it is being asked a harder and more complete question.
- The as-of 1870/1880 expected counts rise (43.8 → 57.9) because the pre-1886 border hole is now filled by the 1886 snapshot instead of leaving every non-major dyad at hazard 0 for 15 of 20 years. The over-prediction (exp/obs 2.15) was always there; it was hidden behind forced zeros.
- Three regime templates appear at as-of 1900/1910 for the first time, scoring against events the model previously assigned p = 0 by construction. They are badly calibrated (autocratic_closure exp/obs 1.92); a template that appears and is wrong is strictly better than one that is silently absent.
- 1950–2000 regression check: `autocratic_closure` skill +0.09 → +0.15, AUC 0.68 → 0.73; `democratic_deepening` now scored at all (n=102, skill +0.16); `democratize_step` skill −0.01 → −0.09 and `liberal_erosion` AUC 0.71 → 0.59 — both are consequences of engine/3: the three regime templates now actually move `regime`, so the at-risk sets churn during a run instead of standing still. `mid_force` skill 0.158 → 0.131 on a sample that grew 65k → 92k rows for the same reason as the era rows.

### Skipped

| finding | reason |
|---|---|
| engine/6 (window) | Checked and **not a bug**: `dyadRecent > world.year - 6` reads years y−5…y−1 (the same-year write happens after the draw), which is exactly the fitted `win5`; the as-of seeding `e.year > asOf − 5` gives asOf−4…asOf, which is the same window at the first step. No change made. The recurrence *amplification* it also reports is real and escalated. |
| statistics/5 (collider) | Real, and the measured coefficient shift (contiguous +0.97 → +1.79, major_power_any +0.11 → +1.38) is recorded here — but re-specifying the dyad estimation sample with a case-control offset changes every dyadic number in the model, and the pre-1886 contiguity hole (deferred below) is exactly the region the sampler would draw from. Deferred to the turn after the contiguity backfill lands. |
| data/4 (id rename) | `VAT` → `PAPAL_STATES` not done: the id keys the panel, events and contiguity outputs. The lifecycle is corrected (live 1816–1860) and the record documents the conflation with Vatican City. |
| data/6 (empire GDP) | Only the population half is fixed. Empire-wide `gdp_pc` needs a derived series; dropping Austria-borders `gdp_pc` would remove AUT_HUN from every regime template. Escalated. |

### Deferred (needs a fetch this environment cannot make)

| finding | dataset | note |
|---|---|---|
| data/2, statistics/3, engine/2 | **CoW Direct Contiguity v3.2** (`contdir.csv`, 1816–2016, land + water classes 1–5) — <https://correlatesofwar.org/data-sets/direct-contiguity/> | Would end the 1816–1885 dyad hole (134 mid_force + 106 mid_war events outside the fit) and mark the water pairs CShapes' 30 km land buffer can never see (CHN\|JPN, ESP\|USA, JPN\|KOREA). `correlatesofwar.org` answers curl with HTTP 403; the UC Davis mirror does not resolve; `paulhensel.org` paths 404. Interim: the engine freezes borders at as-of and stands the 1886 snapshot in for earlier as-of years, and the template notes say so. |
| data/1 (second half) | **CoW Intra-State War v4.1** (1816–2007) | `intrastate` before 1946 is currently a declared `default_outside` imputation of 0, not an observation. The real series would replace the imputation. Note `data/raw/hist/cow_war.csv` is only the war-type lookup table (740 rows, no years) and cannot serve. |
| data/7 | **Archigos 4.1** (leader-level, 1875–2015) | Would give `leader_exit`, `irregular_exit` and `coup_attempt` any pre-1950 coverage at all; `data/templates.yaml` already cites it as a source. Until then those templates are correctly absent from the era rows. |

### Escalated

`corridors/1 + engine/8 + statistics/8` (corridor-year panel unit and the corridor dampener), `statistics/6` (pre-1946 era term), `statistics/4` (rolling-origin refit), `engine/7` (nested mid_war and war duration), `engine/6` (rivalry decay), `data/6` (empire-wide series). See `docs/escalations.md`.

*Rule fix noticed during the audit (pre-existing, not from a finding): `src/engine/core.js` read `world.actors.USA.cur.regime` for `hegemon_x_client`, the one country id in a file whose header forbids them. It now reads the panel's `hegemon_regime` variable. The covariate is `candidate`-only, so no fit changes.*

### Checker — 2026-09-06

Independent verification of `49bbd3c`. Build green and byte-reproducible (`build-panel` → `build-events` → `fit-hazards` → `backtest` reproduce the committed `panel.json`, `events.json`, `fits.json` and `scores/backtest-1870-1910-h20-all.json` to the digit; only `meta.built`/`ms` differ). Tests rerun and passing: data/1 guard (0 null `aid_conditionality` on live pre-1992 actor-years), data/3 (as-of 1890 +20y → USA/JPN `great_power = 1`), data/4 (HANOVER/SAXONY/MECKLENBURG_SCHWERIN/VAT and the ten colonised states all `live = 0` in the asserted windows), data/5 (EGY live 1870–1882, `cinc[1875] = 0.0053`), data/8 (build-events exits 1 on an injected dangling id), corridors/1–8 (0 dangling ids, 0 records without history, suez 5 rows, 16 chokepoint and 49 corridor+chokepoint events 1869–1914 with 1 abandoned, 16 territory events ≤1914), engine/1 (PRUSSIA → DEU at 1871), engine/3+4 (7 regime falls and 7 rises in an as-of 1900 run; mean regime 0.586 ≠ 0.509), statistics/2 (auc_at_risk 0.583 at as-of 1870), statistics/7 (allied and contiguous sets identical at as-of 1870 and 1885; 123 border pairs).

One break found and fixed (`47152c2`): `stepLifecycle` read `panel.live[y − Y0]` past the panel's last year, where it is `undefined`, so `run-forward.mjs` (as-of 2025, +40y) retired every actor at its first step — `public/forecast.json` rebuilt to 0 dyads and no hazards. The backtest caps its horizon at the panel end and was unaffected, so the turn's scores stand. Guarded and the forecast regenerated at the same 300 × 40y parameters.

Two things for the next adversary. (1) **Newborn actors are seeded from post-as-of observations**: `stepLifecycle` builds an actor born at year *y* from `panel[y]`, so in an as-of 1870 run DEU enters in 1871 with its *observed* 1871 `cinc` (0.1198) and regime. At as-of 1900 that is 18 of the 67 dyad actors. It is a leak in the direction of better scores and should be replaced by a state derived from the predecessor or from as-of-time information. (2) **Unexplained out-of-turn regression**: in the 1950–2000 check `irregular_exit` pooled skill fell −0.076 → −0.136 (AUC 0.772 → 0.783); the log explains `democratize_step` and `liberal_erosion` as engine/3 consequences but not this one.
