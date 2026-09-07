// Fit hazard templates on the historical panel + events -> data/fits.json
// Per template: MAP logistic regression (Gaussian prior centred on the literature prior), in-sample and era-holdout AUC/Brier,
// calibration deciles. Dyad templates build the dyad-year sample on the fly (alliances re-read at pair level).
// The fitting itself lives in scripts/lib/fit.mjs so scripts/backtest.mjs can refit at each as-of year (--refit).
// Run: node scripts/fit-hazards.mjs [template_id ...] [--split YEAR] [--max-year YEAR]
import { writeFileSync } from 'node:fs';
import { createFitter, loadFitInputs } from './lib/fit.mjs';

const argN = (k) => { const i = process.argv.indexOf(k); return i >= 0 ? +process.argv[i + 1] : null; };
const SPLIT_OVERRIDE = argN('--split');
const MAX_YEAR = argN('--max-year');       // fit on labels observed by this year only (what --refit does per as-of year)
const FLAGS = new Set(['--split', '--max-year']);
const only = new Set(process.argv.slice(2).filter((x, i, arr) => !FLAGS.has(x) && !FLAGS.has(arr[i - 1])));

const fitter = createFitter(loadFitInputs());
const { fits, lines } = fitter.fitAll({ only, splitOverride: SPLIT_OVERRIDE, maxYear: MAX_YEAR });
if (SPLIT_OVERRIDE == null && MAX_YEAR == null) writeFileSync('data/fits.json', JSON.stringify({ meta: { built: new Date().toISOString() }, fits }, null, 1));
console.log(lines.join('\n'));
