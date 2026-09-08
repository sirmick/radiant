// Military presence as a dated layer — bases, garrisons, fleet stations and advisor missions (data/presence.yaml).
// This module is the ONLY place those records become numbers, and it is imported by scripts/build-panel.mjs (the
// actor-year columns), scripts/lib/fit.mjs (the dyad and record-year features) and src/engine/core.js (the simulated
// world), so the sample the coefficients are estimated on and the state the hazard is drawn from cannot drift apart.
// No country names anywhere: every id comes out of the record.
//
// A record is { actor, host | 'sea:<area>', kind, level 1-3, from, to, geometry: [lon, lat] }. Two conventions, both
// load-bearing and both stated rather than implied:
//   * a station is present in year y iff from <= y < to (to = null means still present). `to` is the year the presence
//     ENDED, so the year a garrison leaves is a year without it — which is what makes a withdrawal visible in the year
//     the source dates it rather than the year after.
//   * `covers` is the layer's own coverage claim (the file's header: great-power stations 1870-2026). Outside it the
//     columns are null, not zero: the absence of a record before 1870 is not an observation that nothing was there.

// Every constant here is a stated choice, not a fitted one. `covers` is read off the source; the other four are
// `estimate` in the sense agent/implementer.md means it — a number with a reason and no measurement behind it.
export const PRESENCE = {
  // source: data/presence.yaml's own header, "dated great-power stations 1870-2026". Outside it the file has records
  // (the earliest is 1816) but no claim to completeness, so the derived columns are null there rather than zero.
  covers: [1870, 2026],
  // estimate: the package's stated "in the last 3 years", with the fall year itself inside the window. The falsifiers
  // it was written around sit at 0 years (a canal closing the year the garrison left) and 3 (a rival's move three
  // years after a base closed), so the window is the package's claim and not a fit; a sweep would need more than the
  // 10 record-layer transitions that carry the term.
  window: 3,
  // estimate: the level at which a station is a patron's tripwire rather than an outpost — data/presence.yaml's own
  // scale calls 2 "base or brigade-scale" and 1 "outpost/advisors", and against Troopdata the two levels are a median
  // of 6,518 and 898 troops.
  patron_min: 2,
  // estimate: the package's "~1,500 km". A day's steaming for a carrier group and roughly the radius inside which a
  // 20th-century fleet or air base is the thing that keeps a strait open.
  radius_km: 1500,
  // estimate: a per-power panel column needs enough distinct land hosts to have cross-sectional variance. At 5 the
  // layer gives six powers (35, 24, 21, 14, 7 and 5 hosts) and folds the four with 1-3 hosts into presence_any.
  min_hosts: 5,
};

const SEA = (h) => typeof h === 'string' && h.startsWith('sea:');
/** Present in year y: [from, to) — see the note above on why `to` is exclusive. */
export const activeAt = (rec, y) => y >= rec.from && (rec.to == null || y < rec.to);

/**
 * Index the records once: per host a per-power level series, plus the flat list for the geometric (guarantor) query.
 * `years` is the span the series cover; outside `PRESENCE.covers` every accessor returns null.
 */
export function presenceIndex(records, { y0 = 1816, y1 = 2026 } = {}) {
  const n = y1 - y0 + 1;
  const byHost = new Map();          // host -> Map(power -> Int8Array[n])  (the MAX level, the host-level ordinal)
  const recordsByHost = new Map();   // host -> [record]                    (the raw stations, for the guarantor sums)
  const hostsOf = new Map();         // power -> Set(land hosts)
  for (const rec of records) {
    if (rec.level == null || rec.from == null) throw new Error(`presence: a record needs actor, host, level and from (${JSON.stringify(rec)})`);
    if (!SEA(rec.host)) (hostsOf.get(rec.actor) ?? hostsOf.set(rec.actor, new Set()).get(rec.actor)).add(rec.host);
    (recordsByHost.get(rec.host) ?? recordsByHost.set(rec.host, []).get(rec.host)).push(rec);
    const h = byHost.get(rec.host) ?? byHost.set(rec.host, new Map()).get(rec.host);
    const arr = h.get(rec.actor) ?? h.set(rec.actor, new Int8Array(n)).get(rec.actor);
    for (let y = Math.max(y0, Math.floor(rec.from)); y <= y1; y++) { if (!activeAt(rec, y)) continue; const i = y - y0; if (rec.level > arr[i]) arr[i] = rec.level; }
  }
  const powers = [...new Set(records.map(r => r.actor))].sort();
  return {
    y0, y1, byHost, recordsByHost, powers, records,
    // the powers that carry their own panel column: enough distinct land hosts for the column to vary across actors
    columnPowers: powers.filter(p => (hostsOf.get(p)?.size ?? 0) >= PRESENCE.min_hosts),
    hostCount: Object.fromEntries(powers.map(p => [p, hostsOf.get(p)?.size ?? 0])),
  };
}

export const covered = (y) => y >= PRESENCE.covers[0] && y <= PRESENCE.covers[1];
const at = (index, host, power, y) => {
  const h = index.byHost.get(host); if (!h) return 0;
  const arr = h.get(power); if (!arr) return 0;
  const i = y - index.y0; return i >= 0 && i < arr.length ? arr[i] : 0;
};

/** Level of one power's presence on one host (0 = none), null outside the layer's coverage. */
export function powerLevel(index, host, power, y) { return covered(y) ? at(index, host, power, y) : null; }
/** Max level of any power's presence on one host (0 = none), null outside coverage. */
export function hostLevel(index, host, y) {
  if (!covered(y)) return null;
  const h = index.byHost.get(host); if (!h) return 0;
  let m = 0; for (const [p] of h) { const v = at(index, host, p, y); if (v > m) m = v; }
  return m;
}
/**
 * The most recent year in [y - back, y] in which ANY power's level on this host FELL, or null. Per power rather than
 * on the host's maximum: a patron leaving as another arrives is a withdrawal for the state that lost its garrison,
 * and the host's max would hide it.
 */
export function lastFall(index, host, y, back = PRESENCE.window) {
  if (!covered(y)) return null;
  const h = index.byHost.get(host); if (!h) return null;
  let best = null;
  for (const [p] of h) for (let yy = y; yy >= y - back; yy--) {
    if (yy <= index.y0) break;
    if (at(index, host, p, yy) < at(index, host, p, yy - 1)) { if (best == null || yy > best) best = yy; break; }
  }
  return best;
}
/** The powers holding a station of at least `min` on this host. */
export function patronsAt(index, host, y, min = PRESENCE.patron_min) {
  const out = []; if (!covered(y)) return out;
  const h = index.byHost.get(host); if (!h) return out;
  for (const [p] of h) if (at(index, host, p, y) >= min) out.push(p);
  return out.sort();
}
/** host -> [powers with a station of at least `min`], for one year — built once per year by the callers. */
export function patronMap(index, y, min = PRESENCE.patron_min) {
  const m = new Map(); if (!covered(y)) return m;
  for (const [host] of index.byHost) { if (SEA(host)) continue; const ps = patronsAt(index, host, y, min); if (ps.length) m.set(host, ps); }
  return m;
}

/**
 * The dyadic patron term (operator/presence): a great power with a station of at least `patron_min` on one side's
 * territory that is tied to that side by a defence pact and not to the other. `allied(x, y)` is the pair predicate
 * and `major(id)` the great-power one; both come from the caller, so this function knows no ids of its own.
 *   patron_presence        either side has such a patron (tripwire deterrence — prior negative)
 *   patron_presence_rival  ... and the other side is itself a great power (the second form the package asks to test:
 *                          a garrison is a tripwire against the patron's peers, not a general pacifier — prior
 *                          positive). The patron is a great power by the layer's construction — data/presence.yaml
 *                          records only great-power stations — so only the other side's status is looked up, which
 *                          also keeps the term identical when the patron is outside the simulated universe.
 */
export function patronFeatures({ patrons, allied, major, a, b }) {
  let any = 0, rival = 0;
  const one = (host, other) => {
    for (const p of patrons.get(host) ?? []) {
      if (p === other || p === host) continue;
      if (!allied(p, host) || allied(p, other)) continue;
      any = 1;
      if (major(other)) rival = 1;
    }
  };
  one(a, b); one(b, a);
  return { patron_presence: any, patron_presence_rival: rival };
}

// ---------------------------------------------------------------- the guarantor of a corridor or chokepoint
const R = 6371;
const toRad = (d) => (d * Math.PI) / 180;
export function haversineKm([lon1, lat1], [lon2, lat2]) {
  const dLat = toRad(lat2 - lat1), dLon = toRad(lon2 - lon1);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}
/** The lon/lat points of a corridor record: a chokepoint is one point, a corridor the vertices of its polyline. */
export const recordPoints = (rec) => (rec.geometry?.point ? [rec.geometry.point] : (rec.geometry?.line ?? []));
/**
 * The presence records that could guarantee this corridor record: within `radius_km` of any of its points. Memoised
 * on the record (non-enumerable — a corridor record is also serialised into public/world.json and a memo must never
 * turn into published data). Hosting is checked separately, per year, because a record's transits are dated.
 */
export function guarantorCandidates(index, rec) {
  const key = `__pres_${index.y0}`;
  if (!rec[key]) Object.defineProperty(rec, key, { value: index.records.filter(p => p.geometry && recordPoints(rec).some(q => haversineKm(p.geometry, q) <= PRESENCE.radius_km)), enumerable: false });
  return rec[key];
}
/**
 * The stations that can guarantee this record: within `radius_km` of any of its points, or sitting on one of its
 * transit states. A Set, so a station that is both is counted once.
 */
function guarantorRecords(index, rec, hosts) {
  const out = new Set(guarantorCandidates(index, rec));
  for (const h of hosts ?? []) for (const p of index.recordsByHost.get(h) ?? []) out.add(p);
  return out;
}
/**
 * Per power, the WEIGHT of its force around the record in year y: the sum of its station levels there.
 *
 * A sum rather than the maximum level, which is what the package's text says and what this started as. The maximum of
 * a 1-3 ordinal saturates: it stands at 3 for 81 of the 90 chokepoint-years of the 1940s-1960s and never moves, so it
 * has no cross-sectional variance to fit and no withdrawal can lower it while one other station remains. It is also
 * the wrong quantity — a strait is kept open by the forces around it, and losing the largest of four garrisons is a
 * withdrawal even though a fleet is still in the sea next door. The 1956 canal case is exactly that: the garrison on
 * the record's own transit state leaves and the fleet 1,400 km away does not, so the maximum never falls.
 */
export function guarantorLevels(index, rec, hosts, y) {
  const m = new Map(); if (!covered(y)) return m;
  for (const p of guarantorRecords(index, rec, hosts)) if (activeAt(p, y)) m.set(p.actor, (m.get(p.actor) ?? 0) + p.level);
  return m;
}
/** The strongest guarantor's weight (0 = none), null outside the layer's coverage. */
export function guarantorLevel(index, rec, hosts, y) {
  if (!covered(y)) return null;
  let m = 0; for (const [, v] of guarantorLevels(index, rec, hosts, y)) if (v > m) m = v;
  return m;
}
/**
 * The most recent year in [y - back, y] in which SOME power's weight around the record fell, or null. Per power, for
 * the same reason `lastFall` is per power on a host: one guarantor replacing another is a withdrawal for the state
 * that lost its guarantor, and the maximum over powers would hide it.
 *
 * The transit set is the record's as it stands in year y and is held fixed across the lookback: a record's transits
 * are the states its route runs through and they change with succession, not with the guarantor, so re-deriving them
 * per year would make a successor-state renaming read as a withdrawal.
 */
export function guarantorFall(index, rec, hosts, y, back = PRESENCE.window) {
  if (!covered(y)) return null;
  let best = null, prev = guarantorLevels(index, rec, hosts, y - back - 1);
  for (let yy = y - back; yy <= y; yy++) {
    const cur = guarantorLevels(index, rec, hosts, yy);
    if (covered(yy - 1)) for (const [p, v] of prev) if ((cur.get(p) ?? 0) < v) { best = yy; break; }
    prev = cur;
  }
  return best;
}
