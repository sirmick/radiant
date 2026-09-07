# Data catalogue

Every dataset the model reads, where it comes from, what it covers, and what it feeds. Fetch with `./scripts/fetch-raw.sh` (everything lands in `data/raw/`, which is gitignored). Coverage windows matter: the backtest scores an event kind only inside its source's window (`COVERAGE` in `scripts/backtest.mjs`), and covariates are structural zeros only where the template declares it (`default_outside`).

## Historical panel and events (`data/raw/hist/`)

| dataset | file | coverage | used for | notes |
|---|---|---|---|---|
| CoW National Material Capabilities 7.0 | `nmc_7.0.csv` | 1816–2022 | `cinc`, `irst`, `milex`, `milper`, `energy_nmc`, `tpop`, `upop` | `scripts/fetch-nmc.mjs`. correlatesofwar.org answers 403 to scripts and Harvard Dataverse only carries 3.02, so the fetch decodes the `cow_nmc` data.frame shipped in the R package **peacesciencer** (documented there as NMC v7.0) with `scripts/lib/rdata.mjs` — no R needed. Falls back to `nmc_3.02.csv` if the fetch has not run; `data/panel.json` `sources.cinc` says which |
| CoW National Material Capabilities 3.02 | `nmc_3.02.csv` | 1816–2001 | fallback for the above | Harvard Dataverse. The 2002–2022 block of 7.0 revises some historical values and carries three population errors the build guard catches (FSM, ERI, GNQ — declared in `data/history/population_guard.yaml`) |
| Modern capability composite | `data/raw/wb/*.json`, `data/raw/ei/owid-energy.csv` | 2023– | `cinc` past NMC's last year, `cinc_spliced` | `scripts/lib/capability.mjs`: CINC's own share-of-system construction from five still-published indicators (milex = WDI milex/GDP × GDP; GDP PPP standing in for iron and steel; OWID primary energy; WDI population; WDI population × urban share), spliced onto CINC per actor over their last 10 overlap years. Military personnel has no open annual successor and is not represented. Composite vs CINC 1990–2016: r 0.961, log r 0.981 |
| Derived world state (no new source) | — | 1816–2024 | `pol_mass`, `pol_share`, `bipolar`, `unipolar`, `multipolar`, `n_poles`, `hegemon_share`, `is_hegemon`, `dem_share`, `cold_war`, `promotion_era`, `anticoup_norm`, `hegemon_regime`, `great_game`, `aid_conditionality` | `src/engine/polarity.js`, run by both `build-panel.mjs` and the engine. Projection-weighted capability share = geometric mean of the CINC share and the military-expenditure share (CoW milex to 2022, WDI after), EWMA λ = 0.75; poles are the actors above the first 2× gap. Derived eras: bipolar 1950–1994, unipolar 1995–2014, bipolar 2015–. The typed calendar versions are kept one run as `*_dates`. `panel.meta.polarity` is the world-level series and `panel.meta.info_wave` the fitted information-diffusion wave |
| CoW Militarized Interstate Disputes 3.02 | `mida_3.021.csv`, `midb_3.02.csv` | 1816–2001 | dyadic `mid_force` (hostility ≥ 4) and `mid_war` (5) events, per-pair dispute years, rivalry trace | Dataverse |
| CoW Formal Alliances 3.03 (dyadic) | `alliance_v303_dyadic.csv` | 1816–2000 | defence pacts (`sstype 1`): `defence_pacts`, `pact_usa`, `pact_rus`, dyad `allied`; the map's alliance layer, carried forward past 2000 and labelled | Dataverse |
| Maddison Project (via OWID) | `maddison.csv` | 1820–2022 | `gdp_pc`, `gdp_growth`, `log_gdp_pc` | 2011 intl $; empire-wide series derived per package 5 |
| OWID population | `population.csv` | 1816–2023 | `population` | HYDE / Gapminder / UN; modern-borders series dropped for empires (`successor_borders_until`) in favour of NMC `tpop` |
| V-Dem Regimes of the World (via OWID) | `regime.csv` | 1789–2025 | `regime` 0–3, regime steps (events), regime templates | occupation years are not regime change (era-2 fix) |
| V-Dem Episodes of Regime Transformation | `ert.csv` | 1900–2024 | `polyarchy`; autocratization/democratization episode onsets (monitored templates) | GitHub vdeminstitute/ERT |
| REIGN 2021.8 | `reign.csv` | 1950–2021 | leader age/tenure/military, leader exits, coups (Powell–Thyne columns), irregular exits (derived: exit within 2 months of a successful coup) | the shipped `irregular` column is empty |
| UCDP/PRIO Armed Conflict 25.1 | `UcdpPrioConflict_v25_1.csv` | 1946–2024 | `intrastate` (intensity), `interstate_ucdp`, intrastate onsets | GW codes |
| CShapes 2.0 | `cshapes.geojson` | 1886–2019 | contiguity (30 km buffer), `nbr_*` neighbourhood covariates | first snapshot stands in before 1886 (declared) |
| countrycode panel | `codelist_panel.csv`, `codelist.csv` | 1816–2025 | the state universe (CoW/GW/ISO3 crosswalk, system membership spans), ISO2 for flags | GitHub vincentarelbundock/countrycode |
| OWID energy by source / coal / oil | `energy_hist.csv`, `coal_hist.csv`, `oil_hist.csv` | 1800–2025 | `energy_twh`, `oil_twh`, `coal_twh`, `lowcarbon_share`, `coal_prod`, `oil_prod` | Energy Institute + Smil |
| World Bank WDI | `data/raw/wb/*.json` | 1960–2024 | `internet_users`, `mobile_subs`, `fixed_lines` → `info_access`; `infant_mortality`, `urban_share`, `aid_gni` → `aid_conditionality`; plus the modern series (GDP, debt, trade, milex, R&D, migration, rents, water) | API, all countries |
| troopdata (DMDC rebuild) | `troopdata-rebuild-country-year.csv`, `basedata.csv` | 1950–2024; 414 US bases with coordinates | package 7 (presence) calibration | GitHub meflynn/troopdata |
| CoW war lookup (mirror) | `cow_war.csv` | — | not used (type table only) | |

## Modern series (`data/raw/wb`, `wpp`, `ei`)

| dataset | coverage | used for |
|---|---|---|
| UN World Population Prospects 2024 (medium) | 1950–2100 | population, TFR, median age, net migration, working-age and 65+ shares (age-5 file) |
| OWID energy (Energy Institute) | 1965–2024 | oil/gas/coal consumption, electricity, renewables share |
| IEA Global EV Data Explorer | 2010–2024 | EV stock share |
| World Bank WDI | 1960–2024 | 25 indicators (see `scripts/fetch-wb.mjs`) |

These feed `public/world.json` for the viewer today and the panel after the modern-fold package.

## Geometry (`data/raw/ne`, `data/geo`)

Natural Earth 50m admin-0 countries, 10m disputed areas, the CHN point-of-view countries file, marine polygons → `data/geo/world.topo.json` (TopoJSON, ~0.9 MB). Public domain.

## Hand-authored (in git, source-tagged)

| file | content |
|---|---|
| `data/history/actors.yaml` | historical entities and lifecycles: Prussia→DEU, Austria-Hungary, Ottoman→TUR, Korea, DDR, empires' successor-border notes, universe-only corrections (Hanover, Saxony…) |
| `data/history/events.yaml` | wars with participants and dates, chokepoint/corridor/territory status changes, capability firsts, nuclear acquisitions, alliances, the 2022–2026 tail |
| `data/actors.yaml` | modern snapshot: regime estimates, nuclear status, capability levels, chokepoint exposure |
| `data/corridors.yaml`, `data/territories.yaml` | dated infrastructure and contested-territory records (see schema) |
| `data/presence.yaml` | great-power bases, garrisons, fleet areas 1870–2026 |
| `data/waves.yaml` | capability waves from steam to quantum |
| `data/templates.yaml` | the generic hazard templates with priors, candidates, rejections, lifecycle records; a `retired:` list at the end |
| `data/variables.yaml` | the viewer's variable registry; `model: false` marks display-only estimates |
| `data/overrides.yaml` | values where datasets are silent (Taiwan, North Korea) |

## Built artefacts

`data/panel.json`, `data/events.json`, `data/fits.json`, `data/contiguity.json` (model); `public/world.json`, `history.json`, `news.json`, `alliances.json`, `presence.json`, `scores.json`, `forecast*.json`, `forecasts.json`, `geo.topo.json` (viewer). All reproducible from the raw data and the YAML.

## Not yet fetched (deferred in the loop)

CoW Direct Contiguity v3.2 (would fill 1816–1885 and water contiguity), CoW Intra-State War v4.1 (pre-1946 civil wars), Archigos 4.1 (pre-1950 leaders), UN General Assembly ideal points (alignment), Reinhart–Rogoff / BoC–BoE defaults, UCDP GED (georeferenced conflict, 1989→), archived WPP vintages (honest structural backtests).
