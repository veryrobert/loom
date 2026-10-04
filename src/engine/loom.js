/* Loom — turns an image or video into a flat graphic pattern.
   Sections: state · rendering (weave, shapes, density zones, split/patch masks) · palette ·
   layout · icons · controls · gestures · video · export · library (presets/files/downloads).
   Everything runs in the browser. Ported from the original single-file artifact into a
   Vite module; the graphics/control logic below is otherwise unchanged. */
import { storeFile, listFiles, deleteFile } from '../storage/files';
import { savePreset, listPresets, deletePreset, renamePreset } from '../storage/presets';
import { saveToDevice, listDownloads, deleteDownload, redownload } from '../storage/downloads';

export function initLoom() {
const $ = id => document.getElementById(id);
const out = $('out');
const src = document.createElement('canvas'), sctx = src.getContext('2d', { willReadFrequently: true });
const tmp = document.createElement('canvas'), tctx = tmp.getContext('2d');
const fin = document.createElement('canvas'), fctx = fin.getContext('2d');
let img = null, imgId = 0, cache = null, interactive = false, seed = 7, picking = false, palette = [], paletteSrc = [], comparing = false, rawPreview = false;
// paletteAuto: the palette is still the one extracted from the image (a new image may refresh it);
// any hand-made or mode-set palette clears it so loading another image keeps the user's colours
let paletteAuto = true;
const v = {
  zoom: 1, panX: 0, panY: 0, format: 'image', split: 1, side: 'left', pcover: 0.5, psize: 4, pdepth: 2, mscale: 1, mx: 0, my: 0, maskMove: false, photoColour: true, exportLong: 'native',
  detail: 0, perstripe: true, cmode: 'palette', kcount: 7,
  bri: 1, con: 1, sat: 1, hue: 0, glow: 0, gsize: 10, blend: 'none', mix: 0.25,
  pcw: 1, prh: 1, merge: 0.3, uneven: 0.35, depth: 0, offset: true, accents: 0,
  // Grain is global (Adjust tab) — every mode adds it inside its own pipeline, before any dithering
  grain: 0, invert: false,
  dither: 'off', dlevels: 5, dsize: 2, dpal: false, dvary: 0,
  // Dither mode's own settings — kept apart from the Dither tab above, which is a finish for the other modes
  ddither: 'ordered', ddlevels: 2, ddpal: true, ddvary: 0,
  // Glyph mode = Glyph mix's look, on its own keys
  gset: 'classic',
  // scale: one size for every pattern — Shapes cells, Glyph grid, Martens line spacing, Pixel stripes
  // (×0.7) and Dither mode dots (×0.2); density zones vary it across the image
  mode: 'none', scale: 10, ssize: 0.8, sbarw: 1, halftone: 0.35, sset: 'mixed', sby: 'tone', bandRows: 4, ground: 'darkest', groundColor: '#F2EFE8', jitter: 0, zmode: 'off', zones: 4, zrange: 3, zorder: 'coarse', stone: 'full',
  mdir: 'h', mlevels: 4, msize: 1.8, mseg: 2, mstagger: 1, mthresh: 0.35, mfull: 0.85, mangle: 30,
  // Shapes-engine line mode, set only by renderMartens: sline '' = off / 'h' / 'v'
  slevels: 0, sline: '', sseg: 2, sstagger: 1, sthresh: 0.5, sfull: 0.9, sangle: 30,
};
const D0 = { ...v };
const HOT = ['#FF4628', '#FFD23C', '#7A3CFF', '#5ADCFF', '#FF7828', '#FF3C5A'];
function mulberry(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const hex2rgb = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const rgb2hex = c => '#' + c.map(x => Math.max(0, Math.min(255, Math.round(x))).toString(16).padStart(2, '0')).join('');
function hash2(a, b, sd) { let h = Math.imul(a * 374761393 + b * 668265263 + sd * 2246822519, 1274126177); h ^= h >>> 13; h = Math.imul(h, 1103515245); h ^= h >>> 16; return (h >>> 0) / 4294967296; }
function nearestIdx(c, pal) { let bi = 0, bd = 1e9; for (let j = 0; j < pal.length; j++) { const p = pal[j], d = (c[0] - p[0]) ** 2 * .3 + (c[1] - p[1]) ** 2 * .59 + (c[2] - p[2]) ** 2 * .11; if (d < bd) { bd = d; bi = j; } } return bi; }
function nearest(c, pal) { let best = pal[0], bd = 1e9; for (const p of pal) { const d = (c[0] - p[0]) ** 2 * .3 + (c[1] - p[1]) ** 2 * .59 + (c[2] - p[2]) ** 2 * .11; if (d < bd) { bd = d; best = p; } } return best; }
const srcW = () => img ? (img.videoWidth || img.naturalWidth) : 1, srcH = () => img ? (img.videoHeight || img.naturalHeight) : 1;
let vid = null, recording = false, recLong = 1080;
const ratio = () => v.format === 'screen' ? innerWidth / innerHeight : v.format === 'image' ? (img ? srcW() / srcH() : innerWidth / innerHeight) : parseFloat(v.format);

// ---------- rendering ----------
// The photo as patterns see it. Global Invert flips light and dark here for None, Pixel, Shapes and Dither;
// Glyph and Martens swap ink and paper in their geometry instead, keeping their exact palette colours
const invertsSource = () => v.invert && v.mode !== 'glyph' && v.mode !== 'martens';
function patternSource(W, H) {
  drawSource(W, H);
  if (invertsSource()) { sctx.save(); sctx.globalCompositeOperation = 'difference'; sctx.fillStyle = '#fff'; sctx.fillRect(0, 0, W, H); sctx.restore(); }
}
function drawSource(W, H) {
  src.width = W; src.height = H;
  const L = Math.max(W, H), iw = srcW(), ih = srcH();
  const s = Math.max(W / iw, H / ih) * v.zoom, dw = iw * s, dh = ih * s;
  const mx = (dw - W) / 2 / L, my = (dh - H) / 2 / L;
  v.panX = Math.max(-mx, Math.min(mx, v.panX)); v.panY = Math.max(-my, Math.min(my, v.panY));
  sctx.drawImage(img, (W - dw) / 2 + v.panX * L, (H - dh) / 2 + v.panY * L, dw, dh);
}
const BAYER = (() => { let b = [[0]]; for (let k = 0; k < 3; k++) { const n = b.length, nb = Array.from({ length: n * 2 }, () => new Array(n * 2)); for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) { const q = b[y][x] * 4; nb[y][x] = q; nb[y][x + n] = q + 2; nb[y + n][x] = q + 3; nb[y + n][x + n] = q + 1; } b = nb; } return b; })();
// `o` picks which settings drive it: the Dither tab's finish by default, or Dither mode's own
function dither(O, W, H, u, pal, o = { type: v.dither, levels: v.dlevels, size: v.dsize, usePal: v.dpal, vary: v.dvary }) {
  if (o.type === 'off') return;
  const Lv = o.levels, cs = Math.max(1, Math.round(o.size * u)), usePal = o.usePal && pal.length;
  const w = Math.ceil(W / cs), h = Math.ceil(H / cs), B = new Float32Array(w * h * 3);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = (Math.min(H - 1, y * cs + (cs >> 1)) * W + Math.min(W - 1, x * cs + (cs >> 1))) * 4, k = (y * w + x) * 3; B[k] = O[i]; B[k + 1] = O[i + 1]; B[k + 2] = O[i + 2]; }
  const step = 255 / (Lv - 1);
  // With the palette on, Levels still counts: the palette (dark→light) becomes a ramp of Lv tones,
  // its own colours kept as anchors and the extra levels blended evenly between neighbours
  let ramp = pal;
  if (usePal && Lv > pal.length && pal.length > 1) {
    const lum = c => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
    const P = pal.slice().sort((a, b) => lum(a) - lum(b)), segs = P.length - 1, extra = Lv - P.length;
    ramp = [P[0]];
    for (let s = 0; s < segs; s++) {
      const n = Math.floor(extra / segs) + (s < extra % segs ? 1 : 0), a = P[s], b = P[s + 1];
      for (let j = 1; j <= n; j++) { const t = j / (n + 1); ramp.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]); }
      ramp.push(b);
    }
  }
  const quant = (r, g, b) => usePal ? nearest([r, g, b], ramp) : [Math.round(r / step) * step, Math.round(g / step) * step, Math.round(b / step) * step];
  if (o.vary > 0) {
    // Random sizes: the dot grid is cut into a random mix of squares (1–8 dots across, re-rolled by
    // Shuffle) and each square is dithered as one dot, from the average of the dots it covers
    const M = 8, sd = seed * 7919 + 3, leaves = [];
    const split = (x0, y0, sz) => {
      if (x0 >= w || y0 >= h) return;
      if (sz > 1 && hash2(x0 * 3 + sz, y0 * 5 + sz, sd) >= o.vary * 0.8) { const hs = sz / 2; split(x0, y0, hs); split(x0 + hs, y0, hs); split(x0, y0 + hs, hs); split(x0 + hs, y0 + hs, hs); }
      else leaves.push([x0, y0, Math.min(sz, w - x0), Math.min(sz, h - y0)]);
    };
    for (let by = 0; by < h; by += M) for (let bx = 0; bx < w; bx += M) split(bx, by, M);
    leaves.sort((a, b) => a[1] - b[1] || a[0] - b[0]);
    const amp = usePal ? 72 / Math.max(1, ramp.length - 1) : step, done = new Uint8Array(w * h);
    for (const [x0, y0, lw, lh] of leaves) {
      let r = 0, g = 0, b = 0;
      for (let y = y0; y < y0 + lh; y++) for (let x = x0; x < x0 + lw; x++) { const k = (y * w + x) * 3; r += B[k]; g += B[k + 1]; b += B[k + 2]; }
      // Clamp so error piled onto a small square next to a big one can't run away
      const n = lw * lh, cl = c => Math.max(-64, Math.min(319, c)); r = cl(r / n); g = cl(g / n); b = cl(b / n);
      let q;
      if (o.type === 'ordered') {
        // Single dots keep the Bayer pattern; bigger squares sit on aligned corners, so they get a hashed threshold
        const t = ((lw * lh === 1 ? (BAYER[y0 & 7][x0 & 7] + 0.5) / 64 : hash2(x0, y0, sd + 1)) - 0.5) * amp;
        q = quant(r + t, g + t, b + t);
      } else {
        // Diffusion between squares: error goes to the strips right of and below the square, scaled by the
        // square's side so a neighbour of similar size receives about the usual Floyd–Steinberg share
        q = quant(r, g, b);
        const e = [r - q[0], g - q[1], b - q[2]];
        const add = (x, y, f) => { if (x < 0 || x >= w || y >= h || done[y * w + x]) return; const k = (y * w + x) * 3; B[k] += e[0] * f; B[k + 1] += e[1] * f; B[k + 2] += e[2] * f; };
        for (let y = y0; y < y0 + lh; y++) add(x0 + lw, y, 7 / 16 * lw);
        for (let x = x0; x < x0 + lw; x++) add(x, y0 + lh, 5 / 16 * lh);
        add(x0 - 1, y0 + lh, 3 / 16 * n); add(x0 + lw, y0 + lh, 1 / 16 * n);
      }
      for (let y = y0; y < y0 + lh; y++) for (let x = x0; x < x0 + lw; x++) { const k = (y * w + x) * 3; B[k] = q[0]; B[k + 1] = q[1]; B[k + 2] = q[2]; done[y * w + x] = 1; }
    }
  } else if (o.type === 'ordered') {
    // Palette dither keeps the same blend-to-gap ratio at every level count (72/255 is the
    // original two-colour look), so stepping Levels refines the bands rather than changing style
    const amp = usePal ? 72 / Math.max(1, ramp.length - 1) : step;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const t = ((BAYER[y & 7][x & 7] + 0.5) / 64 - 0.5) * amp, k = (y * w + x) * 3, q = quant(B[k] + t, B[k + 1] + t, B[k + 2] + t); B[k] = q[0]; B[k + 1] = q[1]; B[k + 2] = q[2]; }
  } else {
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const k = (y * w + x) * 3, o = [B[k], B[k + 1], B[k + 2]], q = quant(o[0], o[1], o[2]);
      for (let c = 0; c < 3; c++) {
        const e = o[c] - q[c]; B[k + c] = q[c];
        if (x + 1 < w) B[k + 3 + c] += e * 7 / 16;
        if (y + 1 < h) { const d = ((y + 1) * w + x) * 3 + c; if (x > 0) B[d - 3] += e * 3 / 16; B[d] += e * 5 / 16; if (x + 1 < w) B[d + 3] += e / 16; }
      }
    }
  }
  for (let y = 0; y < H; y++) { const by = Math.floor(y / cs) * w; let i = y * W * 4; for (let x = 0; x < W; x++, i += 4) { const k = (by + Math.floor(x / cs)) * 3; O[i] = B[k]; O[i + 1] = B[k + 1]; O[i + 2] = B[k + 2]; } }
}

// Pixel-level glow and adjustments (canvas filters are unreliable on iPhone Safari)
function boxBlur(A, w, h, r) {
  if (r < 1) return;
  const T = new Float32Array(A.length);
  for (let pass = 0; pass < 3; pass++) {
    for (let y = 0; y < h; y++) for (let c = 0; c < 3; c++) {
      let acc = 0; const row = y * w;
      for (let x = -r; x <= r; x++) acc += A[(row + Math.min(w - 1, Math.max(0, x))) * 3 + c];
      for (let x = 0; x < w; x++) { T[(row + x) * 3 + c] = acc / (2 * r + 1); acc += A[(row + Math.min(w - 1, x + r + 1)) * 3 + c] - A[(row + Math.max(0, x - r)) * 3 + c]; }
    }
    for (let x = 0; x < w; x++) for (let c = 0; c < 3; c++) {
      let acc = 0;
      for (let y = -r; y <= r; y++) acc += T[(Math.min(h - 1, Math.max(0, y)) * w + x) * 3 + c];
      for (let y = 0; y < h; y++) { A[(y * w + x) * 3 + c] = acc / (2 * r + 1); acc += T[(Math.min(h - 1, y + r + 1) * w + x) * 3 + c] - T[(Math.max(0, y - r) * w + x) * 3 + c]; }
    }
  }
}
function glowPass(O, W, H, u) {
  if (v.glow <= 0) return;
  const gs = v.gsize * u, q = Math.max(2, Math.round(gs / 5));
  const w = Math.ceil(W / q), h = Math.ceil(H / q), base = new Float32Array(w * h * 3);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (Math.min(H - 1, y * q) * W + Math.min(W - 1, x * q)) * 4, k = (y * w + x) * 3;
    for (let c = 0; c < 3; c++) base[k + c] = Math.max(0, Math.min(255, ((O[i + c] - 128) * 2.4 + 128) * 0.85));
  }
  const [A1, A2] = [gs, gs * 0.35].map(rad => { const A = base.slice(); boxBlur(A, w, h, Math.max(1, Math.round(rad / q))); return A; });
  const a1 = Math.min(2, v.glow) * 0.75 / 255, a2 = Math.min(2, v.glow) * 0.45 / 255;
  const X0 = new Int32Array(W), X1 = new Int32Array(W), TX = new Float32Array(W);
  for (let x = 0; x < W; x++) { const fx = Math.min(w - 1, x / q); X0[x] = Math.floor(fx); X1[x] = Math.min(w - 1, X0[x] + 1); TX[x] = fx - X0[x]; }
  for (let y = 0; y < H; y++) {
    const fy = Math.min(h - 1, y / q), y0 = Math.floor(fy), y1 = Math.min(h - 1, y0 + 1), ty = fy - y0, r0 = y0 * w, r1 = y1 * w;
    let i = y * W * 4;
    for (let x = 0; x < W; x++, i += 4) {
      const tx = TX[x], k00 = (r0 + X0[x]) * 3, k01 = (r0 + X1[x]) * 3, k10 = (r1 + X0[x]) * 3, k11 = (r1 + X1[x]) * 3;
      const w00 = (1 - tx) * (1 - ty), w01 = tx * (1 - ty), w10 = (1 - tx) * ty, w11 = tx * ty;
      for (let c = 0; c < 3; c++) {
        const b1 = Math.min(255, (A1[k00 + c] * w00 + A1[k01 + c] * w01 + A1[k10 + c] * w10 + A1[k11 + c] * w11) * a1 * 255);
        const b2 = Math.min(255, (A2[k00 + c] * w00 + A2[k01 + c] * w01 + A2[k10 + c] * w10 + A2[k11 + c] * w11) * a2 * 255);
        let o = 255 - (255 - O[i + c]) * (255 - b1) / 255;
        O[i + c] = 255 - (255 - o) * (255 - b2) / 255;
      }
    }
  }
}
function adjustPass(O) {
  const b = v.bri, c = v.con, s = v.sat, hdeg = v.hue || 0;
  if (b === 1 && c === 1 && s === 1 && !hdeg) return;
  const a = hdeg * Math.PI / 180, co = Math.cos(a), si = Math.sin(a);
  const m00 = .213 + co * .787 - si * .213, m01 = .715 - co * .715 - si * .715, m02 = .072 - co * .072 + si * .928;
  const m10 = .213 - co * .213 + si * .143, m11 = .715 + co * .285 + si * .140, m12 = .072 - co * .072 - si * .283;
  const m20 = .213 - co * .213 - si * .787, m21 = .715 - co * .715 + si * .715, m22 = .072 + co * .928 + si * .072;
  for (let i = 0; i < O.length; i += 4) {
    let r = O[i] * b, g = O[i + 1] * b, bl = O[i + 2] * b;
    r = (r - 128) * c + 128; g = (g - 128) * c + 128; bl = (bl - 128) * c + 128;
    if (hdeg) { const r2 = r * m00 + g * m01 + bl * m02, g2 = r * m10 + g * m11 + bl * m12, b2 = r * m20 + g * m21 + bl * m22; r = r2; g = g2; bl = b2; }
    const L = 0.2126 * r + 0.7152 * g + 0.0722 * bl;
    O[i] = L + (r - L) * s; O[i + 1] = L + (g - L) * s; O[i + 2] = L + (bl - L) * s;
  }
}

// The untreated part of a split shows the photo with the same colour adjustments as the pattern
const adjCanvas = document.createElement('canvas'), adjCtx = adjCanvas.getContext('2d');
function paletteShifted() { return palette.length && paletteSrc.length === palette.length && palette.some((h, i) => h.toLowerCase() !== paletteSrc[i].toLowerCase()); }
// Carry palette edits onto the photo: each pixel moves by the change of its nearest palette colours, blended smoothly
function recolourPass(O) {
  const S = paletteSrc.map(hex2rgb), Dd = palette.map((h, i) => { const a = hex2rgb(h), b = S[i]; return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; });
  const k = S.length, w = new Float32Array(k);
  for (let i = 0; i < O.length; i += 4) {
    const r = O[i], g = O[i + 1], b = O[i + 2]; let sum = 0;
    for (let j = 0; j < k; j++) { const s = S[j], d = (r - s[0]) ** 2 + (g - s[1]) ** 2 + (b - s[2]) ** 2; w[j] = Math.exp(-d / 900); sum += w[j]; }
    if (sum < 1e-6) { let bj = 0, bd = 1e9; for (let j = 0; j < k; j++) { const s = S[j], d = (r - s[0]) ** 2 + (g - s[1]) ** 2 + (b - s[2]) ** 2; if (d < bd) { bd = d; bj = j; } } w.fill(0); w[bj] = 1; sum = 1; }
    let dr = 0, dg = 0, db = 0; for (let j = 0; j < k; j++) { const q = w[j] / sum; dr += Dd[j][0] * q; dg += Dd[j][1] * q; db += Dd[j][2] * q; }
    O[i] = r + dr; O[i + 1] = g + dg; O[i + 2] = b + db;
  }
}
function adjustedSource(W, H) {
  if (!v.photoColour) return src;
  const shifted = paletteShifted();
  if (v.split >= 1 || (!shifted && v.bri === 1 && v.con === 1 && v.sat === 1 && !v.hue)) return src;
  adjCanvas.width = W; adjCanvas.height = H;
  const d = sctx.getImageData(0, 0, W, H); if (shifted) recolourPass(d.data); adjustPass(d.data); adjCtx.putImageData(d, 0, 0);
  return adjCanvas;
}

function patchRects(W, H) {
  const L = Math.max(W, H), bs = W / v.psize * v.mscale, ox = v.mx * L, oy = v.my * L, out = [];
  const i0 = Math.floor(-ox / bs) - 1, i1 = Math.ceil((W - ox) / bs) + 1, j0 = Math.floor(-oy / bs) - 1, j1 = Math.ceil((H - oy) / bs) + 1;
  for (let j = j0; j < j1; j++) for (let i = i0; i < i1; i++) {
    const r = mulberry(Math.floor(hash2(i + 5000, j + 5000, pseed) * 4294967296));
    const split = (x, y, sz, depth) => {
      if (depth < v.pdepth && r() < 0.55) { const h = sz / 2; split(x, y, h, depth + 1); split(x + h, y, h, depth + 1); split(x, y + h, h, depth + 1); split(x + h, y + h, h, depth + 1); return; }
      if (r() < v.pcover) {
        const xa = Math.max(0, Math.round(x)), ya = Math.max(0, Math.round(y)), xb = Math.min(W, Math.round(x + sz)), yb = Math.min(H, Math.round(y + sz));
        if (xb > xa && yb > ya) out.push([xa, ya, xb - xa, yb - ya]);
      }
    };
    split(ox + i * bs, oy + j * bs, bs, 0);
  }
  return out;
}
function regions(W, H) { return v.split === 'patch' ? patchRects(W, H) : [region(W, H)]; }
function region(W, H) {
  const a = v.split; if (a >= 1) return [0, 0, W, H];
  if (v.side === 'left') return [0, 0, Math.round(W * a), H];
  if (v.side === 'right') { const w = Math.round(W * a); return [W - w, 0, w, H]; }
  if (v.side === 'top') return [0, 0, W, Math.round(H * a)];
  const h = Math.round(H * a); return [0, H - h, W, h];
}


// ---------- shapes mode ----------
const SHAPE_ORDER = ['dot', 'vbar', 'hline', 'square', 'diamond', 'cross'];
const GLYPH_SET = ['triangle', 'arrow', 'ring', 'x', 'cross'];
// Extra glyph outlines (unit coords, y down) for Glyph mode's larger sets — names the built-in
// glyphOps shapes already cover (triangle, diamond, x, …) always use the built-in version
const GLYPH_EXTRA = (() => {
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
// Glyph mode's sets; 'classic' is the original Glyph mix set, so the default look never changes
const GLYPH_SETS = {
  classic: GLYPH_SET,
  geometric: ['square', 'diamond', 'triangle', 'triangleDown', 'pentagon', 'hexagon', 'octagon', 'dot'],
  stars: ['star4', 'star5', 'star6', 'star8'],
  arrows: ['arrowUp', 'arrowRight', 'arrowDown', 'arrowLeft', 'chevron'],
  curves: ['dot', 'ring', 'dome', 'quarter', 'leaf', 'drop', 'heart', 'crescent'],
  // 'ch:' glyphs are typeset characters (Inter Bold) rather than drawn outlines
  money: ['ch:$', 'ch:€', 'ch:£', 'ch:¥', 'ch:₿'],
};
GLYPH_SETS.everything = [...new Set(Object.values(GLYPH_SETS).flat())];
// A thin rectangular bar centred at (cx,cy), `half` long each way, rotated by `angle` — used for the X glyph
function diagBar(cx, cy, half, th, angle) {
  const ca = Math.cos(angle), sa = Math.sin(angle), hx = ca * half, hy = sa * half, px = -sa * th / 2, py = ca * th / 2;
  return ['p', [cx - hx + px, cy - hy + py, cx + hx + px, cy + hy + py, cx + hx - px, cy + hy - py, cx - hx - px, cy - hy - py]];
}
// Geometry for any centre+size shape (dot/square/diamond/triangle/arrow/x/ring/cross), stamped per cell by Shapes mode
function glyphOps(shape, mx, my, d) {
  if (shape === 'dot') return [['c', mx, my, d / 2]];
  if (shape === 'square') return [['r', mx - d / 2, my - d / 2, d, d]];
  if (shape === 'diamond') return [['p', [mx, my - d / 2, mx + d / 2, my, mx, my + d / 2, mx - d / 2, my]]];
  if (shape === 'triangle') { const h = d / 2; return [['p', [mx, my - h, mx + h * 0.9, my + h * 0.8, mx - h * 0.9, my + h * 0.8]]]; }
  if (shape === 'arrow') { const h = d / 2; return [['p', [mx, my - h, mx + h * 0.4, my - h * 0.25, mx + h * 0.18, my - h * 0.25, mx + h * 0.18, my + h, mx - h * 0.18, my + h, mx - h * 0.18, my - h * 0.25, mx - h * 0.4, my - h * 0.25]]]; }
  if (shape === 'x') { const t = d * 0.22, rr = d / 2 * 0.95; return [diagBar(mx, my, rr, t, Math.PI / 4), diagBar(mx, my, rr, t, -Math.PI / 4)]; }
  if (shape === 'ring') return [['o', mx, my, d / 2, Math.max(0.6, d / 2 - Math.max(1, d * 0.22))]];
  if (shape === 'slash') { const t = Math.max(0.8, d * 0.08), rr = d / 2 * 0.95; return [diagBar(mx, my, rr, t, Math.PI / 4)]; }
  const U = GLYPH_EXTRA[shape];
  if (U) {
    // Fit the outline so its longer side is d, centred on (mx,my)
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const [x, y] of U) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    const k = d / Math.max(x1 - x0, y1 - y0), ox = (x0 + x1) / 2, oy = (y0 + y1) / 2;
    return [['p', U.flatMap(([x, y]) => [mx + (x - ox) * k, my + (y - oy) * k])]];
  }
  const t = d * 0.2; return [['r', mx - d / 2, my - t / 2, d, t], ['r', mx - t / 2, my - d / 2, t, d]];
}

// Shape geometry shared by the canvas renderer and the SVG / PDF exporters.
// ops: ['c', cx, cy, r] circle, ['r', x, y, w, h] rect, ['p', [x, y, ...]] polygon
function shapeGeometry(W, H, u, S) {
  const shown = palette.length ? palette : ['#000000', '#ffffff'];
  const pal = (paletteSrc.length === palette.length && palette.length ? paletteSrc : shown).map(hex2rgb);
  const lum = c => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  const cs = Math.max(2, v.scale * u), nx = Math.ceil(W / cs), ny = Math.ceil(H / cs);
  const custom = v.ground === 'custom', gc = hex2rgb(v.groundColor);
  let gi = v.ground === 'lightest' ? pal.length - 1 : v.ground === 'darkest' ? 0 : -1;
  if (custom) gi = nearestIdx(gc, pal);
  const Lg = gi >= 0 ? lum(pal[gi]) : 0;
  const r = mulberry(seed * 13 + 1), shift = Math.floor(r() * 6);
  const set = v.sset === 'mixed' ? SHAPE_ORDER : v.sset === 'glyph' ? (v.mode === 'glyph' && GLYPH_SETS[v.gset]) || GLYPH_SET : [v.sset];
  const others = pal.map((c, j) => j).filter(j => j !== gi);
  const far = others.length ? others.reduce((a, b) => Math.abs(lum(pal[b]) - Lg) > Math.abs(lum(pal[a]) - Lg) ? b : a) : 0;
  const satOf = c => Math.max(...c) - Math.min(...c);
  const rest = others.filter(j => j !== far);
  const second = rest.length ? rest.reduce((a, b) => satOf(pal[b]) > satOf(pal[a]) ? b : a) : far;
  const ink1 = shown[far], ink2 = shown[second];
  const J = v.jitter, BW = 4 + Math.floor(r() * 5), BH = 2 + Math.floor(r() * 3);
  const groups = new Map();
  const st = Math.max(1, Math.round(cs / 4));
  const ground0 = gi >= 0 ? (custom ? v.groundColor : shown[gi]) : null;
  if (v.sline) {
    // Martens lines: one line per `cs` band, cut into segments `sseg` spacings long; each line's segment
    // breaks are offset (golden-ratio stagger, re-rolled by Shuffle) so steps never line up across lines.
    // Each segment takes one of `slevels` thicknesses from its tone, or drops out on light areas
    const horiz = v.sline !== 'v', len = horiz ? W : H, across = horiz ? H : W, seg = Math.max(2, cs * v.sseg), L = [];
    const tone = avg => Math.min(1, Math.max(0, (Lg - lum(avg)) * Math.sign(Lg - Lk || 1) / span));
    // dk: 0 at the paper colour → 1 at the ink colour. Lines start at sthresh and reach full thickness at sfull
    const Lk = lum(pal[far]), span = Math.max(1, Math.abs(Lk - Lg)), lo = v.sthresh, hi = Math.max(lo + 0.01, v.sfull), phase = (seed % 997) * 0.1234;
    if (v.sline === 'd') {
      // Diagonal: the same lines in a rotated frame (u along the line, w across it), drawn as polygons
      const th = -v.sangle * Math.PI / 180, ca = Math.cos(th), sa = Math.sin(th);
      const us = [0, W * ca, H * sa, W * ca + H * sa], ws = [0, -W * sa, H * ca, -W * sa + H * ca];
      const u0 = Math.min(...us), u1 = Math.max(...us), w0 = Math.min(...ws), w1 = Math.max(...ws);
      const at = (uu, ww) => [uu * ca - ww * sa, uu * sa + ww * ca];
      for (let j = 0, n = Math.ceil((w1 - w0) / cs); j < n; j++) {
        const q0 = w0 + j * cs, q1 = q0 + cs, qm = q0 + cs / 2, off = ((j * 0.6180339887 + phase) % 1) * seg * v.sstagger;
        for (let p = u0 - off; p < u1; p += seg) {
          let sr = 0, sg = 0, sb = 0, n2 = 0;
          for (let q = q0; q < q1; q += st) for (let pp = p; pp < p + seg; pp += st) {
            const [x, y] = at(pp, q); if (x < 0 || y < 0 || x >= W || y >= H) continue;
            const i = ((y | 0) * W + (x | 0)) * 4; sr += S[i]; sg += S[i + 1]; sb += S[i + 2]; n2++;
          }
          if (!n2) continue;
          const dk = tone([sr / n2, sg / n2, sb / n2]); if (dk < lo) continue;
          const t = cs * 0.44 * v.ssize * Math.max(1, Math.ceil(Math.min(1, (dk - lo) / (hi - lo)) * v.slevels)) / v.slevels;
          L.push(['p', [...at(p, qm - t / 2), ...at(p + seg, qm - t / 2), ...at(p + seg, qm + t / 2), ...at(p, qm + t / 2)]]);
        }
      }
      groups.set(ink1, L);
      return { ground: ground0, groups, ink: ink1 };
    }
    for (let j = 0, n = Math.ceil(across / cs); j < n; j++) {
      const q0 = Math.floor(j * cs), q1 = Math.min(across, Math.floor((j + 1) * cs)), qm = (q0 + q1) / 2;
      const off = ((j * 0.6180339887 + phase) % 1) * seg * v.sstagger;
      for (let p = -off; p < len; p += seg) {
        const p0 = Math.max(0, Math.floor(p)), p1 = Math.min(len, Math.floor(p + seg)); if (p1 <= p0) continue;
        let sr = 0, sg = 0, sb = 0, n2 = 0;
        for (let q = q0; q < q1; q += st) for (let pp = p0; pp < p1; pp += st) { const i = ((horiz ? q : pp) * W + (horiz ? pp : q)) * 4; sr += S[i]; sg += S[i + 1]; sb += S[i + 2]; n2++; }
        if (!n2) continue;
        const avg = [sr / n2, sg / n2, sb / n2];
        const dk = tone(avg);
        if (dk < lo) continue;
        const fq = Math.min(1, (dk - lo) / (hi - lo));
        const t = cs * 0.44 * v.ssize * Math.max(1, Math.ceil(fq * v.slevels)) / v.slevels;
        L.push(horiz ? ['r', p0, qm - t / 2, p1 - p0, t] : ['r', qm - t / 2, p0, t, p1 - p0]);
      }
    }
    groups.set(ink1, L);
    return { ground: ground0, groups, ink: ink1 };
  }
  for (let cy = 0; cy < ny; cy++) for (let cx = 0; cx < nx; cx++) {
    const x0 = Math.floor(cx * cs), y0 = Math.floor(cy * cs), x1 = Math.min(W, Math.floor((cx + 1) * cs)), y1 = Math.min(H, Math.floor((cy + 1) * cs));
    let sr = 0, sg = 0, sb = 0, n = 0;
    for (let y = y0; y < y1; y += st) for (let x = x0; x < x1; x += st) { const i = (y * W + x) * 4; sr += S[i]; sg += S[i + 1]; sb += S[i + 2]; n++; }
    if (!n) continue;
    const avg = [sr / n, sg / n, sb / n];
    let idx = 0, bd = 1e9; pal.forEach((p, j) => { const d = (avg[0] - p[0]) ** 2 * .3 + (avg[1] - p[1]) ** 2 * .59 + (avg[2] - p[2]) ** 2 * .11; if (d < bd) { bd = d; idx = j; } });
    if (idx === gi) continue;
    let shape = v.sby === 'rows' ? set[(Math.floor(cy / v.bandRows) + shift) % set.length] : set[(idx + shift) % set.length];
    if (J > 0 && set.length > 1) { const bx = Math.floor(cx / BW), by = Math.floor(cy / BH), h1 = hash2(bx, by, seed), h2 = hash2(by, bx, seed + 99); if (h1 < J) shape = set[Math.floor(h2 * set.length)]; }
    const f = gi >= 0 ? Math.min(1, Math.abs(lum(avg) - Lg) / 160) : lum(avg) / 255;
    let sz = v.ssize * (1 - v.halftone + v.halftone * f);
    if (v.slevels > 0) {
      // Snap to slevels thickness steps. Tone is re-spread across the range a drawn cell can have
      // (from halfway to the ink colour up to full ink), so every step gets used
      const f0 = gi >= 0 ? Math.min(0.95, Math.abs(lum(pal[far]) - Lg) / 2 / 160) : 0, fq = Math.max(0, (f - f0) / (1 - f0));
      sz = v.ssize * Math.max(1, Math.ceil(fq * v.slevels)) / v.slevels;
    }
    if (sz <= 0.02) continue;
    let col;
    if (v.stone === 'mono') col = ink1;
    else if (v.stone === 'duo') col = idx === far || Math.abs(lum(pal[idx]) - Lg) > Math.abs(lum(pal[second]) - Lg) * 1.15 ? ink1 : ink2;
    else col = v.cmode === 'image' ? rgb2hex(avg.map(c => Math.round(c / 4) * 4)) : shown[idx];
    let L = groups.get(col); if (!L) { L = []; groups.set(col, L); }
    const mx = x0 + cs / 2, my = y0 + cs / 2, d = cs * sz;
    // Bar width scales lines/bars across their cell, up to touching neighbours (no gap) at most
    if (shape === 'hline') { const t = Math.min(y1 - y0 + 1, d * 0.44 * v.sbarw); L.push(['r', x0 - 0.5, my - t / 2, (x1 - x0) + 1, t]); }
    else if (shape === 'vbar') { const t = Math.min(x1 - x0 + 1, d * 0.54 * v.sbarw); L.push(['r', mx - t / 2, y0 - 0.5, t, (y1 - y0) + 1]); }
    else if (shape.startsWith('ch:')) L.push(['t', mx, my, d, shape.slice(3)]);
    else L.push(...glyphOps(shape, mx, my, d));
  }
  const ground = gi >= 0 ? (custom ? v.groundColor : shown[gi]) : null;
  return { ground, groups, ink: ink1 };
}
const RING_SEG = 20;
function addOp(P, o) {
  if (o[0] === 't') return; // text glyphs are drawn with fillText, not as paths
  if (o[0] === 'c') { P.moveTo(o[1] + o[3], o[2]); P.arc(o[1], o[2], o[3], 0, Math.PI * 2); }
  else if (o[0] === 'r') P.rect(o[1], o[2], o[3], o[4]);
  else if (o[0] === 'o') {
    // Annulus via two opposite-wound N-gons — the reversed inner loop punches the hole under nonzero fill
    const [, cx, cy, rO, rI] = o;
    P.moveTo(cx + rO, cy); for (let i = 1; i <= RING_SEG; i++) { const a = i / RING_SEG * Math.PI * 2; P.lineTo(cx + rO * Math.cos(a), cy + rO * Math.sin(a)); } P.closePath();
    P.moveTo(cx + rI, cy); for (let i = 1; i <= RING_SEG; i++) { const a = -i / RING_SEG * Math.PI * 2; P.lineTo(cx + rI * Math.cos(a), cy + rI * Math.sin(a)); } P.closePath();
  }
  else { const q = o[1]; P.moveTo(q[0], q[1]); for (let i = 2; i < q.length; i += 2) P.lineTo(q[i], q[i + 1]); P.closePath(); }
}

// Mono grain, seeded so it holds still between redraws
function grainPass(O) {
  if (!(v.grain > 0)) return;
  const nr = mulberry(seed * 31 + 5);
  for (let i = 0; i < O.length; i += 4) { const n = (nr() - 0.5) * 2 * v.grain; O[i] += n; O[i + 1] += n; O[i + 2] += n; }
}
// With a dither on, grain goes over the finished dots as visible texture rather than being dithered away
function grainFinish(W, H) {
  if (!(v.grain > 0) || !W || !H) return;
  const d = fctx.getImageData(0, 0, W, H); grainPass(d.data); fctx.putImageData(d, 0, 0);
}
// The Dither tab as a finish over the treated layer — Pixel (internally 'weave') dithers inside its own pipeline instead
function ditherFinish(W, H, u) {
  if (v.dither === 'off' || !W || !H) return;
  const d = fctx.getImageData(0, 0, W, H); dither(d.data, W, H, u, palette.map(hex2rgb)); fctx.putImageData(d, 0, 0);
}
function renderShapes(W, H, g, u, live) {
  patternSource(W, H);
  const pkey = JSON.stringify(['shapes', W, H, v.zoom, v.panX, v.panY, palette, v.cmode, v.scale, v.ssize, v.sbarw, v.halftone, v.sset, v.sby, v.bandRows, v.ground, v.groundColor, v.grain, v.dither, v.jitter, v.stone, v.mode, v.gset, v.invert, v.slevels, v.sline, v.sseg, v.sstagger, v.sthresh, v.sfull, v.sangle, seed, imgId]);
  let base;
  if (live && cache && cache.pkey === pkey) base = cache.P;
  else {
    const S = sctx.getImageData(0, 0, W, H).data;
    const G = shapeGeometry(W, H, u, S);
    if ((v.mode === 'glyph' || v.mode === 'martens') && v.invert && G.ground) { const gr = G.ground, ink = G.ink; G.ground = ink; G.groups = new Map([...G.groups].map(([c, ops]) => [c === ink ? gr : c, ops])); }
    tmp.width = W; tmp.height = H;
    if (G.ground) { tctx.fillStyle = G.ground; tctx.fillRect(0, 0, W, H); } else tctx.drawImage(src, 0, 0);
    for (const [col, ops] of G.groups) {
      const P = new Path2D(); for (const o of ops) addOp(P, o); tctx.fillStyle = col; tctx.fill(P);
      // Typeset glyphs: font size picked so the symbol's height roughly matches a drawn glyph of size d
      tctx.textAlign = 'center'; tctx.textBaseline = 'middle';
      for (const o of ops) if (o[0] === 't') { tctx.font = `700 ${Math.max(4, o[3] * 1.3).toFixed(1)}px Inter, "Helvetica Neue", Arial, sans-serif`; tctx.fillText(o[4], o[1], o[2]); }
    }
    const O = tctx.getImageData(0, 0, W, H).data;
    if (v.dither === 'off') grainPass(O);
    base = { O };
    cache = live ? { pkey, P: base } : null;
  }
  const gkey = pkey + '|' + v.glow + '|' + v.gsize;
  let O;
  if (live && cache && cache.gkey === gkey) O = cache.G.slice();
  else { O = base.O.slice(); glowPass(O, W, H, u); if (live && cache) { cache.gkey = gkey; cache.G = O.slice(); } }
  adjustPass(O);
  tmp.width = W; tmp.height = H; tctx.putImageData(new ImageData(O, W, H), 0, 0);
  fin.width = W; fin.height = H; fctx.globalCompositeOperation = 'source-over'; fctx.globalAlpha = 1; fctx.drawImage(tmp, 0, 0);
  ditherFinish(W, H, u);
  if (v.dither !== 'off') grainFinish(W, H);
  if (v.blend !== 'none' && v.mix > 0) { fctx.globalCompositeOperation = v.blend; fctx.globalAlpha = v.mix; fctx.drawImage(src, 0, 0); fctx.globalCompositeOperation = 'source-over'; fctx.globalAlpha = 1; }
  g.drawImage(adjustedSource(W, H), 0, 0);
  for (const [qx, qy, qw, qh] of regions(W, H)) { const w2 = Math.min(qw, W - qx), h2 = Math.min(qh, H - qy); if (w2 > 0 && h2 > 0) g.drawImage(fin, qx, qy, w2, h2, qx, qy, w2, h2); }
}


// ---------- none: no pattern — the photo itself, with the Adjust, Colour and Texture settings ----------
function renderNone(W, H, g, u) {
  patternSource(W, H);
  const O = sctx.getImageData(0, 0, W, H).data;
  if (v.photoColour && paletteShifted()) recolourPass(O);
  adjustPass(O);
  glowPass(O, W, H, u);
  if (v.dither === 'off') grainPass(O);
  tmp.width = W; tmp.height = H; tctx.putImageData(new ImageData(O, W, H), 0, 0);
  fin.width = W; fin.height = H; fctx.globalCompositeOperation = 'source-over'; fctx.globalAlpha = 1; fctx.drawImage(tmp, 0, 0);
  ditherFinish(W, H, u);
  if (v.dither !== 'off') grainFinish(W, H);
  if (v.blend !== 'none' && v.mix > 0) { fctx.globalCompositeOperation = v.blend; fctx.globalAlpha = v.mix; fctx.drawImage(src, 0, 0); fctx.globalCompositeOperation = 'source-over'; fctx.globalAlpha = 1; }
  g.drawImage(adjustedSource(W, H), 0, 0);
  for (const [qx, qy, qw, qh] of regions(W, H)) { const w2 = Math.min(qw, W - qx), h2 = Math.min(qh, H - qy); if (w2 > 0 && h2 > 0) g.drawImage(fin, qx, qy, w2, h2, qx, qy, w2, h2); }
}

// ---------- dither mode: the whole image reduced straight to a 2(+)-colour dither ----------
function renderDither(W, H, g, u, live) {
  patternSource(W, H);
  const pkey = JSON.stringify(['dither', W, H, v.zoom, v.panX, v.panY, v.bri, v.con, v.sat, v.hue, palette, v.ddither, v.ddlevels, v.scale, v.ddpal, v.ddvary, v.grain, v.invert, seed, imgId]);
  let O;
  if (live && cache && cache.pkey === pkey) O = cache.O.slice();
  else {
    O = sctx.getImageData(0, 0, W, H).data.slice();
    adjustPass(O);
    dither(O, W, H, u, palette.map(hex2rgb), { type: v.ddither, levels: v.ddlevels, size: v.scale * 0.2, usePal: v.ddpal, vary: v.ddvary });
    grainPass(O);
    if (live) cache = { pkey, O: O.slice() };
  }
  tmp.width = W; tmp.height = H; tctx.putImageData(new ImageData(O, W, H), 0, 0);
  fin.width = W; fin.height = H; fctx.globalCompositeOperation = 'source-over'; fctx.globalAlpha = 1; fctx.drawImage(tmp, 0, 0);
  g.drawImage(adjustedSource(W, H), 0, 0);
  for (const [qx, qy, qw, qh] of regions(W, H)) { const w2 = Math.min(qw, W - qx), h2 = Math.min(qh, H - qy); if (w2 > 0 && h2 > 0) g.drawImage(fin, qx, qy, w2, h2, qx, qy, w2, h2); }
}

// ---------- glyph mode: the Shapes engine set up as "Glyph mix" — a fine grid of solid glyphs
// (triangle/arrow/ring/x/cross) sized by tone and clustered in patches, light areas left as paper
// on a plain ground, mono ink. Glyph keeps its own settings so it never disturbs Shapes mode ----------
if (document.fonts) document.fonts.load('700 32px Inter', '$€£¥₿').then(() => { cache = null; if (img) schedule(); }).catch(() => {});
function renderGlyph(W, H, g, u, live) {
  const o = { sset: 'glyph', sby: 'tone', stone: 'mono', ground: 'lightest' };
  const keep = {}; for (const k in o) keep[k] = v[k];
  Object.assign(v, o);
  try { renderShapes(W, H, g, u, live); } finally { Object.assign(v, keep); }
}

// ---------- martens mode: Karel Martens' "Patterns" covers — lines at a fixed spacing, each stepping
// between a few set thicknesses (thicker where darker), dropping out to white space in light areas.
// Built on the Shapes engine's line/bar shapes with thickness snapped to mlevels steps ----------
function renderMartens(W, H, g, u, live) {
  const o = { sline: v.mdir, stone: 'mono', ground: 'lightest',
    ssize: v.msize, slevels: v.mlevels, sseg: v.mseg, sstagger: v.mstagger, sthresh: v.mthresh, sfull: v.mfull, sangle: v.mangle };
  const keep = {}; for (const k in o) keep[k] = v[k];
  Object.assign(v, o);
  try { renderShapes(W, H, g, u, live); } finally { Object.assign(v, keep); }
}

// ---------- density zones: re-render at several densities, then tile ----------
function zoneRects(W, H) {
  const r = mulberry(seed * 19 + 7), n = v.zones, L = Math.min(4, n), out = [];
  const lvl = (i, count) => v.zorder === 'random' ? Math.floor(r() * L) : (v.zorder === 'coarse' ? L - 1 - Math.min(L - 1, Math.floor(i * L / count)) : Math.min(L - 1, Math.floor(i * L / count)));
  if (v.zmode === 'stack') {
    for (let i = 0; i < n; i++) { const y0 = Math.round(i * H / n), y1 = Math.round((i + 1) * H / n); out.push([0, y0, W, y1 - y0, lvl(i, n)]); }
  } else {
    const nx = n, ny = Math.max(1, Math.round(n * H / W));
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const x0 = Math.round(i * W / nx), x1 = Math.round((i + 1) * W / nx), y0 = Math.round(j * H / ny), y1 = Math.round((j + 1) * H / ny);
      out.push([x0, y0, x1 - x0, y1 - y0, v.zorder === 'random' ? Math.floor(r() * L) : lvl(j, ny)]);
    }
  }
  return { rects: out, L };
}
function renderZones(W, H, target) {
  const { rects, L } = zoneRects(W, H);
  const keep = { scale: v.scale, dsize: v.dsize, zmode: v.zmode };
  const used = [...new Set(rects.map(z => z[4]))];
  const layers = {};
  v.zmode = 'off';
  try {
    for (const l of used) {
      const f = L > 1 ? 1 + (v.zrange - 1) * l / (L - 1) : 1;
      v.scale = keep.scale * f; v.dsize = Math.max(1, Math.round(keep.dsize * f));
      const c = document.createElement('canvas'); render(W, H, c); layers[l] = c;
    }
  } finally { Object.assign(v, keep); }
  target.width = W; target.height = H; const g = target.getContext('2d');
  for (const [x, y, w, h, l] of rects) if (w > 0 && h > 0) g.drawImage(layers[l], x, y, w, h, x, y, w, h);
}

function render(W, H, target) {
  if (v.zmode !== 'off' && img) return renderZones(W, H, target);
  const g = target.getContext('2d');
  target.width = W; target.height = H;
  if (!img) return;
  const u = Math.max(W, H) / 850;
  const live = target === out;
  if (v.mode === 'none') return renderNone(W, H, g, u);
  if (v.mode === 'shapes') return renderShapes(W, H, g, u, live);
  if (v.mode === 'dither') return renderDither(W, H, g, u, live);
  if (v.mode === 'glyph') return renderGlyph(W, H, g, u, live);
  if (v.mode === 'martens') return renderMartens(W, H, g, u, live);
  const pkey = JSON.stringify([W, H, v.zoom, v.panX, v.panY, v.detail, v.perstripe, v.cmode, palette, v.kcount, v.pcw, v.prh, v.merge, v.uneven, v.scale, v.depth, v.offset, v.grain, v.dither, v.dlevels, v.dsize, v.dpal, v.dvary, v.invert, seed, imgId]);
  let P;
  if (live && cache && cache.pkey === pkey) P = cache.P;
  else {
    P = (() => {
  patternSource(W, H);
  const S = sctx.getImageData(0, 0, W, H).data;
  const rx = 0, ry = 0, RW = W, RH = H;
  const rnd = mulberry(seed), nrnd = mulberry(seed * 31 + 5);
  // Pixel blocks are Scale-sized like Shapes cells, stretched by Column width / Row height; Merge and Uneven rows vary them
  const cols = Math.max(2, Math.round(W / (v.scale * v.pcw * u))), rows = Math.max(2, Math.round(H / (v.scale * v.prh * u))), pitch = v.scale * 0.7 * u, depth = v.depth, noise = v.dither === 'off' ? v.grain : 0, det = v.detail;
  const usePal = v.cmode === 'palette' && palette.length, pal = palette.map(hex2rgb), palM = (paletteSrc.length === palette.length ? paletteSrc : palette).map(hex2rgb);
  const cx = Array.from({ length: cols + 1 }, (_, i) => Math.round(i * RW / cols));
  const hs = Array.from({ length: rows }, () => 1 + (rnd() * 2 - 1) * v.uneven * 0.75), hsum = hs.reduce((a, b) => a + b, 0);
  const ry2 = [0]; hs.forEach(h => ry2.push(ry2[ry2.length - 1] + h / hsum * RH)); ry2[rows] = RH;
  const O = new Uint8ClampedArray(RW * RH * 4), fac = new Float32Array(RW), sxa = new Int32Array(RW);
  for (let r = 0; r < rows; r++) {
    let c = 0;
    while (c < cols) {
      let c2 = c + 1; while (c2 < cols && c2 - c < 6 && rnd() < v.merge) c2++;
      const x0 = cx[c], x1 = cx[c2], y0 = Math.round(ry2[r]), y1 = Math.round(ry2[r + 1]);
      let sr = 0, sg = 0, sb = 0, n = 0; const st = Math.max(2, Math.round(4 * u));
      for (let y = y0; y < y1; y += st) for (let x = x0; x < x1; x += st) { const i = ((ry + y) * W + rx + x) * 4; sr += S[i]; sg += S[i + 1]; sb += S[i + 2]; n++; }
      const avg = n ? [sr / n, sg / n, sb / n] : [0, 0, 0];
      let col = avg;
      if (usePal) {
        const cnt = new Float32Array(palM.length);
        for (let y = y0; y < y1; y += st) for (let x = x0; x < x1; x += st) { const i = ((ry + y) * W + rx + x) * 4; cnt[nearestIdx([S[i], S[i + 1], S[i + 2]], palM)]++; }
        let bi = 0; for (let j = 1; j < cnt.length; j++) if (cnt[j] > cnt[bi]) bi = j;
        col = pal[bi];
      }
      const ph = v.offset ? rnd() * pitch : 0;
      for (let x = x0; x < x1; x++) {
        const m = ((x + ph) % pitch) / pitch;
        sxa[x] = rx + (v.perstripe ? Math.min(x1 - 1, Math.max(x0, Math.round(x - m * pitch + pitch / 2))) : x);
        let f = 0.62 + 0.38 * Math.min(1, Math.max(0, Math.sin(Math.PI * m) * 1.35));
        if (m < 0.13) f *= 0.55;
        f *= 1 + 0.18 * Math.exp(-(((m - 0.55) * pitch) ** 2) / (6 * u * u));
        fac[x] = 1 - depth * (1 - f);
      }
      const nc = noise * 0.5;
      for (let y = y0; y < y1; y++) {
        let i = (y * RW + x0) * 4; const base = (ry + y) * W;
        for (let x = x0; x < x1; x++, i += 4) {
          const f = fac[x], ln = noise ? (nrnd() - 0.5) * 2 * noise : 0, j = (base + sxa[x]) * 4;
          O[i] = (col[0] + (S[j] - avg[0]) * det) * f + ln + (nc ? (nrnd() - 0.5) * nc : 0);
          O[i + 1] = (col[1] + (S[j + 1] - avg[1]) * det) * f + ln + (nc ? (nrnd() - 0.5) * nc : 0);
          O[i + 2] = (col[2] + (S[j + 2] - avg[2]) * det) * f + ln + (nc ? (nrnd() - 0.5) * nc : 0);
          O[i + 3] = 255;
        }
      }
      c = c2;
    }
  }
  dither(O, RW, RH, u, pal);
      return { O, RW, RH, rx, ry, cx, cols };
    })();
    cache = live ? { pkey, P } : null;
  }
  const { RW, RH, rx, ry, cx, cols } = P;
  const gkey = pkey + '|' + v.glow + '|' + v.gsize;
  let O;
  if (live && cache && cache.gkey === gkey) O = cache.G.slice();
  else { O = P.O.slice(); glowPass(O, RW, RH, u); if (live && cache) { cache.gkey = gkey; cache.G = O.slice(); } }
  adjustPass(O);
  const rnd = mulberry(seed * 7 + 3);
  tmp.width = RW; tmp.height = RH; tctx.putImageData(new ImageData(O, RW, RH), 0, 0);
  fin.width = RW; fin.height = RH;
  fctx.globalCompositeOperation = 'source-over'; fctx.globalAlpha = 1;
  fctx.drawImage(tmp, 0, 0);
  if (v.dither !== 'off') grainFinish(RW, RH);
  if (v.accents > 0 && cols > 1) {
    const edges = Array.from({ length: cols - 1 }, (_, i) => i + 1);
    for (let i = edges.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [edges[i], edges[j]] = [edges[j], edges[i]]; }
    for (let a = 0; a < Math.min(v.accents, edges.length); a++) {
      const bx = cx[edges[a]], ya = rnd() * RH, yb = rnd() * RH, top = Math.min(ya, yb), len = Math.max(RH * 0.12, Math.abs(ya - yb));
      fctx.fillStyle = HOT[a % HOT.length]; fctx.globalAlpha = 0.85; fctx.fillRect(bx - 0.6 * u, top, 1.2 * u, len);
      fctx.globalAlpha = 0.6; for (let y = top; y < top + len; y += 9 * u) fctx.fillRect(bx - 3.5 * u, y, 4 * u, 0.7 * u); fctx.globalAlpha = 1;
    }
  }
  if (v.blend !== 'none' && v.mix > 0) { fctx.globalCompositeOperation = v.blend; fctx.globalAlpha = v.mix; fctx.drawImage(src, rx, ry, RW, RH, 0, 0, RW, RH); fctx.globalCompositeOperation = 'source-over'; fctx.globalAlpha = 1; }
  // untreated image underneath, treated region on top
  g.drawImage(adjustedSource(W, H), 0, 0);
  for (const [qx, qy, qw, qh] of regions(W, H)) { const w2 = Math.min(qw, W - qx), h2 = Math.min(qh, H - qy); if (w2 > 0 && h2 > 0) g.drawImage(fin, qx, qy, w2, h2, qx, qy, w2, h2); }
}


// ---------- palette ----------
function extractPalette() {
  const c = document.createElement('canvas'), w = 160, h = Math.max(1, Math.round(160 * srcH() / srcW()));
  c.width = w; c.height = h; const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(img, 0, 0, w, h);
  const D = g.getImageData(0, 0, w, h).data, px = [];
  for (let i = 0; i < D.length; i += 8) px.push([D[i], D[i + 1], D[i + 2]]);
  const k = v.kcount, r = mulberry(11), d2 = (p, q) => (p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2 + (p[2] - q[2]) ** 2;
  // k-means++ start: spread the starting colours apart so distinct hues get their own cluster
  const cent = [px[Math.floor(r() * px.length)].slice()];
  while (cent.length < k) {
    let far = px[0], fd = -1;
    for (let i = 0; i < px.length; i += 3) { const p = px[i]; let m = 1e9; for (const q of cent) m = Math.min(m, d2(p, q)); const sat = Math.max(...p) - Math.min(...p); const sc = m * (1 + sat / 128); if (sc > fd) { fd = sc; far = p; } }
    cent.push(far.slice());
  }
  for (let it = 0; it < 14; it++) {
    const acc = cent.map(() => [0, 0, 0, 0]);
    for (const p of px) { let bi = 0, bd = 1e9; for (let j = 0; j < cent.length; j++) { const dd = d2(p, cent[j]); if (dd < bd) { bd = dd; bi = j; } } const a = acc[bi]; a[0] += p[0]; a[1] += p[1]; a[2] += p[2]; a[3]++; }
    acc.forEach((a, j) => { if (a[3]) cent[j] = [a[0] / a[3], a[1] / a[3], a[2] / a[3]]; });
  }
  // averaging mutes colour, so lift each cluster's saturation back up
  const out = cent.map(c => { const L = 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; return c.map(x => Math.max(0, Math.min(255, L + (x - L) * 1.3))); });
  out.sort((a, b) => (a[0] * .3 + a[1] * .59 + a[2] * .11) - (b[0] * .3 + b[1] * .59 + b[2] * .11));
  palette = out.map(rgb2hex); paletteSrc = palette.slice(); paletteAuto = true;
}



// ---------- layout ----------
// Desktop chrome footprint: the stacked tab + setting columns on the left, title/slider/swatches at the bottom
const DESK_LEFT = 124, DESK_BOTTOM = 150;
function layout() {
  // Fit the artboard between the top bar and the tab bar (tab controls may still float over it)
  // Keep the artboard clear of the chrome. The top bar's row is fixed height (on phones its burger menu
  // drops down over the art); on desktop the tab and setting columns sit left and their controls at the bottom
  const bar = $('vbar').getBoundingClientRect(), tabs = $('tabs').getBoundingClientRect(), gap = 10;
  const desk = matchMedia('(min-width: 900px)').matches && tabs.height;
  const top = bar.height ? bar.top + 44 + gap : gap;
  const bottom = desk ? innerHeight - DESK_BOTTOM : tabs.height ? tabs.top - gap : innerHeight - gap;
  const x0 = desk ? DESK_LEFT : gap, aw = innerWidth - x0 - gap, ah = Math.max(80, bottom - top);
  const r = ratio(); let w = aw, h = w / r; if (h > ah) { h = ah; w = h * r; }
  out.style.width = w + 'px'; out.style.height = h + 'px'; out.style.left = x0 + (aw - w) / 2 + 'px'; out.style.top = top + (ah - h) / 2 + 'px';
  let k = Math.min(window.devicePixelRatio || 1, 2) * (interactive ? 0.5 : 1) * (vid && !vid.paused ? 0.6 : 1);
  if (recording) k = recLong / Math.max(w, h);
  const W = Math.round(w * k), H = Math.round(h * k);
  // A fresh image shows unprocessed until any setting changes — not only on opening a tab, since a
  // tab is usually already open when switching images
  if (rawPreview && rawKey() !== rawSnap) rawPreview = false;
  if ((comparing || rawPreview) && img) { out.width = W; out.height = H; drawSource(W, H); out.getContext('2d').drawImage(src, 0, 0); return; }
  render(W, H, out);
}
let rawSnap = '';
const rawKey = () => JSON.stringify([v, palette, seed]);
const showRaw = () => { rawPreview = true; rawSnap = rawKey(); };
let queued = false;
const schedule = () => { if (queued) return; queued = true; requestAnimationFrame(() => { queued = false; layout(); }); };
addEventListener('resize', schedule);

// ---------- icons ----------
// Icons: Lucide (lucide.dev), ISC licence
const P = 'fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"';
const I = d => `<svg width="22" height="22" viewBox="0 0 24 24" ${P}>${d}</svg>`;
const IC = {
  adjust: I("<path d=\"m12 14 4-4\" />  <path d=\"M3.34 19a10 10 0 1 1 17.32 0\" />"),
  colour: I("<path d=\"M12 22a1 1 0 0 1 0-20 10 9 0 0 1 10 9 5 5 0 0 1-5 5h-2.25a1.75 1.75 0 0 0-1.4 2.8l.3.4a1.75 1.75 0 0 1-1.4 2.8z\" />  <circle cx=\"13.5\" cy=\"6.5\" r=\".5\" fill=\"currentColor\" />  <circle cx=\"17.5\" cy=\"10.5\" r=\".5\" fill=\"currentColor\" />  <circle cx=\"6.5\" cy=\"12.5\" r=\".5\" fill=\"currentColor\" />  <circle cx=\"8.5\" cy=\"7.5\" r=\".5\" fill=\"currentColor\" />"),
  pattern: I("<rect width=\"18\" height=\"18\" x=\"3\" y=\"3\" rx=\"2\" />  <path d=\"M7.5 3v18\" />  <path d=\"M12 3v18\" />  <path d=\"M16.5 3v18\" />"),
  dither: I("<rect width=\"18\" height=\"18\" x=\"3\" y=\"3\" rx=\"2\" />  <path d=\"M3 9h18\" />  <path d=\"M3 15h18\" />  <path d=\"M9 3v18\" />  <path d=\"M15 3v18\" />"),
  crop: I("<path d=\"M6 2v14a2 2 0 0 0 2 2h14\" />  <path d=\"M18 22V8a2 2 0 0 0-2-2H2\" />"),
  sun: I("<circle cx=\"12\" cy=\"12\" r=\"4\" />  <path d=\"M12 2v2\" />  <path d=\"M12 20v2\" />  <path d=\"m4.93 4.93 1.41 1.41\" />  <path d=\"m17.66 17.66 1.41 1.41\" />  <path d=\"M2 12h2\" />  <path d=\"M20 12h2\" />  <path d=\"m6.34 17.66-1.41 1.41\" />  <path d=\"m19.07 4.93-1.41 1.41\" />"),
  contrast: I("<circle cx=\"12\" cy=\"12\" r=\"10\" />  <path d=\"M12 18a6 6 0 0 0 0-12v12z\" />"),
  drop: I("<path d=\"M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5C6 11.1 5 13 5 15a7 7 0 0 0 7 7z\" />"),
  glow: I("<path d=\"M11.017 2.814a1 1 0 0 1 1.966 0l1.051 5.558a2 2 0 0 0 1.594 1.594l5.558 1.051a1 1 0 0 1 0 1.966l-5.558 1.051a2 2 0 0 0-1.594 1.594l-1.051 5.558a1 1 0 0 1-1.966 0l-1.051-5.558a2 2 0 0 0-1.594-1.594l-5.558-1.051a1 1 0 0 1 0-1.966l5.558-1.051a2 2 0 0 0 1.594-1.594z\" />  <path d=\"M20 2v4\" />  <path d=\"M22 4h-4\" />  <circle cx=\"4\" cy=\"20\" r=\"2\" />"),
  radius: I("<path d=\"M10.1 2.18a9.93 9.93 0 0 1 3.8 0\" />  <path d=\"M17.6 3.71a9.95 9.95 0 0 1 2.69 2.7\" />  <path d=\"M21.82 10.1a9.93 9.93 0 0 1 0 3.8\" />  <path d=\"M20.29 17.6a9.95 9.95 0 0 1-2.7 2.69\" />  <path d=\"M13.9 21.82a9.94 9.94 0 0 1-3.8 0\" />  <path d=\"M6.4 20.29a9.95 9.95 0 0 1-2.69-2.7\" />  <path d=\"M2.18 13.9a9.93 9.93 0 0 1 0-3.8\" />  <path d=\"M3.71 6.4a9.95 9.95 0 0 1 2.7-2.69\" />  <circle cx=\"12\" cy=\"12\" r=\"1\" />"),
  blend: I("<circle cx=\"15\" cy=\"9\" r=\"7\" />  <circle cx=\"9\" cy=\"15\" r=\"7\" />"),
  mix: I("<path d=\"M12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83z\" />  <path d=\"M2 12a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 12\" />  <path d=\"M2 17a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 17\" />"),
  eye: I("<path d=\"M3 7V5a2 2 0 0 1 2-2h2\" />  <path d=\"M17 3h2a2 2 0 0 1 2 2v2\" />  <path d=\"M21 17v2a2 2 0 0 1-2 2h-2\" />  <path d=\"M7 21H5a2 2 0 0 1-2-2v-2\" />  <circle cx=\"12\" cy=\"12\" r=\"1\" />  <path d=\"M18.944 12.33a1 1 0 0 0 0-.66 7.5 7.5 0 0 0-13.888 0 1 1 0 0 0 0 .66 7.5 7.5 0 0 0 13.888 0\" />"),
  bars: I("<path d=\"M3 5v14\" />  <path d=\"M8 5v14\" />  <path d=\"M12 5v14\" />  <path d=\"M17 5v14\" />  <path d=\"M21 5v14\" />"),
  palette: I("<path d=\"m14.622 17.897-10.68-2.913\" />  <path d=\"M18.376 2.622a1 1 0 1 1 3.002 3.002L17.36 9.643a.5.5 0 0 0 0 .707l.944.944a2.41 2.41 0 0 1 0 3.408l-.944.944a.5.5 0 0 1-.707 0L8.354 7.348a.5.5 0 0 1 0-.707l.944-.944a2.41 2.41 0 0 1 3.408 0l.944.944a.5.5 0 0 0 .707 0z\" />  <path d=\"M9 8c-1.804 2.71-3.97 3.46-6.583 3.948a.507.507 0 0 0-.302.819l7.32 8.883a1 1 0 0 0 1.185.204C12.735 20.405 16 16.792 16 15\" />"),
  swatch: I("<path d=\"M11 17a4 4 0 0 1-8 0V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2Z\" />  <path d=\"M16.7 13H19a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2H7\" />  <path d=\"M 7 17h.01\" />  <path d=\"m11 8 2.3-2.3a2.4 2.4 0 0 1 3.404.004L18.6 7.6a2.4 2.4 0 0 1 .026 3.434L9.9 19.8\" />"),
  wand: I("<path d=\"m21.64 3.64-1.28-1.28a1.21 1.21 0 0 0-1.72 0L2.36 18.64a1.21 1.21 0 0 0 0 1.72l1.28 1.28a1.2 1.2 0 0 0 1.72 0L21.64 5.36a1.2 1.2 0 0 0 0-1.72\" />  <path d=\"m14 7 3 3\" />  <path d=\"M5 6v4\" />  <path d=\"M19 14v4\" />  <path d=\"M10 2v2\" />  <path d=\"M7 8H3\" />  <path d=\"M21 16h-4\" />  <path d=\"M11 3H9\" />"),
  picker: I("<path d=\"m12 9-8.414 8.414A2 2 0 0 0 3 18.828v1.344a2 2 0 0 1-.586 1.414A2 2 0 0 1 3.828 21h1.344a2 2 0 0 0 1.414-.586L15 12\" />  <path d=\"m18 9 .4.4a1 1 0 1 1-3 3l-3.8-3.8a1 1 0 1 1 3-3l.4.4 3.4-3.4a1 1 0 1 1 3 3z\" />  <path d=\"m2 22 .414-.414\" />"),
  cols: I("<rect width=\"18\" height=\"18\" x=\"3\" y=\"3\" rx=\"2\" />  <path d=\"M9 3v18\" />  <path d=\"M15 3v18\" />"),
  rows: I("<rect width=\"18\" height=\"18\" x=\"3\" y=\"3\" rx=\"2\" />  <path d=\"M21 9H3\" />  <path d=\"M21 15H3\" />"),
  merge: I("<path d=\"M12 21v-6\" />  <path d=\"M12 9V3\" />  <path d=\"M3 15h18\" />  <path d=\"M3 9h18\" />  <rect width=\"18\" height=\"18\" x=\"3\" y=\"3\" rx=\"2\" />"),
  uneven: I("<rect width=\"20\" height=\"6\" x=\"2\" y=\"4\" rx=\"2\" />  <rect width=\"20\" height=\"6\" x=\"2\" y=\"14\" rx=\"2\" />"),
  shuffle: I("<path d=\"m18 14 4 4-4 4\" />  <path d=\"m18 2 4 4-4 4\" />  <path d=\"M2 18h1.973a4 4 0 0 0 3.3-1.7l5.454-8.6a4 4 0 0 1 3.3-1.7H22\" />  <path d=\"M2 6h1.972a4 4 0 0 1 3.6 2.2\" />  <path d=\"M22 18h-6.041a4 4 0 0 1-3.3-1.8l-.359-.45\" />"),
  width: I("<path d=\"m18 8 4 4-4 4\" />  <path d=\"M2 12h20\" />  <path d=\"m6 8-4 4 4 4\" />"),
  depth: I("<path d=\"M2 12q2.5 2 5 0t5 0 5 0 5 0\" />  <path d=\"M2 19q2.5 2 5 0t5 0 5 0 5 0\" />  <path d=\"M2 5q2.5 2 5 0t5 0 5 0 5 0\" />"),
  offset: I("<path d=\"M5 21v-6\" />  <path d=\"M12 21V3\" />  <path d=\"M19 21V9\" />"),
  noise: I("<circle cx=\"7.5\" cy=\"7.5\" r=\".5\" fill=\"currentColor\" />  <circle cx=\"18.5\" cy=\"5.5\" r=\".5\" fill=\"currentColor\" />  <circle cx=\"11.5\" cy=\"11.5\" r=\".5\" fill=\"currentColor\" />  <circle cx=\"7.5\" cy=\"16.5\" r=\".5\" fill=\"currentColor\" />  <circle cx=\"17.5\" cy=\"14.5\" r=\".5\" fill=\"currentColor\" />  <path d=\"M3 3v16a2 2 0 0 0 2 2h16\" />"),
  ruler: I("<path d=\"M21.3 15.3a2.4 2.4 0 0 1 0 3.4l-2.6 2.6a2.4 2.4 0 0 1-3.4 0L2.7 8.7a2.41 2.41 0 0 1 0-3.4l2.6-2.6a2.41 2.41 0 0 1 3.4 0Z\" />  <path d=\"m14.5 12.5 2-2\" />  <path d=\"m11.5 9.5 2-2\" />  <path d=\"m8.5 6.5 2-2\" />  <path d=\"m17.5 15.5 2-2\" />"),
  grid: I("<rect width=\"18\" height=\"18\" x=\"3\" y=\"3\" rx=\"2\" />  <path d=\"M3 9h18\" />  <path d=\"M3 15h18\" />  <path d=\"M9 3v18\" />  <path d=\"M15 3v18\" />"),
  levels: I("<path d=\"M2 20h.01\" />  <path d=\"M7 20v-4\" />  <path d=\"M12 20v-8\" />  <path d=\"M17 20V8\" />  <path d=\"M22 4v16\" />"),
  size: I("<rect width=\"18\" height=\"18\" x=\"3\" y=\"3\" rx=\"2\" />"),
  format: I("<rect width=\"12\" height=\"20\" x=\"6\" y=\"2\" rx=\"2\" />  <rect width=\"20\" height=\"12\" x=\"2\" y=\"6\" rx=\"2\" />"),
  split: I("<path d=\"M12 2v20\" />  <path d=\"M16 3h3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-3\" />  <path d=\"M8 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3\" />"),
  side: I("<rect width=\"18\" height=\"18\" x=\"3\" y=\"3\" rx=\"2\" />  <path d=\"M9 3v18\" />"),
  zoom: I("<circle cx=\"11\" cy=\"11\" r=\"8\" />  <line x1=\"21\" x2=\"16.65\" y1=\"21\" y2=\"16.65\" />  <line x1=\"11\" x2=\"11\" y1=\"8\" y2=\"14\" />  <line x1=\"8\" x2=\"14\" y1=\"11\" y2=\"11\" />"),
  full: I("<rect width=\"18\" height=\"18\" x=\"3\" y=\"3\" rx=\"2\" />"),
  aleft: I("<path d=\"m12 19-7-7 7-7\" />  <path d=\"M19 12H5\" />"),
  aright: I("<path d=\"M5 12h14\" />  <path d=\"m12 5 7 7-7 7\" />"),
  aup: I("<path d=\"m5 12 7-7 7 7\" />  <path d=\"M12 19V5\" />"),
  adown: I("<path d=\"M12 5v14\" />  <path d=\"m19 12-7 7-7-7\" />"),
  original: I("<path d=\"M9 14 4 9l5-5\" />  <path d=\"M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5a5.5 5.5 0 0 1-5.5 5.5H11\" />"),
  fullscreen: I("<path d=\"m15 15 6 6\" />  <path d=\"m15 9 6-6\" />  <path d=\"M21 16v5h-5\" />  <path d=\"M21 8V3h-5\" />  <path d=\"M3 16v5h5\" />  <path d=\"m3 21 6-6\" />  <path d=\"M3 8V3h5\" />  <path d=\"M9 9 3 3\" />"),
  reset: I("<path d=\"M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8\" />  <path d=\"M3 3v5h5\" />"),
  compare: I("<rect width=\"18\" height=\"18\" x=\"3\" y=\"3\" rx=\"2\" />  <path d=\"M12 3v18\" />"),
  shapes: I("<path d=\"M8.3 10a.7.7 0 0 1-.626-1.079L11.4 3a.7.7 0 0 1 1.198-.043L16.3 8.9a.7.7 0 0 1-.572 1.1Z\" />  <rect x=\"3\" y=\"14\" width=\"7\" height=\"7\" rx=\"1\" />  <circle cx=\"17.5\" cy=\"17.5\" r=\"3.5\" />"),
  cell: I("<path d=\"M12 3v18\" />  <path d=\"M3 12h18\" />  <rect x=\"3\" y=\"3\" width=\"18\" height=\"18\" rx=\"2\" />"),
  dot: I("<circle cx=\"12\" cy=\"12\" r=\"10\" />"),
  halftone: I("<path d=\"M10.1 2.182a10 10 0 0 1 3.8 0\" />  <path d=\"M13.9 21.818a10 10 0 0 1-3.8 0\" />  <path d=\"M17.609 3.721a10 10 0 0 1 2.69 2.7\" />  <path d=\"M2.182 13.9a10 10 0 0 1 0-3.8\" />  <path d=\"M20.279 17.609a10 10 0 0 1-2.7 2.69\" />  <path d=\"M21.818 10.1a10 10 0 0 1 0 3.8\" />  <path d=\"M3.721 6.391a10 10 0 0 1 2.7-2.69\" />  <path d=\"M6.391 20.279a10 10 0 0 1-2.69-2.7\" />"),
  bands: I("<rect width=\"18\" height=\"18\" x=\"3\" y=\"3\" rx=\"2\" />  <path d=\"M21 7.5H3\" />  <path d=\"M21 12H3\" />  <path d=\"M21 16.5H3\" />"),
  ground: I("<path d=\"M11 7 6 2\" />  <path d=\"M18.992 12H2.041\" />  <path d=\"M21.145 18.38A3.34 3.34 0 0 1 20 16.5a3.3 3.3 0 0 1-1.145 1.88c-.575.46-.855 1.02-.855 1.595A2 2 0 0 0 20 22a2 2 0 0 0 2-2.025c0-.58-.285-1.13-.855-1.595\" />  <path d=\"m8.5 4.5 2.148-2.148a1.205 1.205 0 0 1 1.704 0l7.296 7.296a1.205 1.205 0 0 1 0 1.704l-7.592 7.592a3.615 3.615 0 0 1-5.112 0l-3.888-3.888a3.615 3.615 0 0 1 0-5.112L5.67 7.33\" />"),
  layout: I("<rect width=\"7\" height=\"7\" x=\"3\" y=\"3\" rx=\"1\" />  <rect width=\"7\" height=\"7\" x=\"14\" y=\"3\" rx=\"1\" />  <rect width=\"7\" height=\"7\" x=\"14\" y=\"14\" rx=\"1\" />  <rect width=\"7\" height=\"7\" x=\"3\" y=\"14\" rx=\"1\" />"),
  dice: I("<rect width=\"12\" height=\"12\" x=\"2\" y=\"10\" rx=\"2\" ry=\"2\" />  <path d=\"m17.92 14 3.5-3.5a2.24 2.24 0 0 0 0-3l-5-4.92a2.24 2.24 0 0 0-3 0L10 6\" />  <path d=\"M6 18h.01\" />  <path d=\"M10 14h.01\" />  <path d=\"M15 6h.01\" />  <path d=\"M18 9h.01\" />"),
  wind: I("<path d=\"M12.8 19.6A2 2 0 1 0 14 16H2\" />  <path d=\"M17.5 8a2.5 2.5 0 1 1 2 4H2\" />  <path d=\"M9.8 4.4A2 2 0 1 1 11 8H2\" />"),
  tone: I("<path d=\"M7 16.3c2.2 0 4-1.83 4-4.05 0-1.16-.57-2.26-1.71-3.19S7.29 6.75 7 5.3c-.29 1.45-1.14 2.84-2.29 3.76S3 11.1 3 12.25c0 2.22 1.8 4.05 4 4.05z\" />  <path d=\"M12.56 6.6A10.97 10.97 0 0 0 14 3.02c.5 2.5 2 4.9 4 6.5s3 3.5 3 5.5a6.98 6.98 0 0 1-11.91 4.97\" />"),
  hue: I("<path d=\"M22 17a10 10 0 0 0-20 0\" />  <path d=\"M6 17a6 6 0 0 1 12 0\" />  <path d=\"M10 17a2 2 0 0 1 4 0\" />"),
  zmode: I("<rect width=\"7\" height=\"9\" x=\"3\" y=\"3\" rx=\"1\" />  <rect width=\"7\" height=\"5\" x=\"14\" y=\"3\" rx=\"1\" />  <rect width=\"7\" height=\"9\" x=\"14\" y=\"12\" rx=\"1\" />  <rect width=\"7\" height=\"5\" x=\"3\" y=\"16\" rx=\"1\" />"),
  zones: I("<path d=\"M4 10c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h4c1.1 0 2 .9 2 2\" />  <path d=\"M10 16c-1.1 0-2-.9-2-2v-4c0-1.1.9-2 2-2h4c1.1 0 2 .9 2 2\" />  <rect width=\"8\" height=\"8\" x=\"14\" y=\"14\" rx=\"2\" />"),
  zrange: I("<path d=\"m9 7-5 5 5 5\" />  <path d=\"m15 7 5 5-5 5\" />"),
  zorder: I("<path d=\"m3 16 4 4 4-4\" />  <path d=\"M7 20V4\" />  <path d=\"m21 8-4-4-4 4\" />  <path d=\"M17 4v16\" />"),
  patch: I("<rect width=\"18\" height=\"7\" x=\"3\" y=\"3\" rx=\"1\" />  <rect width=\"7\" height=\"7\" x=\"3\" y=\"14\" rx=\"1\" />  <rect width=\"7\" height=\"7\" x=\"14\" y=\"14\" rx=\"1\" />"),
  cover: I("<path d=\"M5 3a2 2 0 0 0-2 2\" />  <path d=\"M19 3a2 2 0 0 1 2 2\" />  <path d=\"M21 19a2 2 0 0 1-2 2\" />  <path d=\"M5 21a2 2 0 0 1-2-2\" />  <path d=\"M9 3h1\" />  <path d=\"M9 21h1\" />  <path d=\"M14 3h1\" />  <path d=\"M14 21h1\" />  <path d=\"M3 9v1\" />  <path d=\"M21 9v1\" />  <path d=\"M3 14v1\" />  <path d=\"M21 14v1\" />"),
  move: I("<path d=\"M12 2v20\" />  <path d=\"m15 19-3 3-3-3\" />  <path d=\"m19 9 3 3-3 3\" />  <path d=\"M2 12h20\" />  <path d=\"m5 9-3 3 3 3\" />  <path d=\"m9 5 3-3 3 3\" />"),
  mscale: I("<path d=\"M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7\" />  <path d=\"M14 15H9v-5\" />  <path d=\"M16 3h5v5\" />  <path d=\"M21 3 9 15\" />"),
  maskreset: I("<path d=\"M20 9V7a2 2 0 0 0-2-2h-6\" />  <path d=\"m15 2-3 3 3 3\" />  <path d=\"M20 13v5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h2\" />"),
  roller: I("<rect width=\"16\" height=\"6\" x=\"2\" y=\"2\" rx=\"2\" />  <path d=\"M10 16v-2a2 2 0 0 1 2-2h8a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2\" />  <rect width=\"4\" height=\"6\" x=\"8\" y=\"16\" rx=\"1\" />"),
  library: I("<path d=\"m16 6 4 14\" />  <path d=\"M12 6v14\" />  <path d=\"M8 8v12\" />  <path d=\"M4 4v16\" />"),
};
$('vlib').innerHTML = IC.library;

// ---------- control model ----------
const S_ = (key, label, icon, min, max, step, onSet) => ({ t: 's', key, label, icon, min, max, step, onSet });
const T_ = (key, label, icon) => ({ t: 't', key, label, icon });
const C_ = (key, label, icon, opts) => ({ t: 'c', key, label, icon, opts });
const A_ = (label, icon, fn) => ({ t: 'a', label, icon, fn });
// A third entry is an icon shown in place of the name (the name stays as its accessible label)
const FORMATS = [['image', 'Original', IC.original], ['screen', 'Full screen', IC.fullscreen], ['1', '1:1'], ['0.8', '4:5'], ['0.75', '3:4'], ['0.6667', '2:3'], ['0.5625', '9:16'], ['1.7778', '16:9'], ['1.3333', '4:3'], ['1.5', '3:2'], ['0.7071', 'A4'], ['1.4142', 'A4 wide']];
// Switch to hide Martens from the Mode picker without removing it
const MARTENS_ON = true;
const MODE_ITEM = Object.assign(C_('mode', 'Mode', IC.layout, [['none', 'None'], ['shapes', 'Shapes'], ['weave', 'Pixel'], ['glyph', 'Glyph'], ['dither', 'Dither'], ...(MARTENS_ON ? [['martens', 'Martens']] : [])]), { onPick: () => {
  builtTab = null; selIdx.pattern = 0; selIdx.colour = 0; settleArt();
  primeMode();
} });
let shapesPrimed = false, weavePrimed = false, ditherPrimed = false, glyphModePrimed = false, martensPrimed = false;
// First-visit setup for a mode — run on picking it, and for the default mode at start and after a reset
function primeMode() {
  // Starting contrast/saturation for a pattern only apply if the photo hasn't been adjusted yet
  const untouched = v.con === 1 && v.sat === 1;
  if (v.mode === 'shapes' && !shapesPrimed) { shapesPrimed = true; v.cmode = 'image'; if (v.kcount < 8) v.kcount = 8; if (untouched) { v.sat = 1.1; v.con = 1.05; } if (img && paletteAuto) extractPalette(); }
  if (v.mode === 'weave' && !weavePrimed) { weavePrimed = true; if (untouched) { v.con = 1.15; v.sat = 1.25; } }
  if (v.mode === 'glyph' && !glyphModePrimed) {
    glyphModePrimed = true;
    if (v.ssize === D0.ssize && v.halftone === D0.halftone && v.jitter === D0.jitter) { v.ssize = 0.55; v.halftone = 0.55; v.jitter = 0.45; }
    if (paletteAuto) { palette = ['#ffffff', '#111111']; paletteSrc = palette.slice(); paletteAuto = false; }
  }
  if (v.mode === 'martens' && !martensPrimed) { martensPrimed = true; if (paletteAuto) { palette = ['#111111', '#f2f2f2']; paletteSrc = palette.slice(); paletteAuto = false; } }
  if (v.mode === 'dither' && !ditherPrimed) { ditherPrimed = true; if (paletteAuto) { palette = ['#000000', '#ffffff']; paletteSrc = palette.slice(); paletteAuto = false; } }
}
primeMode();
// Controls can declare when they apply; hidden ones keep their values
const when = (it, fn) => Object.assign(it, { when: fn });
const densityOn = () => v.zmode !== 'off';
const isShown = it => !it.when || it.when();
const DENSITY_ITEMS = [
    C_('zmode', 'Density', IC.zmode, [['off', 'Off'], ['stack', 'Stack'], ['grid', 'Grid']]),
    when(S_('zones', 'Zones', IC.zones, 2, 12, 1), densityOn), when(S_('zrange', 'Density range', IC.zrange, 1.5, 6, 0.1), densityOn),
    when(C_('zorder', 'Order', IC.zorder, [['coarse', 'Coarse first'], ['fine', 'Fine first'], ['random', 'Random']]), densityOn)];
const SCALE_ITEM = S_('scale', 'Scale', IC.cell, 3, 120, 1);
const WEAVE_ITEMS = [MODE_ITEM,
    S_('pcw', 'Column width', IC.cols, 0.25, 8, 0.05), S_('prh', 'Row height', IC.rows, 0.25, 8, 0.05), S_('merge', 'Merge', IC.merge, 0, 0.9, 0.01), S_('uneven', 'Uneven rows', IC.uneven, 0, 1, 0.01),
    S_('depth', 'Stripe depth', IC.depth, 0, 1, 0.01), T_('offset', 'Offset stripes', IC.offset),
    S_('accents', 'Tick rules', IC.ruler, 0, 12, 1)];
const SSET_ITEM = Object.assign(C_('sset', 'Shapes', IC.shapes, [['mixed', 'Mixed'], ['dot', 'Dots'], ['square', 'Squares'], ['diamond', 'Diamonds'], ['hline', 'Lines'], ['vbar', 'Bars'], ['cross', 'Crosses'], ['triangle', 'Triangles'], ['arrow', 'Arrows'], ['ring', 'Rings'], ['x', 'Diagonal cross']]));
const SHAPE_ITEMS = [MODE_ITEM, SSET_ITEM,
    S_('ssize', 'Shape size', IC.dot, 0.1, 1.3, 0.01),
    when(S_('sbarw', 'Bar width', IC.width, 0.5, 3, 0.01), () => ['hline', 'vbar', 'mixed'].includes(v.sset)), S_('halftone', 'Halftone', IC.halftone, 0, 1, 0.01),
    C_('sby', 'Shape by', IC.bands, [['tone', 'Tone'], ['rows', 'Rows']]), when(S_('bandRows', 'Band height', IC.rows, 1, 24, 1), () => v.sby === 'rows'),
    S_('jitter', 'Shape mix', IC.wind, 0, 1, 0.01),
    Object.assign(A_('Random settings', IC.dice, randomShapes), { flash: false })];
const GLYPH_ITEMS = [MODE_ITEM,
    // Size, Tone to size and Mix are Shapes' own settings (ssize / halftone / jitter), shared both ways
    S_('ssize', 'Glyph size', IC.size, 0.1, 1.3, 0.01),
    S_('halftone', 'Tone to size', IC.halftone, 0, 1, 0.01), S_('jitter', 'Mix', IC.dice, 0, 1, 0.01),
    C_('gset', 'Glyphs', IC.shapes, [['classic', 'Classic'], ['geometric', 'Geometric'], ['stars', 'Stars'], ['arrows', 'Arrows'], ['curves', 'Curves'], ['money', 'Money'], ['everything', 'Everything']])];
const DITHER_ITEMS = [MODE_ITEM,
    Object.assign(C_('ddither', 'Dither type', IC.grid, [['ordered', 'Ordered'], ['diffuse', 'Diffusion']]), { noTitle: true }),
    S_('ddlevels', 'Levels', IC.levels, 2, 16, 1), S_('ddvary', 'Random sizes', IC.dice, 0, 1, 0.01), T_('ddpal', 'Use palette', IC.palette)];
const MARTENS_ITEMS = [MODE_ITEM,
    C_('mdir', 'Direction', IC.offset, [['h', 'Horizontal'], ['v', 'Vertical'], ['d', 'Diagonal']]),
    when(S_('mangle', 'Angle', IC.ruler, 5, 85, 1), () => v.mdir === 'd'),
    S_('mlevels', 'Thicknesses', IC.levels, 2, 6, 1),
    S_('mthresh', 'Threshold', IC.contrast, 0, 0.95, 0.01), S_('mfull', 'Full at', IC.sun, 0.05, 1, 0.01),
    S_('msize', 'Max thickness', IC.size, 0.4, 2.2, 0.01),
    S_('mseg', 'Segment length', IC.bars, 1, 8, 0.1), S_('mstagger', 'Stagger', IC.offset, 0, 1, 0.01)];

const PALETTES = [
  ['#0E5A3A', '#5E4BA6', '#8FCDBE', '#CDE9F0'], ['#0F8A6E', '#D9A21B', '#F3D9C4', '#FFFFFF'], ['#0B4F37', '#E0262B', '#7BA7BC', '#C8E39A'],
  ['#1B1B3A', '#3D5AFE', '#FF6F61', '#FFE8D6'], ['#2B0F2E', '#962822', '#F0B284', '#AAEECD'], ['#101820', '#F2AA4C', '#E8EDDF'],
  ['#0A2342', '#2CA58D', '#F46197', '#84BC9C'], ['#3C1518', '#69140E', '#A44200', '#D58936', '#F2F3AE'], ['#111111', '#F4F1EA'],
  ['#14213D', '#FCA311', '#E5E5E5'], ['#264653', '#2A9D8F', '#E76F51', '#E9C46A', '#F4A261'], ['#2E1F27', '#854D27', '#DD7230', '#F4C95D', '#E7E393'],
  ['#1D3557', '#E63946', '#A8DADC', '#F1FAEE'], ['#22223B', '#4A4E69', '#C9ADA7', '#F2E9E4'], ['#003049', '#D62828', '#F77F00', '#FCBF49', '#EAE2B7'],
];
let lastPal = -1;
function randomPalette() {
  if (!palette.length) return;
  let k; do { k = Math.floor(Math.random() * PALETTES.length); } while (k === lastPal && PALETTES.length > 1); lastPal = k;
  const L = h => { const c = hex2rgb(h); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
  const P = PALETTES[k].slice().sort((a, b) => L(a) - L(b));
  const order = palette.map((h, i) => i).sort((a, b) => L(paletteSrc[a] || palette[a]) - L(paletteSrc[b] || palette[b]));
  const n = order.length, m = P.length;
  order.forEach((idx, rank) => { palette[idx] = P[n > 1 ? Math.round(rank * (m - 1) / (n - 1)) : 0]; }); paletteAuto = false;
  if (v.mode === 'weave') v.cmode = 'palette';
}
function randomShapes() {
  const pick = a => a[Math.floor(Math.random() * a.length)];
  v.sset = pick(['mixed', 'mixed', 'dot', 'square', 'diamond', 'hline', 'vbar', 'cross', 'triangle', 'arrow', 'ring', 'x']);
  v.scale = 6 + Math.floor(Math.random() * 18);
  v.ssize = +(0.5 + Math.random() * 0.6).toFixed(2);
  v.halftone = +(Math.random() * 0.8).toFixed(2);
  v.sby = Math.random() < 0.5 ? 'tone' : 'rows';
  v.bandRows = 2 + Math.floor(Math.random() * 8);
  v.ground = pick(['darkest', 'darkest', 'lightest']);
  v.stone = pick(['full', 'full', 'duo', 'mono']);
  v.jitter = +(Math.random() < 0.4 ? 0 : Math.random() * 0.8).toFixed(2);
  seed = Math.floor(Math.random() * 1e6);
  flash('Random settings');
}
const COLOUR_COMMON = [
    T_('invert', 'Invert', IC.contrast),
    T_('photoColour', 'Colour the photo', IC.roller),
    S_('kcount', 'Palette colours', IC.swatch, 2, 12, 1, () => { if (img) { extractPalette(); drawSwatches(); } }),
    A_('Extract palette', IC.wand, () => { extractPalette(); if (v.mode === 'weave') v.cmode = 'palette'; drawSwatches(); }),
    Object.assign(A_('Random palette', IC.dice, () => { randomPalette(); flash('Random palette'); }), { flash: false }),
    Object.assign(A_('Pick from image', IC.picker, () => { picking = true; toast('Tap the image to pick a colour'); }), { flash: false })];
const COLOUR_WEAVE = [
    C_('cmode', 'Colour from', IC.palette, [['image', 'Image'], ['palette', 'Image palette']]),
    S_('detail', 'Image through', IC.eye, 0, 1, 0.01), when(T_('perstripe', 'Sample per stripe', IC.bars), () => v.detail > 0), ...COLOUR_COMMON];
const COLOUR_SHAPES = [
    C_('cmode', 'Colour from', IC.palette, [['image', 'Image'], ['palette', 'Image palette']]),
    C_('stone', 'Scheme', IC.tone, [['full', 'Full'], ['duo', 'Duotone'], ['mono', 'Mono']]),
    C_('ground', 'Background', IC.ground, [['darkest', 'Darkest'], ['lightest', 'Lightest'], ['custom', 'Custom'], ['image', 'Image']]),
    when({ t: 'k', key: 'groundColor', label: 'Background colour', icon: IC.ground, onSet: () => { v.ground = 'custom'; } }, () => v.ground !== 'image'),
    ...COLOUR_COMMON];
const COLOUR_GLYPH = COLOUR_COMMON;
const COLOUR_MARTENS = COLOUR_COMMON;
const COLOUR_DITHER = COLOUR_COMMON;
const SPLIT_CHOICE = Object.assign(C_('split', 'Treated area', IC.split, [[1, 'Full', IC.full], [2 / 3, '⅔'], [0.5, '½'], [1 / 3, '⅓'], [0.25, '¼'], ['patch', 'Patches', IC.patch]]), { onPick: () => { builtTab = null; } });
const SIDE_ITEM = C_('side', 'Treat from', IC.side, [['left', 'Left', IC.aleft], ['right', 'Right', IC.aright], ['top', 'Top', IC.aup], ['bottom', 'Bottom', IC.adown]]);
const PATCH_ITEMS = [S_('pcover', 'Coverage', IC.cover, 0.05, 0.95, 0.01), S_('psize', 'Patch size', IC.patch, 1, 10, 1), S_('pdepth', 'Mix of sizes', IC.zones, 0, 4, 1),
  S_('mscale', 'Mask scale', IC.mscale, 0.25, 4, 0.01),
  T_('maskMove', 'Move mask', IC.move),
  Object.assign(A_('Reset mask', IC.maskreset, () => { v.mscale = 1; v.mx = v.my = 0; }), { left: true }),
  A_('Shuffle patches', IC.shuffle, () => { pseed = Math.floor(Math.random() * 1e6); })];
let pseed = 3;
function SPLIT_ITEMS() { return v.split === 'patch' ? [SPLIT_CHOICE, ...PATCH_ITEMS] : v.split === 1 ? [SPLIT_CHOICE] : [SPLIT_CHOICE, SIDE_ITEM]; }
const COMPARE_ITEM = { t: 'h', label: 'Hold to compare', icon: IC.compare, left: true };
// Crop is framing only (opened from the top bar); Mask is where the pattern meets the photo
const CROP_ITEMS = [
    C_('format', 'Format', IC.format, FORMATS),
    S_('zoom', 'Zoom', IC.zoom, 1, 6, 0.01),
    Object.assign(A_('Reset position', IC.reset, () => { v.panX = v.panY = 0; v.zoom = 1; }), { left: true }),
    COMPARE_ITEM];
function MASK_ITEMS() { return [...SPLIT_ITEMS(), COMPARE_ITEM]; }
const TABS = [
  { id: 'pattern', label: 'Pattern', icon: IC.pattern, get items() { return v.mode === 'none' ? [MODE_ITEM] : v.mode === 'shapes' ? SHAPE_ITEMS : v.mode === 'glyph' ? GLYPH_ITEMS : v.mode === 'dither' ? DITHER_ITEMS : v.mode === 'martens' ? MARTENS_ITEMS : WEAVE_ITEMS; } },
  // Adjust: the photo itself. Texture: what's laid over the result (grain, glow, blend, dither finish)
  { id: 'adjust', label: 'Adjust', icon: IC.adjust, items: [
    S_('bri', 'Brightness', IC.sun, 0.4, 1.8, 0.01), S_('con', 'Contrast', IC.contrast, 0.4, 2, 0.01),
    S_('sat', 'Saturation', IC.drop, 0, 2, 0.01), S_('hue', 'Hue', IC.hue, -180, 180, 1)] },
  { id: 'colour', label: 'Colour', icon: IC.colour, get items() { return v.mode === 'none' ? COLOUR_COMMON : v.mode === 'shapes' ? COLOUR_SHAPES : v.mode === 'glyph' ? COLOUR_GLYPH : v.mode === 'dither' ? COLOUR_DITHER : v.mode === 'martens' ? COLOUR_MARTENS : COLOUR_WEAVE; } },
  { id: 'texture', label: 'Texture', icon: IC.noise, items: [
    S_('grain', 'Grain', IC.noise, 0, 80, 1),
    S_('glow', 'Glow', IC.glow, 0, 2, 0.01), when(S_('gsize', 'Glow size', IC.radius, 2, 60, 1), () => v.glow > 0),
    C_('blend', 'Blend', IC.blend, [['none', 'Off'], ['source-over', 'Normal'], ['multiply', 'Multiply'], ['screen', 'Screen'], ['overlay', 'Overlay'], ['soft-light', 'Soft light'], ['hard-light', 'Hard light'], ['color', 'Colour'], ['luminosity', 'Luminosity'], ['difference', 'Difference']]),
    when(S_('mix', 'Blend amount', IC.mix, 0, 1, 0.01), () => v.blend !== 'none'),
    // Dither finish — hidden in Dither mode, which has its own; its settings show once a type is picked
    when(C_('dither', 'Dither', IC.dither, [['off', 'Off'], ['ordered', 'Ordered'], ['diffuse', 'Diffusion']]), () => v.mode !== 'dither'),
    ...[S_('dlevels', 'Levels', IC.levels, 2, 16, 1), S_('dsize', 'Dot size', IC.size, 1, 12, 1), S_('dvary', 'Random sizes', IC.dice, 0, 1, 0.01), T_('dpal', 'Use palette', IC.palette)]
      .map(it => when(it, () => v.mode !== 'dither' && v.dither !== 'off'))] },
  // Scale: one size for every pattern, plus Density zones that vary it across the image (hidden for None)
  { id: 'scale', label: 'Scale', icon: IC.cell, items: [SCALE_ITEM, ...DENSITY_ITEMS] },
  { id: 'mask', label: 'Mask', icon: IC.split, get items() { return MASK_ITEMS(); } },
  // Crop isn't in the bar — the top-right crop button opens it
  { id: 'crop', label: 'Crop', icon: IC.crop, hidden: true, items: CROP_ITEMS },
];
let tabId = null; const selIdx = { adjust: 0, colour: 0, pattern: 0, scale: 0, texture: 0, mask: 0, crop: 0 };
const curTab = () => TABS.find(t => t.id === tabId);
const tick = () => curTab().items.filter(it => (it.t === 's' || it.t === 'c') && isShown(it));
const corner = () => curTab().items.filter(it => (it.t === 'a' || it.t === 't' || it.t === 'h' || it.t === 'k') && isShown(it));
const curItem = () => { const list = tick(); if (selIdx[tabId] >= list.length) selIdx[tabId] = Math.max(0, list.length - 1); return list[selIdx[tabId]]; };
const norm = it => (v[it.key] - it.min) / (it.max - it.min);

function ringSVG(n) {
  const r = 26, c = 2 * Math.PI * r;
  return `<svg class="ring" viewBox="0 0 56 56"><circle cx="28" cy="28" r="${r}" fill="none" stroke="#FFD60A" stroke-width="2" stroke-dasharray="${(c * n).toFixed(1)} ${c.toFixed(1)}" transform="rotate(-90 28 28)" stroke-linecap="round"/></svg>`;
}
function drawTabs() {
  const nav = $('tabs'); nav.innerHTML = '';
  if (v.mode === 'none' && tabId === 'scale') tabId = null;
  TABS.filter(t => !t.hidden && !(v.mode === 'none' && t.id === 'scale')).forEach(t => {
    const b = document.createElement('button'); b.className = 'tab'; b.dataset.label = t.label; b.setAttribute('role', 'tab'); b.setAttribute('aria-selected', t.id === tabId);
    b.innerHTML = t.icon + `<span>${t.label}</span>`; b.onclick = () => {
      // Pattern always lands on the Mode overview: tapping it inside a pattern's settings goes back there,
      // and only closes once you're already on Mode
      if (t.id === 'pattern' && tabId === 'pattern' && selIdx.pattern !== 0) selIdx.pattern = 0;
      else { tabId = tabId === t.id ? null : t.id; if (tabId === 'pattern') selIdx.pattern = 0; }
      if (tabId) { rawPreview = false; cache = null; } builtTab = null; drawAll(); schedule();
      if (tabId) [...$('items').children].forEach((el, i) => anim(el, [{ opacity: 0, transform: 'scale(.85)' }, { opacity: 1, transform: 'none' }], { duration: 260, delay: i * 22, fill: 'backwards' }));
    }; nav.append(b);
  });
}
let builtTab = null, scrollLock = false, lockT;
function itemInner(it, sel) {
  let inner = it.icon;
  if (it.t === 's') { if (sel) inner = `<span class="num">${it.step < 1 ? Math.round(norm(it) * 100) : v[it.key]}</span>`; else if (v[it.key] !== D0[it.key]) inner += ringSVG(norm(it)); }
  return inner;
}
function paintItems() {
  const items = tick();
  [...$('items').children].forEach((b, i) => {
    const it = items[i], sel = i === selIdx[tabId];
    b.classList.toggle('sel', sel);
    b.classList.toggle('on', !sel && ((it.t === 't' && v[it.key]) || (it.t === 'c' && String(v[it.key]) !== String(D0[it.key]))));
    const html = itemInner(it, sel); if (b._html !== html) { b.innerHTML = html; b._html = html; }
  });
}
function centerOn(i, smooth) {
  const box = $('items'), b = box.children[i]; if (!b) return;
  scrollLock = true; clearTimeout(lockT);
  box.scrollTo({ left: b.offsetLeft + b.offsetWidth / 2 - box.clientWidth / 2, behavior: smooth ? 'smooth' : 'auto' });
  lockT = setTimeout(() => { scrollLock = false; }, smooth ? 450 : 60);
}
function select(i, smooth = true) { selIdx[tabId] = i; paintItems(); drawControl(); centerOn(i, smooth); }
// When a setting shows or hides other controls, rebuild the row and keep the current control selected
const layoutSig = () => tabId ? tick().map(i => i.label).join('|') + '#' + corner().map(i => i.label).join('|') : '';
let lastSig = '';
function refreshVisibility(keep) {
  const sig = layoutSig(); if (sig === lastSig) return false;
  const cur = keep || curItem(); builtTab = null;
  const idx = tick().indexOf(cur); if (idx >= 0) selIdx[tabId] = idx;
  drawAll(); return true;
}
function drawItems() {
  const box = $('items');
  if (builtTab !== tabId) {
    box.innerHTML = '';
    tick().forEach((it, i) => {
      const b = document.createElement('button'); b.className = 'item glass'; b.setAttribute('aria-label', it.label);
      if (it.t === 'h') {
        b.addEventListener('pointerdown', () => { comparing = true; schedule(); });
        ['pointerup', 'pointerleave', 'pointercancel'].forEach(ev => b.addEventListener(ev, () => { if (comparing) { comparing = false; schedule(); } }));
        b.onclick = () => select(i);
      } else b.onclick = () => {
        if (it.t === 'a') { it.fn(); select(i); drawSwatches(); schedule(); return; }
        if (it.t === 't') { v[it.key] = !v[it.key]; select(i); schedule(); return; }
        select(i);
      };
      b.ondblclick = () => { if (it.t === 's') { v[it.key] = D0[it.key]; it.onSet && it.onSet(); paintItems(); drawControl(); schedule(); } };
      box.append(b);
    });
    builtTab = tabId; lastSig = layoutSig();
    requestAnimationFrame(() => centerOn(selIdx[tabId], false));
  }
  paintItems();
}
(() => {
  const box = $('items'); let raf = 0;
  box.addEventListener('scroll', () => {
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0; if (scrollLock || !tabId) return;
      const mid = box.scrollLeft + box.clientWidth / 2; let best = 0, bd = 1e9;
      [...box.children].forEach((b, i) => { const d = Math.abs(b.offsetLeft + b.offsetWidth / 2 - mid); if (d < bd) { bd = d; best = i; } });
      if (best !== selIdx[tabId]) { selIdx[tabId] = best; paintItems(); drawControl(); }
    });
  }, { passive: true });
})();
function drawControl() {
  const it = curItem(), title = $('title'), scrub = $('scrub'), chips = $('chips');
  scrub.classList.add('hidden'); chips.classList.add('hidden');
  title.textContent = it.noTitle ? '' : it.label;
  if (it.t === 's') { scrub.classList.remove('hidden'); placeStrip(); }
  else if (it.t === 'c') {
    chips.classList.remove('hidden'); chips.innerHTML = '';
    it.opts.forEach(([val, name, icon]) => {
      const b = document.createElement('button'); b.className = 'chip'; b.setAttribute('aria-pressed', String(v[it.key]) === String(val));
      if (icon) { b.innerHTML = icon; b.classList.add('chip-icon'); b.setAttribute('aria-label', name); b.title = name; } else b.textContent = name;
      b.onclick = () => { v[it.key] = val; if (it.onPick) { it.onPick(); drawAll(); } else if (!refreshVisibility(it)) { paintItems(); drawControl(); } schedule(); }; chips.append(b);
    });
  }
}
let removing = false;
function drawSwatches() {
  const box = $('swatches'); box.classList.toggle('hidden', tabId !== 'colour' || !palette.length); box.innerHTML = '';
  const usePalette = () => { if (v.cmode !== 'palette') { v.cmode = 'palette'; paintItems(); drawControl(); } };
  palette.forEach((h, i) => {
    const w = document.createElement('label'); w.className = 'sw'; w.style.background = h;
    if (removing) {
      w.classList.add('rm'); w.setAttribute('role', 'button'); w.setAttribute('aria-label', 'Remove colour ' + h);
      w.onclick = () => { if (palette.length > 1) { palette.splice(i, 1); paletteSrc.splice(i, 1); paletteAuto = false; drawSwatches(); schedule(); } };
    } else {
      w.setAttribute('aria-label', 'Change colour ' + h);
      const inp = document.createElement('input'); inp.type = 'color'; inp.value = h;
      inp.addEventListener('input', () => { palette[i] = inp.value; paletteAuto = false; w.style.background = inp.value; usePalette(); schedule(); });
      w.append(inp);
    }
    box.append(w);
  });
  const add = document.createElement('label'); add.className = 'sw tool'; add.setAttribute('aria-label', 'Add colour'); add.innerHTML = '<span>+</span>';
  const ai = document.createElement('input'); ai.type = 'color'; ai.value = '#ffffff';
  let added = -1;
  ai.addEventListener('input', () => { paletteAuto = false; if (added < 0) { palette.push(ai.value); paletteSrc.push(ai.value); added = palette.length - 1; } else { palette[added] = ai.value; paletteSrc[added] = ai.value; } usePalette(); schedule(); });
  ai.addEventListener('change', () => { added = -1; drawSwatches(); });
  add.append(ai); box.append(add);
  const rm = document.createElement('button'); rm.className = 'sw tool' + (removing ? ' active' : ''); rm.setAttribute('aria-label', removing ? 'Done removing' : 'Remove colours'); rm.innerHTML = '<span>' + (removing ? '✓' : '−') + '</span>';
  rm.onclick = () => { removing = !removing; drawSwatches(); };
  box.append(rm);
}

function drawCorners() {
  const L = $('topL'); L.innerHTML = '';
  const list = tabId ? corner().slice().sort((a, b) => (b.left ? 1 : 0) - (a.left ? 1 : 0)) : [];
  list.forEach(it => {
    if (it.t === 'k') {
      const w = document.createElement('label'); w.className = 'cbtn'; w.setAttribute('aria-label', it.label); w.title = it.label;
      w.innerHTML = `<span class="chip-dot" style="background:${v[it.key]}"></span>`;
      const inp = document.createElement('input'); inp.type = 'color'; inp.value = v[it.key];
      inp.addEventListener('input', () => { v[it.key] = inp.value; it.onSet && it.onSet(); w.firstChild.style.background = inp.value; if (!refreshVisibility()) { paintItems(); drawControl(); } schedule(); });
      w.append(inp); L.append(w); return;
    }
    const b = document.createElement('button'); b.setAttribute('aria-label', it.label); b.title = it.label; b.innerHTML = it.icon;
    if (it.t === 't') { b.setAttribute('aria-pressed', !!v[it.key]); b.classList.toggle('on', !!v[it.key]); }
    if (it.t === 'h') {
      b.addEventListener('pointerdown', () => { comparing = true; schedule(); flash('Original'); });
      ['pointerup', 'pointerleave', 'pointercancel'].forEach(ev => b.addEventListener(ev, () => { if (comparing) { comparing = false; schedule(); } }));
    } else b.onclick = () => {
      if (it.t === 't') { v[it.key] = !v[it.key]; flash(it.label + (v[it.key] ? ' on' : ' off')); refreshVisibility(); }
      else { it.fn(); if (it.flash !== false) flash(it.label); }
      drawCorners(); paintItems(); drawControl(); drawSwatches(); schedule();
    };
    L.append(b);
  });
  L.classList.toggle('hidden', !L.children.length);
}
function drawAll() {
  drawCorners();
  drawTabs();
  const open = !!tabId;
  $('dock').classList.toggle('closed', !open);
  if (!open) return;
  drawItems(); drawControl(); drawSwatches();
}

// scrubber
const TICKS = 61, GAP = 8, SW = (TICKS - 1) * GAP;
const PAD = 70;
(() => { const s = $('strip'); for (let i = -PAD; i < TICKS + PAD; i++) { const t = document.createElement('div'); const inRange = i >= 0 && i < TICKS; t.className = 'tick' + (inRange && i % 10 === 0 ? ' big' : ''); if (!inRange) t.style.opacity = '.3'; s.append(t); } })();
function placeStrip() { const it = curItem(); if (!it || it.t !== 's') return; const w = $('scrub').clientWidth; $('strip').style.transform = `translateX(${w / 2 - PAD * GAP - norm(it) * SW}px)`; }
(() => {
  const sc = $('scrub'); let start = null;
  sc.addEventListener('pointerdown', e => { const it = curItem(); if (it.t !== 's') return; sc.setPointerCapture(e.pointerId); start = { x: e.clientX, n: norm(it) }; interactive = true; });
  sc.addEventListener('pointermove', e => {
    if (!start) return; const it = curItem();
    let n = Math.max(0, Math.min(1, start.n - (e.clientX - start.x) / SW));
    let val = it.min + n * (it.max - it.min); val = Math.round(val / it.step) * it.step; val = +val.toFixed(4);
    if (val !== v[it.key]) { v[it.key] = val; it.onSet && it.onSet(); placeStrip(); updateSelNum(); refreshVisibility(it); schedule(); }
  });
  const stop = () => { start = null; interactive = false; paintItems(); schedule(); };
  sc.addEventListener('pointerup', stop); sc.addEventListener('pointercancel', stop);
  sc.addEventListener('wheel', e => { e.preventDefault(); const it = curItem(); if (it.t !== 's') return; const n = Math.max(0, Math.min(1, norm(it) + e.deltaX / SW + e.deltaY / SW)); v[it.key] = +(Math.round((it.min + n * (it.max - it.min)) / it.step) * it.step).toFixed(4); it.onSet && it.onSet(); if (!refreshVisibility(it)) drawControl(); updateSelNum(); schedule(); }, { passive: false });
})();
function updateSelNum() { const it = curItem(), b = $('items').children[selIdx[tabId]]; const n = b && b.querySelector('.num'); if (n) n.textContent = it.step < 1 ? Math.round(norm(it) * 100) : v[it.key]; }

// ---------- chrome visibility ----------
let idleT;
const showUI = () => { document.body.classList.remove('hideui'); clearTimeout(idleT); idleT = setTimeout(() => { if (img && !tabId && !document.body.classList.contains('menuopen') && $('callout').hidden) document.body.classList.add('hideui'); }, 12000); }; // never fade the controls away while the menu or copy/paste bubble is open
['pointerdown', 'pointermove', 'keydown', 'wheel'].forEach(ev => addEventListener(ev, e => { if (ev === 'pointermove' && e.pointerType === 'touch') return; showUI(); }, { passive: true }));
const toast = t => { $('toast').textContent = t; $('toast').hidden = !t; };
let flashT; const flash = t => { toast(t); clearTimeout(flashT); flashT = setTimeout(() => { if (!picking) toast(''); }, 1200); };

// ---------- image in ----------
function loadFile(f, opts) {
  opts = opts || {};
  if (!f) return;
  if (f.type.startsWith('video/')) return loadVideo(f, opts);
  if (!f.type.startsWith('image/')) return;
  if (vid) { vid.pause(); vid.remove(); vid = null; }
  ['vplay', 'vrec'].forEach(id => $(id).hidden = true);
  const im = new Image();
  im.onload = () => { const first = !img; img = im; imgId++; v.panX = v.panY = 0; v.zoom = 1; if (paletteAuto || !palette.length) extractPalette(); if (first) showRaw(); else cache = null; $('empty').hidden = true; $('dock').classList.remove('hidden'); $('vbar').classList.remove('hidden'); drawAll(); schedule(); showUI(); };
  im.src = URL.createObjectURL(f);
  if (!opts.skipStore) storeFile(f).then(refreshLibraryIfOpen).catch(() => {});
}
$('file').addEventListener('change', e => { loadFile(e.target.files[0]); e.target.value = ''; });
$('emptyUpload').onclick = () => $('file').click();
addEventListener('dragover', e => e.preventDefault());
addEventListener('drop', e => { e.preventDefault(); loadFile(e.dataTransfer.files[0]); });

// ---------- gestures on artboard ----------
const pts = new Map(); let pinch0 = null, moved = false;
// Hold the artwork for the usual copy/paste bubble (Copy style · Paste style). A hold isn't a tap, so it
// doesn't toggle the controls
let coTimer = 0, coStart = null, coHeld = false;
function showCallout(x, y) {
  const c = $('callout'); $('coPaste').hidden = !copiedStyle; c.hidden = false;
  const w = c.offsetWidth, h = c.offsetHeight;
  c.style.left = Math.min(innerWidth - w - 8, Math.max(8, x - w / 2)) + 'px'; c.style.top = Math.max(8, y - h - 18) + 'px';
}
const hideCallout = () => { $('callout').hidden = true; };
$('coCopy').onclick = () => { hideCallout(); copyStyle(currentStyle(), 'Copied look'); };
$('coPaste').onclick = () => { hideCallout(); pasteStyle(); };
addEventListener('pointerdown', e => { if (!e.target.closest('#callout')) hideCallout(); }, true);
out.addEventListener('pointerdown', e => {
  coHeld = false; clearTimeout(coTimer);
  if (!img || picking || pts.size) return;
  coStart = [e.clientX, e.clientY];
  coTimer = setTimeout(() => { coHeld = true; showCallout(coStart[0], coStart[1]); if (navigator.vibrate) navigator.vibrate(12); }, 500);
});
out.addEventListener('pointermove', e => { if (coTimer && coStart && Math.hypot(e.clientX - coStart[0], e.clientY - coStart[1]) > 8) { clearTimeout(coTimer); coTimer = 0; } });
['pointerup', 'pointercancel'].forEach(ev => out.addEventListener(ev, () => { clearTimeout(coTimer); coTimer = 0; }));
out.addEventListener('contextmenu', e => e.preventDefault());
out.addEventListener('pointerdown', e => {
  if (!img) return; out.setPointerCapture(e.pointerId); pts.set(e.pointerId, [e.clientX, e.clientY]); moved = false; if (!picking && !maskMode()) interactive = true;
  if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch0 = { d: Math.hypot(a[0] - b[0], a[1] - b[1]), z: v.zoom, m: v.mscale }; }
});
out.addEventListener('pointermove', e => {
  if (!pts.has(e.pointerId)) return;
  const prev = pts.get(e.pointerId); pts.set(e.pointerId, [e.clientX, e.clientY]);
  if (pts.size === 2 && pinch0) { const [a, b] = [...pts.values()], k = Math.hypot(a[0] - b[0], a[1] - b[1]) / pinch0.d; if (maskMode()) v.mscale = Math.min(4, Math.max(0.25, pinch0.m * k)); else v.zoom = Math.min(6, Math.max(1, pinch0.z * k)); moved = true; schedule(); return; }
  if (picking) return;
  const r = out.getBoundingClientRect(), L = Math.max(r.width, r.height), dx = e.clientX - prev[0], dy = e.clientY - prev[1];
  if (Math.abs(dx) + Math.abs(dy) > 1) moved = true;
  if (maskMode()) { v.mx += dx / L; v.my += dy / L; } else { v.panX += dx / L; v.panY += dy / L; }
  schedule();
});
out.addEventListener('pointerup', e => {
  if (!moved && pts.size === 1 && !coHeld) {
    if (picking) {
      const r = out.getBoundingClientRect(), x = (e.clientX - r.left) / r.width * src.width, y = (e.clientY - r.top) / r.height * src.height;
      const d = sctx.getImageData(Math.floor(x), Math.floor(y), 1, 1).data;
      palette.push(rgb2hex([d[0], d[1], d[2]])); paletteSrc.push(palette[palette.length - 1]); paletteAuto = false; v.cmode = 'palette'; picking = false; toast(''); drawAll(); schedule();
    } else if (document.body.classList.contains('hideui')) showUI(); else { document.body.classList.add('hideui'); clearTimeout(idleT); }
  }
  pts.delete(e.pointerId); if (pts.size < 2) pinch0 = null; if (!pts.size && interactive) { interactive = false; schedule(); }
});
out.addEventListener('pointercancel', e => { pts.delete(e.pointerId); pinch0 = null; if (!pts.size) { interactive = false; schedule(); } });
out.addEventListener('wheel', e => { if (!img) return; e.preventDefault(); const k = Math.exp(-e.deltaY * 0.0015); if (maskMode()) v.mscale = Math.min(4, Math.max(0.25, v.mscale * k)); else v.zoom = Math.min(6, Math.max(1, v.zoom * k)); schedule(); }, { passive: false });
function maskMode() { return v.maskMove && v.split === 'patch'; }


// ---------- video ----------
function loadVideo(f, opts) {
  opts = opts || {};
  if (vid) { vid.pause(); vid.remove(); vid = null; }
  const el = document.createElement('video');
  el.muted = true; el.defaultMuted = true; el.loop = true; el.playsInline = true; el.autoplay = true;
  el.setAttribute('muted', ''); el.setAttribute('playsinline', ''); el.setAttribute('webkit-playsinline', ''); el.preload = 'auto';
  // iPhone Safari decodes video more reliably when the element is in the page
  el.style.cssText = 'position:fixed; left:0; top:0; width:2px; height:2px; opacity:0; pointer-events:none';
  document.body.appendChild(el);
  let started = false;
  const ready = () => {
    if (started || !el.videoWidth || el.readyState < 2) return;
    const first = !img; started = true; vid = el; img = el; imgId++; v.panX = v.panY = 0; v.zoom = 1;
    if (paletteAuto || !palette.length) extractPalette(); if (first) showRaw(); else cache = null; $('empty').hidden = true; $('dock').classList.remove('hidden'); $('vbar').classList.remove('hidden'); ['vplay', 'vrec'].forEach(id => $(id).hidden = false);
    toast(''); drawAll(); schedule(); showUI(); paintVbar(); frameLoop();
  };
  ['loadedmetadata', 'loadeddata', 'canplay', 'playing', 'timeupdate'].forEach(ev => el.addEventListener(ev, ready));
  el.addEventListener('play', paintVbar); el.addEventListener('pause', paintVbar);
  el.addEventListener('error', () => { toast(''); flash('This video could not be opened here'); el.remove(); });
  toast('Loading video');
  el.src = URL.createObjectURL(f);
  el.load();
  const tryPlay = () => el.play().catch(() => {
    toast('Tap to start the video');
    const go = () => { removeEventListener('pointerdown', go, true); el.play().catch(() => {}); };
    addEventListener('pointerdown', go, true);
  });
  tryPlay();
  if (!opts.skipStore) storeFile(f).then(refreshLibraryIfOpen).catch(() => {});
}
function frameLoop() {
  const el = vid; if (!el) return;
  const next = () => { if (vid !== el) return; if (!el.paused) { imgId++; schedule(); } el.requestVideoFrameCallback ? el.requestVideoFrameCallback(next) : requestAnimationFrame(next); };
  next();
}
const PLAY = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M5 5a2 2 0 0 1 3.008-1.728l11.997 6.998a2 2 0 0 1 .003 3.458l-12 7A2 2 0 0 1 5 19z" /></svg>', PAUSE = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><rect x="14" y="3" width="5" height="18" rx="1" />  <rect x="5" y="3" width="5" height="18" rx="1" /></svg>', REC = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="1" />  <circle cx="12" cy="12" r="10" /></svg>', STOP = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="3" rx="2" /></svg>';
function paintVbar() {
  if (!vid) return;
  $('vplay').innerHTML = vid.paused ? PLAY : PAUSE; $('vplay').setAttribute('aria-label', vid.paused ? 'Play' : 'Pause');
  $('vrec').innerHTML = recording ? STOP : REC; $('vrec').classList.toggle('on', recording); $('vrec').setAttribute('aria-label', recording ? 'Stop recording' : 'Record video');
}
let resetArm = 0;
$('vreset').onclick = () => {
  if (Date.now() - resetArm > 2500) { resetArm = Date.now(); flash('Tap again to reset all settings'); return; }
  resetArm = 0;
  Object.assign(v, D0); seed = 7; shapesPrimed = false; weavePrimed = false; ditherPrimed = false; glyphModePrimed = false; martensPrimed = false; picking = false; primeMode();
  Object.keys(selIdx).forEach(k => selIdx[k] = 0); builtTab = null; cache = null;
  if (img) extractPalette();
  drawAll(); schedule(); flash('Settings reset');
};
$('vupload').onclick = () => $('file').click();
$('vdown').onclick = openExport;
$('vplay').onclick = () => { if (!vid || recording) return; vid.paused ? vid.play() : vid.pause(); };
let rec = null, chunks = [];
$('vrec').onclick = () => { if (!vid) return; recording ? stopRecording() : startRecording(); };
function startRecording() {
  if (!out.captureStream || !window.MediaRecorder) { flash('Recording is not supported in this browser'); return; }
  const types = ['video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm'];
  const type = types.find(t => MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(t)) || '';
  recLong = [720, 1080, 1920].includes(v.exportLong) ? v.exportLong : 1080;
  recording = true; cache = null; paintVbar(); layout();
  const stream = out.captureStream(30);
  chunks = []; rec = new MediaRecorder(stream, type ? { mimeType: type, videoBitsPerSecond: 12e6 } : undefined);
  rec.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data); };
  rec.onstop = finishRecording;
  vid.loop = false; vid.currentTime = 0;
  vid.onended = () => stopRecording();
  vid.play().then(() => rec.start(250)).catch(() => { recording = false; paintVbar(); });
  toast('Recording');
}
function stopRecording() {
  if (!recording) return;
  recording = false; vid.onended = null; vid.loop = true;
  if (rec && rec.state !== 'inactive') rec.stop();
  paintVbar(); cache = null; schedule(); toast('');
}
async function finishRecording() {
  const type = (rec && rec.mimeType) || 'video/webm', ext = type.includes('mp4') ? 'mp4' : 'webm';
  const blob = new Blob(chunks, { type });
  if (!blob.size) { flash('Nothing was recorded'); return; }
  try { await saveToDevice('loom.' + ext, blob, currentStyle()); refreshLibraryIfOpen(); }
  catch (err) { flash('Saving the recording failed'); }
}


// ---------- export sheet ----------
const xs = { kind: 'image', fmt: 'png', busy: false };
const vectorOK = () => v.mode === 'shapes' && v.ground !== 'image' && !v.grain && !v.glow && (v.blend === 'none' || !v.mix) && v.split >= 1;
function nativeLong() {
  const r = ratio(), Wa = r >= 1 ? r : 1, Ha = r >= 1 ? 1 : 1 / r, s0 = Math.max(Wa / srcW(), Ha / srcH()) * v.zoom;
  return Math.max(64, Math.min(8192, Math.round(Math.max(Wa, Ha) / s0)));
}
const dimsFor = L => { if (L === 'native') L = nativeLong(); const r = ratio(); return r >= 1 ? [L, Math.round(L / r)] : [Math.round(L * r), L]; };
function segment(el, opts, cur, onPick) {
  el.innerHTML = '';
  opts.forEach(([val, name, disabled]) => {
    const b = document.createElement('button'); b.textContent = name; b.setAttribute('aria-pressed', String(cur) === String(val)); b.disabled = !!disabled;
    b.onclick = () => { onPick(val); drawExport(); }; el.append(b);
  });
}
function drawExport() {
  const isVid = xs.kind === 'video';
  segment($('xkind'), [['image', 'Image'], ['video', 'Video', !vid]], xs.kind, k => { xs.kind = k; });
  const vec = vectorOK();
  if (!vec && xs.fmt !== 'png') xs.fmt = 'png';
  $('xfmtg').classList.toggle('hidden', isVid);
  segment($('xfmt'), [['png', 'PNG'], ['svg', 'SVG', !vec], ['pdf', 'PDF', !vec]], xs.fmt, f => { xs.fmt = f; });
  const sizes = isVid ? [[720, '720'], [1080, '1080'], [1920, '1920']] : [['native', 'Original'], [1080, '1080'], [2048, '2048'], [4096, '4096']];
  if (!sizes.some(z => z[0] === v.exportLong)) v.exportLong = isVid ? 1080 : 'native';
  segment($('xsize'), sizes, v.exportLong, L => { v.exportLong = L; });
  const [w, h] = dimsFor(v.exportLong);
  let info;
  if (isVid) {
    const mp4 = window.MediaRecorder && MediaRecorder.isTypeSupported && (MediaRecorder.isTypeSupported('video/mp4') || MediaRecorder.isTypeSupported('video/mp4;codecs=avc1'));
    info = `${w} × ${h} · ${mp4 ? 'MP4' : 'WebM'} · plays once through${vid && isFinite(vid.duration) ? `, about ${Math.round(vid.duration)}s` : ''}. No sound.`;
  } else if (xs.fmt === 'png') info = `${w} × ${h} px PNG${v.exportLong === 'native' ? ', the source resolution for this crop' : ''}` + (vec ? '' : v.mode === 'shapes' ? '. SVG and PDF need a solid background, with grain, glow and blend off and the whole image treated.' : '. SVG and PDF are available for flat Shapes.');
  else info = `${w} × ${h} ${xs.fmt.toUpperCase()}, fully editable vector shapes.`;
  $('xinfo').textContent = info;
  $('xgo').textContent = xs.busy ? 'Exporting…' : isVid ? 'Record video' : 'Export ' + xs.fmt.toUpperCase();
  $('xgo').disabled = xs.busy;
}
function openExport() { if (!img) return; xs.kind = vid && xs.kind === 'video' ? 'video' : 'image'; document.body.classList.add('exporting'); $('xsheet').classList.remove('hidden'); drawExport(); }
function closeExport() { document.body.classList.remove('exporting'); $('xsheet').classList.add('hidden'); }
$('xclose').onclick = closeExport;
$('xgo').onclick = async () => {
  if (xs.kind === 'video') { closeExport(); startRecording(); return; }
  xs.busy = true; drawExport();
  await new Promise(r => setTimeout(r, 30));
  try {
    const [w, h] = dimsFor(v.exportLong);
    if (xs.fmt === 'png') {
      const c = document.createElement('canvas'); render(w, h, c); cache = null; layout();
      const blob = await new Promise(r => c.toBlob(r, 'image/png'));
      await saveToDevice(`loom-${w}x${h}.png`, blob, currentStyle());
    } else {
      const text = vectorFile(xs.fmt, w, h);
      await saveToDevice(`loom-${w}x${h}.${xs.fmt}`, new Blob([text], { type: xs.fmt === 'svg' ? 'image/svg+xml' : 'application/pdf' }), currentStyle());
    }
    closeExport();
    refreshLibraryIfOpen();
  } catch (err) { flash('Export failed'); }
  xs.busy = false; drawExport();
};

// Vector writers. Shapes are grouped by colour; density zones become clip regions.
function adjHex(hex) { const c = hex2rgb(hex), O = new Uint8ClampedArray([c[0], c[1], c[2], 255]); adjustPass(O); return rgb2hex([O[0], O[1], O[2]]); }
function vectorLayers(W, H) {
  patternSource(W, H);
  const S = sctx.getImageData(0, 0, W, H).data, u = Math.max(W, H) / 850;
  if (v.zmode === 'off') return [{ clip: null, G: shapeGeometry(W, H, u, S) }];
  const { rects, L } = zoneRects(W, H), keep = v.scale, out = [];
  for (const l of [...new Set(rects.map(z => z[4]))]) {
    v.scale = keep * (L > 1 ? 1 + (v.zrange - 1) * l / (L - 1) : 1);
    out.push({ clip: rects.filter(z => z[4] === l), G: shapeGeometry(W, H, u, S) });
  }
  v.scale = keep;
  return out;
}
const n2 = x => +x.toFixed(2);
function vectorFile(fmt, W, H) {
  const layers = vectorLayers(W, H), ground = layers[0].G.ground;
  if (fmt === 'svg') {
    const parts = [`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`];
    if (ground) parts.push(`<rect width="${W}" height="${H}" fill="${adjHex(ground)}"/>`);
    layers.forEach((ly, k) => {
      let open = '';
      if (ly.clip) { parts.push(`<clipPath id="z${k}">` + ly.clip.map(([x, y, w, h]) => `<rect x="${x}" y="${y}" width="${w}" height="${h}"/>`).join('') + '</clipPath>'); open = ` clip-path="url(#z${k})"`; }
      parts.push(`<g${open}>`);
      for (const [col, ops] of ly.G.groups) {
        let d = '';
        for (const o of ops) {
          if (o[0] === 'c') { const r = n2(o[3]); d += `M${n2(o[1] - o[3])} ${n2(o[2])}a${r} ${r} 0 1 0 ${n2(2 * o[3])} 0a${r} ${r} 0 1 0 ${n2(-2 * o[3])} 0z`; }
          else if (o[0] === 'r') d += `M${n2(o[1])} ${n2(o[2])}h${n2(o[3])}v${n2(o[4])}h${n2(-o[3])}z`;
          else if (o[0] === 'o') {
            const [, cx, cy, rO, rI] = o, pt = (r, i, sign) => `${n2(cx + r * Math.cos(sign * i / RING_SEG * Math.PI * 2))} ${n2(cy + r * Math.sin(sign * i / RING_SEG * Math.PI * 2))}`;
            let seg = `M${pt(rO, 0, 1)}`; for (let i = 1; i <= RING_SEG; i++) seg += `L${pt(rO, i, 1)}`; seg += 'z';
            seg += `M${pt(rI, 0, -1)}`; for (let i = 1; i <= RING_SEG; i++) seg += `L${pt(rI, i, -1)}`; seg += 'z';
            d += seg;
          }
          else { const q = o[1]; d += `M${n2(q[0])} ${n2(q[1])}` + q.slice(2).reduce((acc, val, i) => acc + (i % 2 ? ` ${n2(val)}` : `L${n2(val)}`), '') + 'z'; }
        }
        parts.push(`<path fill="${adjHex(col)}" d="${d}"/>`);
      }
      parts.push('</g>');
    });
    parts.push('</svg>');
    return parts.join('\n');
  }
  // PDF: one page, 1 px = 0.75 pt, top-left origin via a flipped transform
  const sc = 0.75, pw = n2(W * sc), ph = n2(H * sc), K = 0.5523;
  const rgb = hex => hex2rgb(adjHex(hex)).map(x => (x / 255).toFixed(3)).join(' ');
  const cmd = [`${sc} 0 0 ${-sc} 0 ${ph} cm`];
  if (ground) cmd.push(`${rgb(ground)} rg 0 0 ${W} ${H} re f`);
  for (const ly of layers) {
    cmd.push('q');
    if (ly.clip) cmd.push(ly.clip.map(([x, y, w, h]) => `${x} ${y} ${w} ${h} re`).join(' ') + ' W n');
    for (const [col, ops] of ly.G.groups) {
      const b = [`${rgb(col)} rg`];
      for (const o of ops) {
        if (o[0] === 'r') b.push(`${n2(o[1])} ${n2(o[2])} ${n2(o[3])} ${n2(o[4])} re`);
        else if (o[0] === 'c') {
          const [, x, y, r] = o, k = r * K;
          b.push(`${n2(x + r)} ${n2(y)} m ${n2(x + r)} ${n2(y + k)} ${n2(x + k)} ${n2(y + r)} ${n2(x)} ${n2(y + r)} c ${n2(x - k)} ${n2(y + r)} ${n2(x - r)} ${n2(y + k)} ${n2(x - r)} ${n2(y)} c ${n2(x - r)} ${n2(y - k)} ${n2(x - k)} ${n2(y - r)} ${n2(x)} ${n2(y - r)} c ${n2(x + k)} ${n2(y - r)} ${n2(x + r)} ${n2(y - k)} ${n2(x + r)} ${n2(y)} c h`);
        } else if (o[0] === 'o') {
          const [, cx, cy, rO, rI] = o, pt = (r, i, sign) => `${n2(cx + r * Math.cos(sign * i / RING_SEG * Math.PI * 2))} ${n2(cy + r * Math.sin(sign * i / RING_SEG * Math.PI * 2))}`;
          let t = `${pt(rO, 0, 1)} m`; for (let i = 1; i <= RING_SEG; i++) t += ` ${pt(rO, i, 1)} l`; t += ' h';
          t += ` ${pt(rI, 0, -1)} m`; for (let i = 1; i <= RING_SEG; i++) t += ` ${pt(rI, i, -1)} l`; t += ' h';
          b.push(t);
        } else { const q = o[1]; let t = `${n2(q[0])} ${n2(q[1])} m`; for (let i = 2; i < q.length; i += 2) t += ` ${n2(q[i])} ${n2(q[i + 1])} l`; b.push(t + ' h'); }
      }
      b.push('f'); cmd.push(b.join('\n'));
    }
    cmd.push('Q');
  }
  const stream = cmd.join('\n');
  const objs = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pw} ${ph}] /Contents 4 0 R /Resources << >> >>`,
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`];
  let pdf = '%PDF-1.4\n'; const offs = [];
  objs.forEach((o, i) => { offs.push(pdf.length); pdf += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = pdf.length;
  pdf += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` + offs.map(o => String(o).padStart(10, '0') + ' 00000 n \n').join('');
  pdf += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return pdf;
}

// ---------- motion: short, eased, and off when the system asks for reduced motion ----------
const EASE = 'cubic-bezier(.2,.8,.2,1)';
const calm = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
function anim(el, frames, opts) { return !el || calm() ? null : el.animate(frames, { duration: 280, easing: EASE, ...opts }); }
// Hide an element after its exit animation (or straight away with reduced motion)
// A timer backs up the animation's finish, because browsers freeze animations in background tabs
function hideAfter(el, frames, opts, hide) {
  const a = anim(el, frames, { fill: 'forwards', ...opts }); if (!a) return hide();
  let done = false; const end = () => { if (done) return; done = true; hide(); a.cancel(); };
  a.onfinish = end; setTimeout(end, (opts && opts.duration || 280) + 120);
}
// A soft crossfade on the artwork when the look changes wholesale (paste, load a style, switch pattern)
function settleArt() { anim(out, [{ opacity: .35, transform: 'scale(.992)' }, { opacity: 1, transform: 'none' }], { duration: 420 }); }

// ---------- gallery: a full-screen masonry grid — Patterns (your exports), Styles (saved
// looks) and Photos (uploaded sources). Replaces the old Library sheet; still opened from the Library button ----------
const lib = { tab: 'downloads' };
function escapeHtml(s) { return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function formatBytes(n) { if (n < 1024) return n + ' B'; if (n < 1048576) return (n / 1024).toFixed(1) + ' KB'; return (n / 1048576).toFixed(1) + ' MB'; }
function openLibrary() { document.body.classList.add('exporting'); document.body.classList.remove('menuopen'); $('library').classList.remove('hidden'); drawLibrary(); }
function closeLibrary() {
  const g = $('library'); if (g.classList.contains('hidden')) return;
  closeGalView(true); document.body.classList.remove('exporting');
  hideAfter(g, [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateY(10px)' }], { duration: 200 }, () => g.classList.add('hidden'));
}
function refreshLibraryIfOpen() { if (!$('library').classList.contains('hidden')) renderLibList(); }
$('vlib').onclick = openLibrary;
$('libClose').onclick = closeLibrary;
addEventListener('keydown', e => { if (e.key !== 'Escape' || $('library').classList.contains('hidden')) return; if (!$('galView').classList.contains('hidden')) closeGalView(); else closeLibrary(); });
function drawLibrary() {
  segment($('libSeg'), [['downloads', 'Patterns'], ['presets', 'Styles'], ['files', 'Photos']], lib.tab, t => { if (t === lib.tab) return; lib.tab = t; drawLibrary(); });
  renderLibList().then(() => anim($('libList'), [{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'none' }], { duration: 260 }));
}
const MODE_MARK = { none: '○', shapes: '◆', glyph: '✦', dither: '▦', martens: '▨', weave: '≋' };
const modeName = m => (MODE_ITEM.opts.find(o => o[0] === m) || [, m])[1];
// A tile is just the picture at its natural shape (masonry); tapping opens it large with its actions
function galTile(media, label, onOpen, onHold) {
  const t = document.createElement('button'); t.className = 'gal-tile'; t.setAttribute('aria-label', label);
  if (typeof media === 'string') { const m = document.createElement('div'); m.className = 'gal-mark'; m.textContent = media; t.append(m); } else t.append(media);
  // Hold (~0.45s) to copy the tile's style; a plain tap still opens it
  const wasHeld = holdToCopy(t, onHold);
  t.onclick = e => { if (wasHeld()) { e.preventDefault(); return; } openedFrom = t; onOpen(); };
  return t;
}
// Press-and-hold gesture on el: dims while held, then calls onHold. Returns a check for "that press was a hold"
// (consumed once) so the following click can be ignored. Elements are reused, so the latest onHold wins
function holdToCopy(el, onHold) {
  el._onHold = onHold;
  if (!el._holdBound) {
    el._holdBound = true;
    let timer = 0, start = null;
    const cancel = () => { clearTimeout(timer); timer = 0; el.classList.remove('holding'); };
    el.addEventListener('pointerdown', e => { el._held = false; start = [e.clientX, e.clientY]; if (!el._onHold) return; el.classList.add('holding');
      timer = setTimeout(() => { el._held = true; el.classList.remove('holding'); el._onHold(); if (navigator.vibrate) navigator.vibrate(12); }, 450); });
    el.addEventListener('pointermove', e => { if (timer && start && Math.hypot(e.clientX - start[0], e.clientY - start[1]) > 8) cancel(); });
    ['pointerup', 'pointercancel', 'pointerleave'].forEach(ev => el.addEventListener(ev, cancel));
    el.addEventListener('contextmenu', e => { if (el._onHold) e.preventDefault(); });
  }
  return () => { const h = el._held; el._held = false; return h; };
}
// Copy / paste a style: hold a style or pattern in the gallery (or the artwork) to copy; hold the artwork to paste
let copiedStyle = null;
function copyStyle(style, name) {
  if (!style) { flash('No style saved with this pattern'); return; }
  copiedStyle = { ...style, name }; flash('Style copied: hold your image to paste');
}
function pasteStyle() {
  if (!copiedStyle || !img) return;
  applyPreset({ name: copiedStyle.name, mode: copiedStyle.mode, state: copiedStyle.state }); flash('Style pasted'); settleArt();
}
// Desktop: ⌘/Ctrl+C and ⌘/Ctrl+V copy and paste styles, unless you're typing or have text selected
addEventListener('keydown', e => {
  if (!(e.metaKey || e.ctrlKey) || e.altKey || e.shiftKey || !img) return;
  const t = e.target; if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
  if (String(getSelection() || '').length) return;
  const k = e.key.toLowerCase();
  if (k === 'c') { e.preventDefault(); copyStyle(currentStyle(), 'Copied look'); }
  else if (k === 'v' && copiedStyle) { e.preventDefault(); pasteStyle(); }
});
async function renderLibList() {
  const box = $('libList');
  clearThumbs(box);
  const empty = msg => { box.innerHTML = `<p class="lib-empty">${msg}</p>`; };
  if (lib.tab === 'presets') {
    const items = await listPresets();
    if (!items.length) return empty('No saved styles yet. Use the save button in the top bar to keep a look.');
    items.forEach(p => {
      const media = () => { if (!p.thumb) return MODE_MARK[p.mode] || '◆'; const i = document.createElement('img'); i.alt = ''; i.onload = () => i.classList.add('ready'); i.src = p.thumb; return i; };
      box.append(galTile(media(), p.name, () => openGalView({
        media: media(), name: p.name, meta: modeName(p.mode) + ' · ' + new Date(p.createdAt).toLocaleDateString(),
        onHold: () => copyStyle({ mode: p.mode, state: p.state }, p.name),
        actions: [['Duplicate', GIC.duplicate, async () => { await savePreset(p.name + ' copy', p.mode, p.state, p.thumb); closeGalView(); renderLibList(); flash('Duplicated'); }],
          ['Rename', GIC.rename, () => renameInView(p.name, async n => { await renamePreset(p.id, n); p.name = n; renderLibList(); })],
          ['Delete', GIC.trash, async () => { await deletePreset(p.id); closeGalView(); renderLibList(); }]],
      }), () => copyStyle({ mode: p.mode, state: p.state }, p.name)));
    });
  } else if (lib.tab === 'files') {
    const items = await listFiles();
    if (!items.length) return empty('No photos or videos yet');
    items.forEach(f => box.append(galTile(thumbEl(f, box), f.name, () => openGalView({
      media: thumbEl(f, $('galMedia')), name: f.name, meta: new Date(f.createdAt).toLocaleDateString() + ' · ' + formatBytes(f.size),
      actions: [['Open', GIC.open, () => { closeGalView(); reopenFile(f); }, true],
        ['Delete', GIC.trash, async () => { await deleteFile(f.id); closeGalView(); renderLibList(); drawRecent(); }]],
    }))));
  } else {
    const items = await listDownloads();
    if (!items.length) return empty('Nothing exported yet. Your downloads appear here.');
    items.forEach(d => {
      const media = into => d.mime.startsWith('image/') || d.mime.startsWith('video/') ? thumbEl({ type: d.mime, blob: d.blob }, into) : (d.mime.includes('pdf') ? 'PDF' : '↓');
      box.append(galTile(media(box), d.filename, () => openGalView({
        media: media($('galMedia')), name: d.filename, meta: new Date(d.createdAt).toLocaleDateString() + ' · ' + formatBytes(d.size),
        onHold: d.style ? () => copyStyle(d.style, d.filename) : null,
        actions: [['Download', GIC.download, () => redownload(d.id), true],
          ['Delete', GIC.trash, async () => { await deleteDownload(d.id); closeGalView(); renderLibList(); }]],
      }), () => copyStyle(d.style, d.filename)));
    });
  }
}
let openedFrom = null; // the tile the large view grows out of, and shrinks back into
// Gallery action icons (Lucide)
const GIC = {
  download: I('<path d="M12 15V3" />  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />  <path d="m7 10 5 5 5-5" />'),
  trash: I('<path d="M3 6h18" />  <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />  <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />'),
  rename: I('<path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z" />'),
  duplicate: I('<rect width="14" height="14" x="8" y="8" rx="2" ry="2" />  <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />  <path d="M15 12v6" />  <path d="M12 15h6" />'),
  open: I('<path d="M15 3h6v6" />  <path d="M10 14 21 3" />  <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />'),
};
// Large view: the picture, its name and details, and icon actions in one row (the first marked one is the main
// action). Copying a style is a gesture: hold the picture, same as on the tiles
function openGalView({ media, name, meta, actions, onHold }) {
  // galMedia is emptied (and its URLs released) on close, so don't clear here — media was made for it
  const m = $('galMedia'); m.innerHTML = '';
  if (typeof media === 'string') { const el = document.createElement('div'); el.className = 'gal-mark'; el.textContent = media; m.append(el); }
  else { if (media.tagName === 'VIDEO') { media.controls = true; media.autoplay = true; media.loop = true; } m.append(media); }
  $('galName').textContent = name; $('galMeta').textContent = meta + (onHold ? ' · Hold to copy style' : '');
  holdToCopy(m, onHold);
  const bar = $('galActions'); bar.innerHTML = '';
  actions.forEach(([label, icon, fn, primary]) => { const b = document.createElement('button'); b.innerHTML = icon; b.setAttribute('aria-label', label); b.title = label; if (primary) b.className = 'primary'; b.onclick = fn; bar.append(b); });
  const view = $('galView'); view.classList.remove('hidden');
  // Shared-element zoom: the picture grows out of the tile it came from; details and actions follow just after
  const pic = m.firstElementChild, tile = openedFrom && (openedFrom.querySelector('img,video,.gal-mark') || openedFrom);
  anim(view, [{ backgroundColor: 'rgba(0,0,0,0)' }, { backgroundColor: '#000' }], { duration: 260 });
  [$('galBack'), m.nextElementSibling, $('galActions')].forEach((el, i) => anim(el, [{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'none' }], { duration: 300, delay: 90 + i * 40, fill: 'backwards' }));
  if (pic && tile) {
    const go = () => { const a = tile.getBoundingClientRect(), b = pic.getBoundingClientRect(); if (!b.width || !b.height) return;
      anim(pic, [{ transformOrigin: '0 0', transform: `translate(${a.left - b.left}px, ${a.top - b.top}px) scale(${a.width / b.width}, ${a.height / b.height})` }, { transformOrigin: '0 0', transform: 'none' }], { duration: 360 }); };
    if (pic.tagName === 'IMG' && !pic.complete) { pic.style.opacity = '0'; pic.onload = () => { pic.style.opacity = ''; go(); }; } else go();
  }
}
function renameInView(cur, save) {
  const nameEl = $('galName'), inp = document.createElement('input'); inp.className = 'gal-rename'; inp.value = cur; inp.maxLength = 40;
  nameEl.replaceWith(inp); inp.focus(); inp.select();
  let done = false;
  const finish = async ok => { if (done) return; done = true; const n = inp.value.trim(); inp.replaceWith(nameEl); if (ok && n && n !== cur) { await save(n); nameEl.textContent = n; } };
  inp.onkeydown = e => { e.stopPropagation(); if (e.key === 'Enter') finish(true); if (e.key === 'Escape') finish(false); };
  inp.onblur = () => finish(true);
}
function closeGalView(instant) {
  const view = $('galView'), m = $('galMedia'); if (view.classList.contains('hidden')) return;
  const done = () => { view.classList.add('hidden'); clearThumbs(m); };
  const pic = m.firstElementChild, tile = openedFrom && openedFrom.isConnected && (openedFrom.querySelector('img,video,.gal-mark') || openedFrom);
  if (instant || !pic || calm()) return done();
  [$('galBack'), m.nextElementSibling, $('galActions')].forEach(el => anim(el, [{ opacity: 1 }, { opacity: 0 }], { duration: 140, fill: 'forwards' }));
  if (tile) {
    // Shrink back into the tile, with the backdrop clearing to reveal the grid
    const a = tile.getBoundingClientRect(), b = pic.getBoundingClientRect();
    anim(pic, [{ transformOrigin: '0 0', transform: 'none' }, { transformOrigin: '0 0', transform: `translate(${a.left - b.left}px, ${a.top - b.top}px) scale(${a.width / b.width}, ${a.height / b.height})` }], { duration: 300, fill: 'forwards' });
    hideAfter(view, [{ backgroundColor: '#000' }, { backgroundColor: 'rgba(0,0,0,0)' }], { duration: 300 }, () => { done(); view.getAnimations().forEach(x => x.cancel()); [$('galBack'), m.nextElementSibling, $('galActions')].forEach(el => el.getAnimations().forEach(x => x.cancel())); });
  } else hideAfter(view, [{ opacity: 1 }, { opacity: 0 }], { duration: 200 }, () => { done(); [$('galBack'), m.nextElementSibling, $('galActions')].forEach(el => el.getAnimations().forEach(x => x.cancel())); });
}
$('galBack').onclick = () => closeGalView();
function applyPreset(p) {
  const { __seed, __palette, __paletteSrc, ...rest } = p.state;
  Object.assign(v, rest);
  // Presets from before Grain went global kept noise per mode
  if (rest.scale === undefined) {
    const m = rest.mode, old = m === 'shapes' ? rest.cell : m === 'glyph' ? rest.gcell : m === 'martens' ? rest.mpitch : m === 'dither' ? rest.ddsize * 5 : m === 'weave' ? 850 / ((rest.cols + rest.rows) / 2) : undefined;
    v.scale = Number.isFinite(old) ? Math.max(3, Math.min(120, Math.round(old))) : D0.scale;
    // Pixel kept column/row counts: turn them into widths relative to that Scale
    if (m === 'weave' && rest.cols && rest.rows) { v.pcw = Math.max(0.25, Math.min(8, 850 / rest.cols / v.scale)); v.prh = Math.max(0.25, Math.min(8, 850 / rest.rows / v.scale)); }
    // Glyph kept its own size/tone/mix, and its size shared a key with Glow size
    if (m === 'glyph' && rest.ghalf !== undefined) { v.halftone = rest.ghalf; v.jitter = rest.gjitter; if (rest.gsize <= 1.3) v.ssize = rest.gsize; }
  }
  if (!(v.gsize >= 2)) v.gsize = D0.gsize;
  if (rest.invert === undefined) v.invert = !!((rest.mode === 'glyph' && rest.ginvert) || (rest.mode === 'martens' && rest.minvert));
  if (rest.grain === undefined) v.grain = (rest.mode === 'weave' ? rest.noise : rest.mode === 'shapes' ? rest.snoise : 0) || 0;
  if (v.mode === 'martens' && !MARTENS_ON) v.mode = 'weave';
  if (v.sset === 'glyph') v.sset = 'mixed'; // Shapes' old "Glyph mix" option now lives on as Glyph mode
  if (typeof __seed === 'number') seed = __seed;
  cache = null; builtTab = null;
  // Presets saved since 2026-10-04 carry their colours; older ones fall back to the photo's palette
  if (Array.isArray(__palette) && __palette.length) { palette = __palette.slice(); paletteSrc = (Array.isArray(__paletteSrc) && __paletteSrc.length === __palette.length ? __paletteSrc : __palette).slice(); paletteAuto = false; }
  else if (img) extractPalette();
  closeLibrary(); drawAll(); schedule(); flash('Preset "' + p.name + '" loaded');
}
// Thumbnail for a stored image/video. URLs are tracked per container and revoked when it is redrawn
const thumbUrls = new WeakMap();
function thumbEl(f, box) {
  const url = URL.createObjectURL(f.blob); (thumbUrls.get(box) || thumbUrls.set(box, []).get(box)).push(url);
  // Pictures fade in as they arrive (the .ready class), rather than popping in
  if (f.type.startsWith('video/')) { const el = document.createElement('video'); el.muted = true; el.playsInline = true; el.preload = 'metadata'; el.onloadeddata = () => el.classList.add('ready'); el.src = url + '#t=0.1'; return el; }
  const el = document.createElement('img'); el.alt = ''; el.onload = () => el.classList.add('ready'); el.src = url; return el; // no async decoding: masonry tiles inside columns weren't painting with it
}
function clearThumbs(box) { (thumbUrls.get(box) || []).forEach(u => URL.revokeObjectURL(u)); thumbUrls.set(box, []); box.innerHTML = ''; }
// Loading screen: the last few photos/videos as one-tap thumbnails, plus a way into the full gallery
async function drawRecent() {
  const box = $('recent'); clearThumbs(box);
  const items = (await listFiles().catch(() => [])).slice(0, 5);
  box.hidden = $('recentAll').hidden = !items.length;
  items.forEach(f => {
    const b = document.createElement('button'); b.className = 'recent-item'; b.setAttribute('aria-label', 'Open ' + f.name);
    b.append(thumbEl(f, box)); if (f.type.startsWith('video/')) b.insertAdjacentHTML('beforeend', '<span class="recent-play">▶</span>');
    b.onclick = () => reopenFile(f); box.append(b);
  });
}
$('recentAll').onclick = () => { lib.tab = 'files'; openLibrary(); };
drawRecent();
function reopenFile(f) {
  const file = new File([f.blob], f.name, { type: f.type });
  closeLibrary();
  loadFile(file, { skipStore: true });
}
// A preset is the whole look: every setting, the shuffle seed and the palette
// A small JPEG of the look for its gallery tile. Rendered fresh at thumbnail size (patterns scale with the
// canvas) rather than copied from the screen, which can be mid-redraw or not yet painted
function lookThumb() {
  try {
    const r = ratio(), W = r >= 1 ? 360 : Math.round(360 * r), H = r >= 1 ? Math.round(360 / r) : 360, c = document.createElement('canvas');
    render(W, H, c); return c.toDataURL('image/jpeg', 0.82);
  } catch { return undefined; }
}
// The whole look as data: every setting, the shuffle seed and the palette (what presets, exports and copy/paste carry)
const currentStyle = () => ({ mode: v.mode, state: { ...v, __seed: seed, __palette: palette.slice(), __paletteSrc: paletteSrc.slice() } });
const saveLook = name => { const st = currentStyle(); return savePreset(name, st.mode, st.state, lookThumb()); };
// One-tap save from the top bar, auto-named by mode and time; rename it later in the library
// One Shuffle for everything: re-rolls the shared seed behind every random choice (glyph picks, Martens
// stagger, dither square sizes, grain)
$('vshuffle').innerHTML = IC.shuffle;
$('vshuffle').onclick = () => { if (!img) return; seed = Math.floor(Math.random() * 1e6); cache = null; flash('Shuffled'); schedule(); };
// Phones: the top bar's actions fold into a burger menu; any choice in it closes it again
$('vmenu').onclick = e => { e.stopPropagation(); document.body.classList.toggle('menuopen'); };
$('vbar').addEventListener('click', e => { const b = e.target.closest('button'); if (b && b.id !== 'vmenu') document.body.classList.remove('menuopen'); });
addEventListener('pointerdown', e => { if (!e.target.closest('#vbar')) document.body.classList.remove('menuopen'); });
$('vcrop').innerHTML = IC.crop;
$('vcrop').onclick = () => { if (!img) return; tabId = tabId === 'crop' ? null : 'crop'; if (tabId) rawPreview = false; builtTab = null; drawAll(); schedule(); };
$('vsave').onclick = async () => {
  if (!img) return;
  const modeName = (MODE_ITEM.opts.find(o => o[0] === v.mode) || [, 'Style'])[1];
  const name = modeName + ' · ' + new Date().toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  await saveLook(name);
  flash('Saved "' + name + '"');
  refreshLibraryIfOpen();
};

layout();
}
