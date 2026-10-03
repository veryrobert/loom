// Archived Glyph mode (v2, "on/off grid"), replaced on 2026-10-03 when the user asked for Glyph to
// work like Shapes mode's "Glyph mix" instead. Not imported anywhere.
// It was an even grid of same-size glyphs (30 shapes in families, 70% of the cell): filled on dark cells,
// hairline outline on lighter ones, and a small centred dot on white. Defaults it used in v:
//   gcell: 18, gdark: 0.5, gblank: 0.1, gset: 'mixed', gmark: 'dot'
// To restore: paste these back, re-add the GLYPH_ITEMS controls, and route v.mode === 'glyph' to this renderGlyph.

// ---------- glyph mode: an even grid of same-size glyphs, each one on or off. Dark cells get the
// filled glyph (on), lighter cells its outline (off), and near-blank cells a dot or forward slash so
// no cell is ever empty. No size or weight changes — tone comes only from on/off/blank ----------
// Glyph vocabulary: every shape is one closed outline in unit coordinates (y down), so the same
// points give the filled 'on' glyph and the hairline 'off' glyph. glyphShape() fits each to the box.
const GLYPH_UNITS = (() => {
  const arc = (cx, cy, r, a0, a1, n = 32) => Array.from({ length: n + 1 }, (_, i) => { const a = a0 + (a1 - a0) * i / n; return [cx + r * Math.cos(a), cy + r * Math.sin(a)]; });
  const ngon = (n, rot = -Math.PI / 2) => Array.from({ length: n }, (_, i) => { const a = rot + i * 2 * Math.PI / n; return [Math.cos(a), Math.sin(a)]; });
  const star = (n, inner) => Array.from({ length: n * 2 }, (_, i) => { const a = -Math.PI / 2 + i * Math.PI / n, r = i % 2 ? inner : 1; return [r * Math.cos(a), r * Math.sin(a)]; });
  const turn = (pts, q) => pts.map(([x, y]) => q === 1 ? [-y, x] : q === 2 ? [-x, -y] : q === 3 ? [y, -x] : [x, y]);
  const cross = t => [[-t, -1], [t, -1], [t, -t], [1, -t], [1, t], [t, t], [t, 1], [-t, 1], [-t, t], [-1, t], [-1, -t], [-t, -t]];
  const arrow = [[0, -1], [0.8, -0.15], [0.3, -0.15], [0.3, 1], [-0.3, 1], [-0.3, -0.15], [-0.8, -0.15]];
  const rounded = (rr, n = 8) => [...arc(1 - rr, -1 + rr, rr, -Math.PI / 2, 0, n), ...arc(1 - rr, 1 - rr, rr, 0, Math.PI / 2, n), ...arc(-1 + rr, 1 - rr, rr, Math.PI / 2, Math.PI, n), ...arc(-1 + rr, -1 + rr, rr, Math.PI, Math.PI * 1.5, n)];
  const T = Array.from({ length: 65 }, (_, i) => i / 64 * Math.PI * 2);
  const ys = Array.from({ length: 33 }, (_, i) => -1 + i / 16);
  return {
    circle: null, // drawn as a true arc
    square: [[-1, -1], [1, -1], [1, 1], [-1, 1]],
    rounded: rounded(0.38),
    tall: [[-0.55, -1], [0.55, -1], [0.55, 1], [-0.55, 1]],
    triangle: [[0, -1], [1, 0.8], [-1, 0.8]],
    triangleDown: [[-1, -0.8], [1, -0.8], [0, 1]],
    corner: [[-1, -1], [1, 1], [-1, 1]],
    diamond: [[0, -1], [1, 0], [0, 1], [-1, 0]],
    pentagon: ngon(5), hexagon: ngon(6, 0), octagon: ngon(8, Math.PI / 8),
    star4: star(4, 0.38), star5: star(5, 0.45), star6: star(6, 0.55), star8: star(8, 0.62),
    plus: cross(0.3), slim: cross(0.14), x: cross(0.3).map(([x, y]) => [(x - y) * Math.SQRT1_2, (x + y) * Math.SQRT1_2]),
    arrowUp: arrow, arrowRight: turn(arrow, 1), arrowDown: turn(arrow, 2), arrowLeft: turn(arrow, 3),
    chevron: [[-1, 0.2], [0, -0.8], [1, 0.2], [1, 0.8], [0, -0.2], [-1, 0.8]],
    dome: arc(0, 0, 1, Math.PI, Math.PI * 2),
    quarter: [[-1, 1], ...arc(-1, 1, 2, -Math.PI / 2, 0)],
    leaf: [...ys.map(y => [0.62 * (1 - y * y), y]), ...ys.slice().reverse().map(y => [-0.62 * (1 - y * y), y])],
    drop: T.map(t => [0.8 * Math.sin(t) * Math.sin(t / 2), -Math.cos(t)]),
    heart: T.map(t => [16 * Math.sin(t) ** 3, -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t))]),
    crescent: [...arc(0, 0, 1, 1.009, 5.274), ...arc(0.45, 0, 0.85, -1.473, -4.810)],
  };
})();
const GLYPH_FAMILIES = {
  geometric: ['circle', 'square', 'rounded', 'tall', 'triangle', 'triangleDown', 'corner', 'diamond', 'pentagon', 'hexagon', 'octagon'],
  stars: ['star4', 'star5', 'star6', 'star8'],
  crosses: ['plus', 'slim', 'x'],
  arrows: ['arrowUp', 'arrowRight', 'arrowDown', 'arrowLeft', 'chevron'],
  curves: ['circle', 'dome', 'quarter', 'leaf', 'drop', 'heart', 'crescent'],
};
GLYPH_FAMILIES.mixed = [...new Set(Object.values(GLYPH_FAMILIES).flat())];
// Fits a glyph to the box: its larger side is exactly `size`, centred on (cx,cy), whatever its shape
function glyphShape(shape, cx, cy, size) {
  const P = new Path2D(), h = size / 2, pts = GLYPH_UNITS[shape];
  if (!pts) { P.moveTo(cx + h, cy); P.arc(cx, cy, h, 0, Math.PI * 2); return P; }
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const [x, y] of pts) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  const k = size / Math.max(x1 - x0, y1 - y0), ox = (x0 + x1) / 2, oy = (y0 + y1) / 2;
  pts.forEach(([x, y], i) => { const X = cx + (x - ox) * k, Y = cy + (y - oy) * k; i ? P.lineTo(X, Y) : P.moveTo(X, Y); });
  P.closePath(); return P;
}
function renderGlyph(W, H, g, u, live) {
  drawSource(W, H);
  const pkey = JSON.stringify(['glyph', W, H, v.zoom, v.panX, v.panY, v.bri, v.con, v.sat, v.hue, palette, v.gcell, v.gdark, v.gblank, v.gset, v.gmark, seed, imgId]);
  let built;
  if (live && cache && cache.pkey === pkey) built = cache.built;
  else {
    const S = sctx.getImageData(0, 0, W, H).data.slice();
    adjustPass(S);
    const lum = c => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
    const pal = (palette.length >= 2 ? palette : ['#ffffff', '#111111']).map(hex2rgb);
    const paper = pal.reduce((a, b) => lum(b) > lum(a) ? b : a), ink = pal.reduce((a, b) => lum(b) < lum(a) ? b : a);
    const cs = Math.max(4, v.gcell * u), cols = Math.ceil(W / cs), rows = Math.ceil(H / cs), rnd = mulberry(seed);
    // Glyphs are 70% of the cell's height; outlines are inset by half their stroke so off and on match
    const lw = Math.max(0.75, cs * 0.035), size = cs * 0.7;
    const on = new Path2D(), off = new Path2D(), dots = new Path2D(), slashes = new Path2D();
    const set = GLYPH_FAMILIES[v.gset] || (v.gset in GLYPH_UNITS ? [v.gset] : GLYPH_FAMILIES.mixed);
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
      const x0 = Math.floor(i * cs), y0 = Math.floor(j * cs), x1 = Math.min(W, Math.floor((i + 1) * cs)), y1 = Math.min(H, Math.floor((j + 1) * cs));
      let sum = 0, n = 0; const st = Math.max(1, Math.round(cs / 5));
      for (let y = y0; y < y1; y += st) for (let x = x0; x < x1; x += st) { const k = (y * W + x) * 4; sum += 0.2126 * S[k] + 0.7152 * S[k + 1] + 0.0722 * S[k + 2]; n++; }
      const dark = n ? 1 - sum / n / 255 : 0, cx = (i + 0.5) * cs, cy = (j + 0.5) * cs;
      // Draw the random picks for every cell, used or not, so changing a threshold never reshuffles the grid
      const shape = set[Math.floor(rnd() * set.length)], slash = v.gmark === 'slash' || (v.gmark === 'mixed' && rnd() < 0.5);
      if (dark < v.gblank) {
        if (slash) { const h = (size - lw) / 2; slashes.moveTo(cx - h, cy + h); slashes.lineTo(cx + h, cy - h); }
        else { const d = Math.max(0.8, cs * 0.06); dots.moveTo(cx + d, cy); dots.arc(cx, cy, d, 0, Math.PI * 2); }
      } else if (dark >= v.gdark) on.addPath(glyphShape(shape, cx, cy, size));
      else off.addPath(glyphShape(shape, cx, cy, size - lw));
    }
    built = { paper: rgb2hex(paper), ink: rgb2hex(ink), lw,  // hairline like a typeset ○ □ △
      on, off, dots, slashes };
    if (live) cache = { pkey, built };
  }
  tmp.width = W; tmp.height = H;
  tctx.fillStyle = built.paper; tctx.fillRect(0, 0, W, H);
  tctx.fillStyle = built.ink; tctx.strokeStyle = built.ink; tctx.lineWidth = built.lw; tctx.lineJoin = 'round'; tctx.lineCap = 'round';
  tctx.fill(built.on); tctx.fill(built.dots); tctx.stroke(built.off); tctx.stroke(built.slashes);
  fin.width = W; fin.height = H; fctx.globalCompositeOperation = 'source-over'; fctx.globalAlpha = 1; fctx.drawImage(tmp, 0, 0);
  ditherFinish(W, H, u);
  g.drawImage(adjustedSource(W, H), 0, 0);
  for (const [qx, qy, qw, qh] of regions(W, H)) { const w2 = Math.min(qw, W - qx), h2 = Math.min(qh, H - qy); if (w2 > 0 && h2 > 0) g.drawImage(fin, qx, qy, w2, h2, qx, qy, w2, h2); }
}

const GLYPH_ITEMS = [MODE_ITEM,
    S_('gcell', 'Grid size', IC.cell, 4, 60, 1),
    S_('gdark', 'Filled from', IC.contrast, 0.05, 1, 0.01), S_('gblank', 'Blank below', IC.sun, 0, 0.5, 0.01),
    C_('gset', 'Glyphs', IC.shapes, [['mixed', 'Mixed'], ['geometric', 'Geometric'], ['stars', 'Stars'], ['crosses', 'Crosses'], ['arrows', 'Arrows'], ['curves', 'Curves']]),
    C_('gmark', 'Blank mark', IC.dot, [['dot', 'Dot'], ['slash', 'Slash'], ['mixed', 'Mixed']]),
    A_('Shuffle', IC.shuffle, () => { seed = Math.floor(Math.random() * 1e6); })];
