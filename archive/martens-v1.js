// Archived Martens mode (v1), replaced on 2026-10-04 when the user asked for Martens to step between
// 3–4 fixed line thicknesses, built on the Shapes engine's line shapes. Not imported anywhere.
// It drew its own pixel bands: 'lines' style = continuous tone-modulated thickness; 'segments' style =
// stacked rectangles with gaps. Defaults it used in v:
//   mdetail: 0.5, mgrid: false, mdir: 'h', mstyle: 'lines', mseg: 10, mnoise: 0.15 (plus the shared v.pitch)

// ---------- martens mode: Karel Martens' "Patterns" cover — long lines whose thickness follows local
// tone, thinning to nothing (white space) in light areas. Style 'segments' keeps the earlier version:
// each line a stack of discrete rectangles, width per segment set by tone ----------
function renderMartens(W, H, g, u, live) {
  drawSource(W, H);
  const pkey = JSON.stringify(['martens', W, H, v.zoom, v.panX, v.panY, v.bri, v.con, v.sat, v.hue, v.pitch, v.mdetail, v.mdir, v.mstyle, v.mgrid, v.mseg, v.mnoise, seed, imgId]);
  let O;
  if (live && cache && cache.pkey === pkey) O = cache.O.slice();
  else {
    const S = sctx.getImageData(0, 0, W, H).data.slice();
    adjustPass(S);
    const ink = v.mgrid ? 255 : 17, ground = v.mgrid ? 17 : 255;
    O = new Uint8ClampedArray(W * H * 4);
    for (let i = 0; i < O.length; i += 4) { O[i] = ground; O[i + 1] = ground; O[i + 2] = ground; O[i + 3] = 255; }
    const pitch = Math.max(2, Math.round(v.pitch * u)), gamma = 0.4 + (1 - v.mdetail) * 2.2, horiz = v.mdir !== 'v';
    const seg = Math.max(2, Math.round(v.mseg * u)), gap = Math.max(1, Math.round(seg * 0.18)), rnd = mulberry(seed);
    const total = horiz ? H : W, len = horiz ? W : H, bands = Math.max(1, Math.round(total / pitch));
    for (let b = 0; b < bands; b++) {
      // qs is the whole-pixel row/column to sample — a half-pixel qmid would read half a row away
      const q0 = Math.round(b * total / bands), q1 = Math.round((b + 1) * total / bands), qmid = (q0 + q1) / 2, qs = Math.min(total - 1, Math.floor(qmid)), bw = q1 - q0;
      // Round the width, not each edge — on an odd-height band qmid sits on a half pixel, and rounding
      // the edges separately turned near-white tone into a stray 1px hairline
      const span = half => { const w = Math.round(half * 2), a0 = Math.round(qmid - w / 2); return [Math.max(q0, a0), Math.min(q1, a0 + w)]; };
      const fill = (p, half) => {
        const [a0, a1] = span(half);
        for (let q = a0; q < a1; q++) { const xx = horiz ? p : q, yy = horiz ? q : p, j = (yy * W + xx) * 4; O[j] = ink; O[j + 1] = ink; O[j + 2] = ink; }
      };
      if (v.mstyle !== 'segments') {
        // Tone sampled every few px across three rows of the band, then interpolated per pixel so the
        // line's edge swells and thins smoothly instead of stepping
        const st = Math.max(1, Math.round(2 * u)), n = Math.ceil(len / st) + 1, T = new Float32Array(n);
        const rows = [q0 + bw * 0.25, qmid, q0 + bw * 0.75].map(q => Math.min(total - 1, Math.floor(q)));
        for (let k = 0; k < n; k++) {
          const p = Math.min(len - 1, k * st); let sum = 0;
          for (const q of rows) { const x = horiz ? p : q, y = horiz ? q : p, i = (y * W + x) * 4; sum += 0.2126 * S[i] + 0.7152 * S[i + 1] + 0.0722 * S[i + 2]; }
          let half = Math.pow(1 - sum / rows.length / 255, gamma) * bw / 2;
          if (v.mnoise > 0) half *= 1 + (rnd() - 0.5) * v.mnoise;
          T[k] = Math.max(0, Math.min(bw / 2, half));
        }
        for (let p = 0; p < len; p++) { const f = p / st, k = Math.floor(f), t = f - k; fill(p, T[k] + (T[Math.min(n - 1, k + 1)] - T[k]) * t); }
        continue;
      }
      const segs = Math.max(1, Math.round(len / seg));
      for (let s = 0; s < segs; s++) {
        const p0 = Math.round(s * len / segs), p1 = Math.round((s + 1) * len / segs);
        let sum = 0, n = 0; const st = Math.max(1, Math.round((p1 - p0) / 4));
        for (let p = p0; p < p1; p += st) { const x = horiz ? p : qs, y = horiz ? qs : p, i = (y * W + x) * 4; sum += 0.2126 * S[i] + 0.7152 * S[i + 1] + 0.0722 * S[i + 2]; n++; }
        const L = n ? sum / n / 255 : 1;
        let half = Math.pow(1 - L, gamma) * bw / 2;
        if (v.mnoise > 0) half *= 1 + (rnd() - 0.5) * v.mnoise;
        half = Math.max(0, Math.min(bw / 2, half));
        const [a0, a1] = span(half), p1g = Math.max(p0, p1 - gap);
        for (let p = p0; p < p1g; p++) for (let q = a0; q < a1; q++) { const xx = horiz ? p : q, yy = horiz ? q : p, j = (yy * W + xx) * 4; O[j] = ink; O[j + 1] = ink; O[j + 2] = ink; }
      }
    }
    if (live) cache = { pkey, O: O.slice() };
  }
  tmp.width = W; tmp.height = H; tctx.putImageData(new ImageData(O, W, H), 0, 0);
  fin.width = W; fin.height = H; fctx.globalCompositeOperation = 'source-over'; fctx.globalAlpha = 1; fctx.drawImage(tmp, 0, 0);
  ditherFinish(W, H, u);
  g.drawImage(adjustedSource(W, H), 0, 0);
  for (const [qx, qy, qw, qh] of regions(W, H)) { const w2 = Math.min(qw, W - qx), h2 = Math.min(qh, H - qy); if (w2 > 0 && h2 > 0) g.drawImage(fin, qx, qy, w2, h2, qx, qy, w2, h2); }
}

const MARTENS_ITEMS = [MODE_ITEM,
    C_('mdir', 'Direction', IC.offset, [['h', 'Horizontal'], ['v', 'Vertical']]),
    C_('mstyle', 'Style', IC.bars, [['lines', 'Lines'], ['segments', 'Segments']]),
    S_('pitch', 'Line spacing', IC.width, 3, 48, 1), when(S_('mseg', 'Segment length', IC.bars, 2, 60, 1), () => v.mstyle === 'segments'),
    S_('mdetail', 'Contrast', IC.contrast, 0, 1, 0.01), S_('mnoise', 'Noise', IC.noise, 0, 1, 0.01),
    T_('mgrid', 'Invert', IC.wind)];
