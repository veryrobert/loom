// Archived Glyph mode (v1), removed from src/engine/loom.js on 2026-10-03 to rebuild Glyph from scratch.
// Not imported anywhere. It ran as a recursive quadtree: flat regions became solid blocks; detailed
// leaves got a random glyph (dot/triangle/ring/x/cross/slash or a keyboard character) on a paper
// ground, stepping light→dark through GLYPH_STEPS (thin outline → heavy outline → filled, growing).
// To restore: paste these back and re-add 'glyph' to MODE_ITEM, render(), the Colour/Pattern tab
// getters, the preset icon, and the glyphModePrimed flag.

// defaults in v:
  gcolour: 'mono', gcell: 24, gdepth: 4, gdetail: 0.12, ggrid: false, gweight: 1,


// Glyph mode's own, finer vocabulary — kept separate from GLYPH_SET so it reads as its own
// technique (thin marks + actual keyboard characters) rather than a recolour of Shapes mode.
const GLYPH_MODE_SET = ['dot', 'triangle', 'ring', 'x', 'cross', 'slash', 'slash', 'char', 'char'];
// Glyph mode's tone ramp, light → dark: [filled, radius as a share of the cell, outline weight multiplier]
const GLYPH_STEPS = [[false, 0.2, 0.6], [false, 0.23, 1], [false, 0.26, 1.5], [false, 0.29, 2.1], [false, 0.32, 2.8], [true, 0.3, 1], [true, 0.34, 1], [true, 0.38, 1]];
const GLYPH_MODE_CHARS = ['.', ',', '/', '\\', '+', 'x', '*', ':', '-', 'o', '^', '='];


// ---------- glyph mode: recursive quadtree — flat regions collapse to solid blocks, detail is
// stamped with fine marks (dot/triangle/ring/x/cross/slash, plus actual keyboard characters)
// sized to each quadtree leaf — its own thinner, type-art vocabulary, distinct from Shapes ----------
function renderGlyph(W, H, g, u, live) {
  drawSource(W, H);
  const pkey = JSON.stringify(['glyph', W, H, v.zoom, v.panX, v.panY, v.bri, v.con, v.sat, v.hue, palette, v.gcolour, v.gcell, v.gdepth, v.gdetail, v.ggrid, seed, imgId]);
  let built;
  if (live && cache && cache.pkey === pkey) built = cache.built;
  else {
    const S = sctx.getImageData(0, 0, W, H).data.slice();
    adjustPass(S);
    const pal = (palette.length ? palette : ['#ffffff', '#111111']).map(hex2rgb);
    const baseCell = Math.max(6, v.gcell * u), minCell = Math.max(4, baseCell / Math.pow(2, v.gdepth)), thresh = 8 + v.gdetail * 140;
    const rnd = mulberry(seed);
    const flats = [], fills = new Map(), strokes = new Map(), chars = [], gridPts = [];
    const sampleAvg = (x0, y0, x1, y1) => {
      let sr = 0, sg = 0, sb = 0, n = 0; const st = Math.max(1, Math.round((x1 - x0) / 6));
      for (let y = y0; y < y1; y += st) for (let x = x0; x < x1; x += st) { const i = (y * W + x) * 4; sr += S[i]; sg += S[i + 1]; sb += S[i + 2]; n++; }
      return n ? [sr / n, sg / n, sb / n] : [0, 0, 0];
    };
    const tone = c => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
    // Glyphs sit on paper (the palette's lightest colour), never the photo or a filled cell — tone
    // comes from the glyph itself: a filled glyph on dark cells, its outline on lighter ones
    const ground = pal.reduce((a, b) => tone(b) > tone(a) ? b : a), inks = pal.length > 1 ? pal.filter(p => p !== ground) : pal;
    const colFor = avg => v.gcolour === 'mono' ? rgb2hex(nearest(avg, pal)) : rgb2hex(avg.map(c => Math.round(c / 4) * 4));
    const inkFor = avg => v.gcolour === 'mono' ? rgb2hex(nearest(avg, inks)) : colFor(avg);
    const fillFlat = (x0, y0, x1, y1) => { flats.push([x0, y0, x1 - x0, y1 - y0, colFor(sampleAvg(x0, y0, x1, y1))]); if (v.ggrid) gridPts.push([x0, y0, x1, y1]); };
    // Each glyph is one closed silhouette, so the same path reads as a solid glyph when filled and as
    // its outline when stroked (a hollow plus, a ring, an open triangle) — no overlapping sub-shapes
    const poly = (cx, cy, pts, ang) => {
      const P = new Path2D(), ca = Math.cos(ang), sa = Math.sin(ang);
      pts.forEach(([x, y], i) => { const X = cx + x * ca - y * sa, Y = cy + x * sa + y * ca; i ? P.lineTo(X, Y) : P.moveTo(X, Y); });
      P.closePath(); return P;
    };
    const plus = (r, t) => [[-t, -r], [t, -r], [t, -t], [r, -t], [r, t], [t, t], [t, r], [-t, r], [-t, t], [-r, t], [-r, -t], [-t, -t]];
    const glyphPath = (shape, cx, cy, r) => {
      if (shape === 'ring' || shape === 'dot') { const P = new Path2D(), rr = shape === 'dot' ? r * 0.45 : r; P.moveTo(cx + rr, cy); P.arc(cx, cy, rr, 0, Math.PI * 2); return P; }
      if (shape === 'triangle') return poly(cx, cy, [[0, -r], [r * 0.9, r * 0.8], [-r * 0.9, r * 0.8]], 0);
      if (shape === 'cross') return poly(cx, cy, plus(r, r * 0.22), 0);
      if (shape === 'x') return poly(cx, cy, plus(r, r * 0.22), Math.PI / 4);
      const t = r * 0.22; return poly(cx, cy, [[-t, -r], [t, -r], [t, r], [-t, r]], Math.PI / 4);
    };
    const stampGlyph = (x0, y0, x1, y1) => {
      // Tone in GLYPH_STEPS even increments: outlines thicken and grow, then turn solid and keep growing
      const avg = sampleAvg(x0, y0, x1, y1), col = inkFor(avg);
      const k = Math.round(Math.min(1, Math.abs(tone(avg) - tone(ground)) / 220) * (GLYPH_STEPS.length - 1)), [filled, scale, wt] = GLYPH_STEPS[k];
      const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, cs = Math.min(x1 - x0, y1 - y0), shape = GLYPH_MODE_SET[Math.floor(rnd() * GLYPH_MODE_SET.length)];
      if (shape === 'char') chars.push([cx, cy, cs * (0.55 + scale * 0.6), GLYPH_MODE_CHARS[Math.floor(rnd() * GLYPH_MODE_CHARS.length)], col, filled, wt]);
      else {
        const P = glyphPath(shape, cx, cy, cs * scale);
        if (filled) { let F = fills.get(col); if (!F) { F = new Path2D(); fills.set(col, F); } F.addPath(P); }
        else { const key = col + '|' + wt; let L = strokes.get(key); if (!L) { L = { col, wt, P: new Path2D() }; strokes.set(key, L); } L.P.addPath(P); }
      }
      if (v.ggrid) gridPts.push([x0, y0, x1, y1]);
    };
    const recurse = (x0, y0, x1, y1, depth) => {
      const w = x1 - x0, h = y1 - y0; if (w <= 0 || h <= 0) return;
      if (w <= minCell || h <= minCell || depth >= v.gdepth) return stampGlyph(x0, y0, x1, y1);
      // Split on the widest per-channel spread, not luminance alone, so colour edges of equal
      // brightness (red against green) still subdivide — identical to the old test on greyscale
      const mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9]; const st = Math.max(1, Math.round(Math.min(w, h) / 6));
      for (let y = y0; y < y1; y += st) for (let x = x0; x < x1; x += st) { const i = (y * W + x) * 4; for (let k = 0; k < 3; k++) { const c = S[i + k]; if (c < mn[k]) mn[k] = c; if (c > mx[k]) mx[k] = c; } }
      if (Math.max(mx[0] - mn[0], mx[1] - mn[1], mx[2] - mn[2]) <= thresh) return fillFlat(x0, y0, x1, y1);
      const mx2 = Math.round((x0 + x1) / 2), my2 = Math.round((y0 + y1) / 2);
      recurse(x0, y0, mx2, my2, depth + 1); recurse(mx2, y0, x1, my2, depth + 1);
      recurse(x0, my2, mx2, y1, depth + 1); recurse(mx2, my2, x1, y1, depth + 1);
    };
    recurse(0, 0, W, H, 0);
    built = { ground: rgb2hex(ground), flats, fills, strokes, chars, gridPts };
    if (live) cache = { pkey, built };
  }
  tmp.width = W; tmp.height = H; tctx.fillStyle = built.ground; tctx.fillRect(0, 0, W, H);
  for (const [x, y, w, h, col] of built.flats) { tctx.fillStyle = col; tctx.fillRect(x, y, w, h); }
  for (const [col, P] of built.fills) { tctx.fillStyle = col; tctx.fill(P); }
  tctx.lineCap = 'round'; tctx.lineJoin = 'round';
  for (const { col, wt, P } of built.strokes.values()) { tctx.lineWidth = Math.max(0.5, v.gweight * u * wt); tctx.strokeStyle = col; tctx.stroke(P); }
  tctx.textAlign = 'center'; tctx.textBaseline = 'middle';
  for (const [x, y, size, ch, col, filled, wt] of built.chars) {
    tctx.font = `${filled ? 'bold ' : ''}${Math.max(6, Math.round(size))}px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`;
    if (filled) { tctx.fillStyle = col; tctx.fillText(ch, x, y); } else { tctx.lineWidth = Math.max(0.5, v.gweight * u * wt); tctx.strokeStyle = col; tctx.strokeText(ch, x, y); }
  }
  if (v.ggrid) { tctx.save(); tctx.strokeStyle = 'rgba(0,0,0,0.25)'; tctx.lineWidth = Math.max(1, u * 0.6); for (const [x0, y0, x1, y1] of built.gridPts) tctx.strokeRect(x0 + 0.5, y0 + 0.5, x1 - x0 - 1, y1 - y0 - 1); tctx.restore(); }
  fin.width = W; fin.height = H; fctx.globalCompositeOperation = 'source-over'; fctx.globalAlpha = 1; fctx.drawImage(tmp, 0, 0);
  ditherFinish(W, H, u);
  g.drawImage(adjustedSource(W, H), 0, 0);
  for (const [qx, qy, qw, qh] of regions(W, H)) { const w2 = Math.min(qw, W - qx), h2 = Math.min(qh, H - qy); if (w2 > 0 && h2 > 0) g.drawImage(fin, qx, qy, w2, h2, qx, qy, w2, h2); }
}


const GLYPH_TAB_ITEMS = [MODE_ITEM,
    S_('gcell', 'Base cell', IC.cell, 8, 64, 1), S_('gdepth', 'Max depth', IC.zones, 1, 7, 1), S_('gdetail', 'Detail', IC.eye, 0, 1, 0.01),
    S_('gweight', 'Weight', IC.width, 0.5, 4, 0.1),
    T_('ggrid', 'Grid lines', IC.grid),
    A_('Shuffle', IC.shuffle, () => { seed = Math.floor(Math.random() * 1e6); })];


const COLOUR_GLYPH_TAB = [C_('gcolour', 'Colour', IC.palette, [['mono', 'Mono'], ['image', 'Image colour']]), ...COLOUR_COMMON];


// MODE_ITEM onPick priming:
  if (v.mode === 'glyph' && !glyphModePrimed) { glyphModePrimed = true; palette = ['#ffffff', '#111111']; paletteSrc = palette.slice(); }
