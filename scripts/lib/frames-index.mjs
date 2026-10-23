// public/frames/index.json: what frame sets exist — the record, and one entry per forecast origin. The viewer reads
// this and nothing else to find its data.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';

const PATH = 'public/frames/index.json';
export function updateIndex({ record = null, ensemble = null }) {
  mkdirSync('public/frames', { recursive: true });
  const idx = existsSync(PATH) ? JSON.parse(readFileSync(PATH, 'utf8')) : { contract: 1, record: null, ensembles: [] };
  if (record) idx.record = record;
  if (ensemble) { idx.ensembles = idx.ensembles.filter(e => e.asOf !== ensemble.asOf); idx.ensembles.push(ensemble); idx.ensembles.sort((a, b) => a.asOf - b.asOf); }
  writeFileSync(PATH, JSON.stringify(idx, null, 1));
  return idx;
}
