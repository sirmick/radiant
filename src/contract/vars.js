// The frame contract's variable registry (docs/plan-structure.md, A1).
//
// One declaration per variable a frame can carry. Every provider — the record (an ensemble of one, built by engine
// replay) and every forecast ensemble — writes these and only these, and the viewer and the scorer read them through
// this table rather than through per-file special cases. A variable is identified by `entity:id` (`actor:regime`).
//
//   entity     actor | dyad | record | world
//   kind       binary      value is P(1) in [0,1]                     (the record: 0 or 1)
//              categorical value is a probability vector over `levels` (the record: a level index, or a level word
//                          for open vocabularies — `levels: null`)
//              continuous  value is [p10, p50, p90]                   (the record: a single number)
//   read(w,a)  the value off an engine world state — the ONE place any provider reads state from, so a replayed world
//              and a simulated world are observed by the same code
//   coverage   [from, to] of the source the record's value comes from. Outside it the record says nothing (null) and the
//              scorer does not score: absence is not a non-event (scripts/backtest.mjs COVERAGE / OCC_COVERAGE)
//   truth      'panel:<col>' — the record reads the panel column and emits null where the panel does not observe it
//              (a carried value is not a measurement); omitted where the engine state at as-of IS the record
//   forecast   simulated | frozen — whether the engine moves it after as-of. A frozen variable is carried at its as-of
//              value in every run; the viewer and the scorer say so instead of reading its band as a forecast
//   positive   continuous only: quantiles are taken over values > 0 (a share of 0 is "not in the distribution")

export const REGIME_LEVELS = [0, 1, 2, 3];
export const REGIME_LABELS = ['closed autocracy', 'electoral autocracy', 'electoral democracy', 'liberal democracy'];
export const POLARITY_LEVELS = ['multipolar', 'bipolar', 'unipolar'];

const lvl = (x, n) => (x == null ? null : Math.max(0, Math.min(n - 1, Math.round(x))));

export const VARS = [
  // ---- actor
  { id: 'live', entity: 'actor', kind: 'binary', label: 'in the system', family: 'politics', forecast: 'simulated',
    read: () => 1, note: 'membership: read from the dated system membership inside the panel window; past it the universe stands as it is' },
  { id: 'regime', entity: 'actor', display: { format: '.0f', unit: '0 closed … 3 liberal' }, kind: 'categorical', levels: REGIME_LEVELS, labels: REGIME_LABELS, label: 'Regime (V-Dem RoW)', family: 'politics', forecast: 'simulated',
    truth: 'panel:regime', coverage: [1816, 2025], read: (w, a) => lvl(a.cur.regime, 4) },
  { id: 'polyarchy', entity: 'actor', display: { format: '.2f', unit: 'V-Dem' }, kind: 'continuous', label: 'Electoral democracy index', family: 'politics', forecast: 'simulated',
    truth: 'panel:polyarchy', coverage: [1900, 2025], read: (w, a) => a.cur.polyarchy ?? null, note: 'the engine moves it by ±0.1 on a regime step; between steps it is held' },
  { id: 'at_war', entity: 'actor', display: { format: '.0f', unit: 'flag' }, kind: 'binary', label: 'At war (interstate)', family: 'conflict', forecast: 'simulated',
    truth: 'panel:at_war', coverage: [1816, 2024], read: (w, a) => (a.cur.at_war ? 1 : 0) },
  { id: 'intrastate', entity: 'actor', display: { format: '.0f', unit: 'UCDP intensity' }, kind: 'categorical', levels: [0, 1, 2], labels: ['none', 'minor', 'war'], label: 'Internal armed conflict', family: 'conflict', forecast: 'simulated',
    truth: 'panel:intrastate', coverage: [1946, 2024], read: (w, a) => lvl(a.cur.intrastate ?? 0, 3),
    note: 'the engine writes level 1 and never 2 (intrastate_onset has no intensity): level 2 forward is a carried as-of spell, not a forecast' },
  { id: 'occupied', entity: 'actor', display: { format: '.0f', unit: 'flag' }, kind: 'binary', label: 'Occupied', family: 'conflict', forecast: 'frozen',
    truth: 'panel:occupied', coverage: [1816, 2025], read: (w, a) => (a.cur.occupied ? 1 : 0), note: 'occupation is data, not a hazard: carried from as-of' },
  { id: 'great_power', entity: 'actor', display: { format: '.0f', unit: 'flag' }, kind: 'binary', label: 'Major power (CoW)', family: 'structure', forecast: 'simulated',
    truth: 'panel:great_power', coverage: [1816, 2025], read: (w, a) => (a.cur.great_power ? 1 : 0), note: 'fitted entry/exit transitions on the moved capability share (src/engine/greatpower.js, C2)' },
  { id: 'nuclear', entity: 'actor', display: { format: '.0f', unit: 'flag' }, kind: 'binary', label: 'Nuclear weapons', family: 'structure', forecast: 'simulated',
    coverage: [1816, 2026], read: (w, a) => (w.nukes?.has(a.id) ? 1 : 0), note: 'world.nukes at as-of, then the fitted acquisition hazard (src/engine/nuclear.js, C4); disarmament is not modelled' },
  { id: 'gdp_pc', entity: 'actor', display: { format: '.3s', unit: '2011 intl $', log: true }, kind: 'continuous', label: 'GDP per capita (Maddison)', family: 'economy', forecast: 'simulated', positive: true,
    truth: 'panel:gdp_pc', coverage: [1820, 2022], read: (w, a) => a.cur.gdp_pc ?? null },
  { id: 'info_access', entity: 'actor', display: { format: '.0%', unit: '0–1' }, kind: 'continuous', label: 'Information access', family: 'economy', forecast: 'simulated', positive: true,
    truth: 'panel:info_access', coverage: [1960, 2024], read: (w, a) => a.cur.info_access ?? null },
  { id: 'cinc', entity: 'actor', display: { format: '.2%', unit: 'share of world', log: true }, kind: 'continuous', label: 'Capability (CINC)', log: true, family: 'capability', forecast: 'simulated', positive: true,
    truth: 'panel:cinc', coverage: [1816, 2024], read: (w, a) => a.cur.cinc ?? null, note: 'moved by each actor\'s simulated total output growth and renormalised (C1, src/engine/core.js:stepCinc) — an assumption: CINC tracks output only loosely' },
  { id: 'pol_share', entity: 'actor', display: { format: '.2%', unit: 'share of world', log: true }, kind: 'continuous', label: 'Projected capability share', log: true, family: 'capability', forecast: 'simulated', positive: true,
    truth: 'panel:pol_share', coverage: [1816, 2024], read: (w, a) => a.cur.pol_share ?? null },
  { id: 'wave_share', entity: 'actor', display: { format: '.2%', unit: 'share of world', log: true }, kind: 'continuous', label: 'Capability (wave share)', log: true, family: 'capability', forecast: 'simulated', positive: true,
    truth: 'panel:wave_share', coverage: [1816, 2024], read: (w, a) => a.cur.wave_share ?? null },
  { id: 'wave_attained', entity: 'actor', display: { format: '.0%', unit: 'displacement-weighted share of live waves' }, kind: 'continuous', label: 'Waves attained', family: 'capability', forecast: 'simulated', positive: true,
    truth: 'panel:wave_attained', coverage: [1816, 2024], read: (w, a) => a.cur.wave_attained ?? null },
  { id: 'industry_share', entity: 'actor', display: { format: '.2%', unit: 'share of world output', log: true }, kind: 'continuous', label: 'Industrial share', log: true, family: 'capability', forecast: 'simulated', positive: true,
    truth: 'panel:industry_share', coverage: [1816, 2024], read: (w, a) => a.cur.industry_share ?? null },
  // population is moved by the engine deterministically (each actor's own trailing growth), so it is carried as a
  // simulated series: the map sizes labels by it after the seam as well as before
  { id: 'population', entity: 'actor', kind: 'continuous', label: 'Population', display: { format: '.3s', unit: 'persons', log: true }, family: 'economy', forecast: 'simulated', positive: true,
    truth: 'panel:population', read: (w, a) => a.cur.population ?? null },
  // ---- display-only panel columns: observed by the record, never simulated. A forecast frame set does not carry them
  // (`forecast: 'carried'`); a reader past the record's end carries the last observation and says how stale it is.
  ...[
    ['libdem', 'Liberal democracy index', { format: '.2f', unit: 'V-Dem' }, 'politics'],
    ['irst', 'Iron & steel production', { format: '.3s', unit: 'kt', log: true }, 'industry'],
    ['energy_twh', 'Primary energy', { format: '.3s', unit: 'TWh', log: true }, 'industry'],
    ['leader_age', 'Leader age', { format: '.0f', unit: 'years' }, 'politics'],
    ['leader_tenure', 'Leader tenure', { format: '.1f', unit: 'years' }, 'politics'],
    ['infant_mortality', 'Infant mortality', { format: '.0f', unit: 'per 1000' }, 'economy'],
    ['urban_share', 'Urban share', { format: '.0f', unit: '%' }, 'economy'],
    ['electricity_generation', 'Electricity generation', { format: '.3s', unit: 'TWh', log: true }, 'industry'],
    ['renewables_share_elec', 'Renewables share of electricity', { format: '.0f', unit: '%' }, 'industry'],
    ['manuf_va', 'Manufacturing value added', { format: '.3s', unit: 'current US$', log: true }, 'industry'],
    ['hitech_exports', 'High-tech exports', { format: '.3s', unit: 'current US$', log: true }, 'industry'],
    ['rd_gdp', 'R&D spending', { format: '.2f', unit: '% of GDP' }, 'industry'],
    ['milex', 'Military expenditure (CoW)', { format: '.3s', unit: 'thousand US$', log: true }, 'capability'],
  ].map(([id, label, display, family]) => ({ id, entity: 'actor', kind: 'continuous', label, display, family, forecast: 'carried', truth: `panel:${id}`, read: (w, a) => a.cur[id] ?? null })),
  // ---- dyad (sparse: a pair absent from a year is 0)
  { id: 'at_war', entity: 'dyad', kind: 'binary', label: 'Pair at war', family: 'conflict', forecast: 'simulated', coverage: [1816, 2010],
    note: 'truth: the merged dyadic war spells src/engine/termination.js:warSpells builds from data/events.json' },
  { id: 'allied', entity: 'dyad', kind: 'binary', label: 'Defence pact', family: 'structure', forecast: 'simulated', coverage: [1816, 2026],
    note: 'the dated pact graph (scripts/lib/hist.mjs:loadPacts) at as-of, moved by fitted formation / dissolution hazards (src/engine/alliances.js, C3)' },
  // ---- record (corridors, chokepoints, territories)
  { id: 'status', entity: 'record', kind: 'categorical', levels: null, label: 'Status', family: 'records', forecast: 'simulated', coverage: [1869, 2025],
    note: 'open vocabulary: the status words of data/corridors.yaml and data/territories.yaml; control transfer is not simulated' },
  // ---- world
  { id: 'polarity', entity: 'world', kind: 'categorical', levels: POLARITY_LEVELS, label: 'Polarity', family: 'structure', forecast: 'simulated', coverage: [1816, 2024],
    read: (w) => (w.pol?.state ? POLARITY_LEVELS.indexOf(w.pol.state.polarity) : null), note: 'src/engine/polarity.js over projected capability shares' },
  { id: 'n_poles', entity: 'world', kind: 'continuous', label: 'Poles', family: 'structure', forecast: 'simulated', coverage: [1816, 2024], read: (w) => w.pol?.state?.n_poles ?? null },
  { id: 'hegemon', entity: 'world', kind: 'categorical', levels: null, label: 'Top pole', family: 'structure', forecast: 'simulated', coverage: [1816, 2024], read: (w) => w.pol?.state?.hegemon ?? null },
  { id: 'dem_share', entity: 'world', kind: 'continuous', label: 'Democratic share of states', family: 'politics', forecast: 'simulated', coverage: [1900, 2024], read: (w) => w.pol?.demShare ?? null },
];

export const varKey = (v) => `${v.entity}:${v.id}`;
/** The variables an ensemble carries: everything the engine moves or holds (display-only columns are carried by readers). */
export const ENSEMBLE_VARS = () => VARS.filter(v => v.forecast !== 'carried').map(varKey);
export const VAR = Object.fromEntries(VARS.map(v => [varKey(v), v]));
export const varsOf = (entity) => VARS.filter(v => v.entity === entity);
/** The registry as published in a frame file's meta: everything but the reader functions. */
export function publishVars() {
  return Object.fromEntries(VARS.map(v => { const { read, ...rest } = v; return [varKey(v), rest]; }));
}
