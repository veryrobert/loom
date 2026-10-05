// Palette extraction v1 (replaced 2026-10-05): k-means in RGB with a 1.3x saturation lift.
// Retired because it filled palettes with near-identical dark shadow browns. See extractPalette in src/engine/loom.js.
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
