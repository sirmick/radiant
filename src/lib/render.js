// Canvas scene renderer. drawScene(ctx, S) paints one frame from a scene description S built by Map.svelte:
//   S.mode, S.width, S.height, S.projection, S.k (zoom), S.geom {countries, disputed, borders}, S.fills {neId: colour},
//   S.field {grid, dominant, alpha, colorOf, blur}, S.territories [{feature, status, selected}], S.corridors [{geometry, status, mode, selected}],
//   S.arcs [{coords, color, width, alpha, dash}], S.marks [{lonlat, kind, color, size, label, emphasis}], S.labels [{lonlat, flag, glyph, glyphColor, pop}],
//   S.selectedFeature, S.conflictStroke {neId: {c, w, d}}
// Everything goes through S.projection, so 2D and 3D are the same code. Order: sphere, field, fills, borders, territories, corridors, arcs, marks, labels, selection.
import * as d3 from 'd3';
import { visible } from './geo.js';

const patternCache = new Map();
function hatch(ctx, color) {
  if (patternCache.has(color)) return patternCache.get(color);
  const c = document.createElement('canvas'); c.width = 6; c.height = 6; const x = c.getContext('2d');
  x.fillStyle = color; x.globalAlpha = 0.18; x.fillRect(0, 0, 6, 6); x.globalAlpha = 0.9; x.strokeStyle = color; x.lineWidth = 1.4;
  x.beginPath(); x.moveTo(0, 6); x.lineTo(6, 0); x.stroke();
  const p = ctx.createPattern(c, 'repeat'); patternCache.set(color, p); return p;
}

export function drawScene(ctx, S) {
  const { width, height, projection, mode } = S; const path = d3.geoPath(projection, ctx); const k = S.k || 1;
  ctx.save(); ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = '#0b0e13'; ctx.fillRect(0, 0, width, height);
  // sphere + graticule
  ctx.beginPath(); path({ type: 'Sphere' }); ctx.fillStyle = S.field ? '#0e131b' : '#0e131b'; ctx.fill(); ctx.strokeStyle = '#2a303a'; ctx.lineWidth = 0.8; ctx.stroke();
  ctx.beginPath(); path(d3.geoGraticule10()); ctx.strokeStyle = '#1a2029'; ctx.lineWidth = 0.4; ctx.stroke();

  // field raster (blurred) — drawn to an offscreen canvas so the blur does not smear the map
  if (S.field) {
    const off = S.fieldCanvas; off.width = width; off.height = height; const fx = off.getContext('2d'); fx.clearRect(0, 0, width, height);
    const g = S.field.grid, h = g.step / 2;
    for (let i = 0; i < g.cells.length; i++) {
      const p = S.field.dominant[i], a = S.field.alpha[i]; if (p < 0 || a < 0.03) continue;
      const [lon, lat] = g.cells[i]; if (mode === '3d' && !visible(mode, projection, [lon, lat])) continue;
      const corners = [[lon - h, lat + h], [lon + h, lat + h], [lon + h, lat - h], [lon - h, lat - h]].map(c => projection(c)); if (corners.some(c => !c || Number.isNaN(c[0]))) continue;
      fx.beginPath(); fx.moveTo(corners[0][0], corners[0][1]); for (let j = 1; j < 4; j++) fx.lineTo(corners[j][0], corners[j][1]); fx.closePath();
      fx.fillStyle = S.field.colorOf(p); fx.globalAlpha = a; fx.fill();
    }
    ctx.save(); ctx.beginPath(); path({ type: 'Sphere' }); ctx.clip(); ctx.filter = `blur(${S.field.blur}px)`; ctx.globalAlpha = 0.9; ctx.drawImage(off, 0, 0); ctx.restore();
  }

  // country fills
  const fillAlpha = S.field ? 0.55 : 1;
  for (const f of S.geom.countries) {
    const col = S.fills[f.id] ?? (S.field ? null : '#1c2129'); if (!col) continue;
    ctx.beginPath(); path(f); ctx.fillStyle = col; ctx.globalAlpha = fillAlpha; ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.beginPath(); path(S.geom.borders); ctx.strokeStyle = '#0b0e13'; ctx.lineWidth = 0.6; ctx.stroke();
  // conflict outlines
  for (const f of S.geom.countries) { const cs = S.conflictStroke?.[f.id]; if (!cs) continue; ctx.beginPath(); path(f); ctx.strokeStyle = cs.c; ctx.lineWidth = cs.w; ctx.setLineDash(cs.d ? [2, 2] : []); ctx.stroke(); }
  ctx.setLineDash([]);

  // territories
  for (const t of S.territories) {
    if (t.feature) { ctx.beginPath(); path(t.feature); ctx.fillStyle = hatch(ctx, t.color); ctx.fill(); ctx.strokeStyle = t.color; ctx.lineWidth = t.selected ? 1.8 : 0.7; ctx.setLineDash(t.sketch ? [3, 2] : []); ctx.stroke(); ctx.setLineDash([]); }
    else if (t.point && visible(mode, projection, t.point)) { const [x, y] = projection(t.point); ctx.save(); ctx.translate(x, y); ctx.rotate(Math.PI / 4); ctx.fillStyle = t.color; ctx.globalAlpha = 0.6; ctx.fillRect(-4, -4, 8, 8); ctx.globalAlpha = 1; ctx.strokeStyle = t.color; ctx.lineWidth = 1; ctx.strokeRect(-4, -4, 8, 8); ctx.restore(); }
  }
  // corridors
  for (const c of S.corridors) {
    if (c.line) { ctx.beginPath(); path({ type: 'LineString', coordinates: c.line }); ctx.strokeStyle = c.color; ctx.lineWidth = c.selected ? 3 : c.mode === 'cable' ? 0.9 : 1.6; ctx.setLineDash(c.dash); ctx.lineCap = 'round'; ctx.stroke(); ctx.setLineDash([]); }
    else if (c.point && visible(mode, projection, c.point)) { const [x, y] = projection(c.point); ctx.beginPath(); ctx.arc(x, y, c.selected ? 7 : 5, 0, 2 * Math.PI); ctx.fillStyle = c.color; ctx.globalAlpha = 0.35; ctx.fill(); ctx.globalAlpha = 1; ctx.strokeStyle = c.color; ctx.lineWidth = 1.2; ctx.stroke(); }
  }
  // arcs (alliances, wars) — geodesic through the projection, clipped on the globe automatically
  for (const a of S.arcs) { ctx.beginPath(); path({ type: 'LineString', coordinates: a.coords }); ctx.strokeStyle = a.color; ctx.globalAlpha = a.alpha; ctx.lineWidth = a.width; ctx.setLineDash(a.dash ?? []); ctx.stroke(); }
  ctx.globalAlpha = 1; ctx.setLineDash([]);
  // marks (presence, glyph roses)
  for (const m of S.marks) {
    if (!visible(mode, projection, m.lonlat)) continue; const [x, y] = projection(m.lonlat);
    ctx.save(); ctx.translate(x, y); ctx.fillStyle = m.color; ctx.strokeStyle = m.stroke ?? '#0b0e13'; ctx.lineWidth = 0.6;
    if (m.kind === 'fleet') { ctx.beginPath(); ctx.arc(0, 0, m.size, 0, 2 * Math.PI); ctx.globalAlpha = 0.08; ctx.fill(); ctx.globalAlpha = m.emphasis ? 0.95 : 0.6; ctx.strokeStyle = m.color; ctx.setLineDash([4, 3]); ctx.lineWidth = m.emphasis ? 1.4 : 0.9; ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = 1; ctx.font = '10px system-ui'; ctx.textAlign = 'center'; ctx.fillStyle = m.color; ctx.fillText('⚓', 0, 3); }
    else if (m.kind === 'garrison') { ctx.rotate(Math.PI / 4); ctx.globalAlpha = 0.85; ctx.fillRect(-m.size, -m.size, m.size * 2, m.size * 2); ctx.globalAlpha = 1; ctx.strokeRect(-m.size, -m.size, m.size * 2, m.size * 2); }
    else if (m.kind === 'advisors') { ctx.beginPath(); ctx.arc(0, 0, m.size * 0.7, 0, 2 * Math.PI); ctx.fill(); ctx.stroke(); }
    else if (m.kind === 'rose') { ctx.beginPath(); ctx.arc(0, 0, m.size, 0, 2 * Math.PI); ctx.fillStyle = '#0b0e13'; ctx.globalAlpha = 0.35; ctx.fill(); ctx.globalAlpha = 1; ctx.strokeStyle = m.stroke; ctx.lineWidth = m.strokeWidth ?? 0.5; ctx.stroke(); if (m.pathD) { const p = new Path2D(m.pathD); ctx.fillStyle = '#ffd166'; ctx.globalAlpha = 0.55; ctx.fill(p); ctx.globalAlpha = 1; ctx.strokeStyle = '#ffd166'; ctx.lineWidth = 0.7; ctx.stroke(p); } }
    else { ctx.globalAlpha = 0.85; ctx.fillRect(-m.size, -m.size, m.size * 2, m.size * 2); ctx.globalAlpha = 1; ctx.strokeRect(-m.size, -m.size, m.size * 2, m.size * 2); }
    ctx.restore();
  }
  // labels: population bubble, flag, regime glyph
  for (const l of S.labels) {
    if (!visible(mode, projection, l.lonlat)) continue; const [x, y] = projection(l.lonlat);
    if (l.popR) { ctx.beginPath(); ctx.arc(x, y, l.popR, 0, 2 * Math.PI); ctx.fillStyle = '#6cb4ff'; ctx.globalAlpha = 0.08; ctx.fill(); ctx.globalAlpha = 0.25; ctx.strokeStyle = '#6cb4ff'; ctx.lineWidth = 0.6; ctx.stroke(); ctx.globalAlpha = 1; }
    ctx.font = `${l.size}px system-ui, "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji"`; ctx.textBaseline = 'middle';
    if (l.flag) { ctx.textAlign = 'right'; ctx.fillStyle = '#fff'; ctx.fillText(l.flag, x - 2, y + l.dy); }
    if (l.glyph) { ctx.textAlign = 'left'; ctx.lineWidth = 3; ctx.strokeStyle = '#0b0e13'; ctx.strokeText(l.glyph, x + 2, y + l.dy); ctx.fillStyle = l.glyphColor; ctx.fillText(l.glyph, x + 2, y + l.dy); }
  }
  // selection outline
  if (S.selectedFeature) { ctx.beginPath(); path(S.selectedFeature); ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.6; ctx.stroke(); }
  ctx.restore();
}
