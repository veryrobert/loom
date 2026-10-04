# Glass pattern: research and plan

A new Loom pattern that puts the photo behind reeded, fluted or frosted glass.

## What the references show

- **Reeded glass over a portrait** (the "Glass Effect!" and "Never work for free" posters): vertical
  ribs, each a narrow cylindrical lens. Inside a rib the photo is squeezed or mirrored, so the subject
  breaks into repeating slivers that stay recognisable in shape but abstract in detail. Rib edges catch
  a thin bright line on one side and fall into shadow on the other.
- **Frosted, streaked glass** (the blue/peach abstract and the orange panels): the same ribs with a
  strong blur *along* the rib direction, which turns colour into soft vertical streaks.
- **Partial coverage** (the half-face posters, "EVOLUT"): glass over part of the frame only, with the
  clear photo beside it. Loom's **Mask** tab already does this (½, ⅓, Patches…), so Glass gets it for
  free.
- **Glassmorphism UI cards**: a translucent panel, a blurred background and a 1px edge. That's an
  interface style rather than an image effect, so it isn't part of this pattern.

## How the effect works

Established tools ([Paper Shaders: Fluted Glass](https://shaders.paper.design/fluted-glass),
[Instant Gradient](https://instantgradient.com/tools/fluted-glass), Photoshop's Displace filter
([Envato tutorial](https://design.tutsplus.com/tutorials/how-to-create-a-reeded-glass-photo-effect-in-photoshop--cms-109005),
[Abduzeedo](https://abduzeedo.com/reeded-glass-effect-photoshop-tutorial),
[Deke's ribbed glass](https://www.deke.com/content/dekes-techniques-396-put-your-photo-behind-ribbed-glass)))
all share the same model:

1. **Ribs:** a repeating pattern across the image (lines, optionally irregular widths).
2. **Refraction:** each pixel samples the photo from a position shifted *across* the rib. The shift's
   shape gives the glass type:
   - *Lens* (reeded): the shift grows from the rib centre outward, so each rib shows a magnified,
     mirrored slice.
   - *Prism* (fluted): a straight ramp across the rib, so each rib shows a shifted copy (sawtooth bands).
   - *Flat* / frosted: no shift, only blur.
3. **Blur:** mostly *along* the rib (the streaks), with a little haze.
4. **Light:** a highlight stroke near one edge of each rib, a soft shadow toward the other, and a fine
   dark seam between ribs.
5. **Dispersion:** red and blue sampled at slightly different shifts for a faint colour fringe, as real
   glass splits light ([FidelityFX Lens notes](https://gpuopen.com/manuals/fidelityfx_sdk/techniques/lens/)).
6. **Grain:** a light film grain to keep it from looking digital (Loom's Texture tab already has this).

## Plan for Loom

**Engine.** A new `renderGlass` in `src/engine/loom.js`, a CPU pixel pass like Dither (no WebGL needed):

- Work in rib space: the *across* axis (the shift direction) and the *along* axis (the blur direction),
  so vertical and horizontal ribs share one code path.
- Because the shift depends only on the position across the rib, precompute for each column the source
  column for R, G and B, plus a brightness multiply and add. The main pass is then a cheap gather.
- Blur along the rib with two running-sum box-blur passes (close to Gaussian, linear time). Frosted
  glass blurs across as well.
- Cache the result like the other patterns, so sliders that don't affect Glass stay fast.
- Finish like None: Glow, Grain, the Dither finish and Blend from Texture, then the Mask composite.

**Shared settings it reuses:**

- **Scale:** rib width, so Density zones vary rib width across the image.
- **Mask:** partial glass.
- **Adjust / Colour / Texture:** as everywhere. Glass keeps the photo's own colours. Invert gives a
  negative.
- **Shuffle:** re-rolls irregular rib widths.

**Glass's own controls (Pattern tab):**

| Control | Values | Default |
|---|---|---|
| Glass | Reeded · Fluted · Frosted | Reeded |
| Direction | Vertical · Horizontal | Vertical |
| Refraction | 0–1.5 | 0.7 |
| Frost | 0–1 | 0.2 |
| Highlights | 0–1 | 0.5 |
| Shadows | 0–1 | 0.35 |
| Fringe (colour split) | 0–1 | 0.2 |
| Irregular ribs | on / off | off |

**Out of scope for v1:** diagonal and wavy ribs, glass "cards" (inset panels with margins), and
vector export (Glass is a photographic effect, so PNG only).

## Testing

- Check against the references: a portrait with Mask ½ should read like the half-face posters, and
  high Frost on a colourful photo like the streaked abstracts.
- Scale and Density change rib width; Invert, Grain and Dither finish layer correctly.
- Performance: a full-screen redraw while dragging a slider should stay smooth on a phone.

## Code references (read 2026-10-04)

### Paper Shaders: Fluted Glass (open source, Apache 2.0)

[`packages/shaders/src/shaders/fluted-glass.ts`](https://github.com/paper-design/shaders/blob/main/packages/shaders/src/shaders/fluted-glass.ts)
is a single WebGL2 fragment shader and the most complete public implementation:

- **Rib space:** `uv = (uv - .5) * patternSize`, rotated by `angle`. `fract(uv.x)` is the position
  across a rib and `floor(uv.x)` the rib index. Distortion is added to the fract part, then the UV is
  rotated back and sampled. The shift is measured in *rib widths* and goes up to ~3, so each rib can
  show the image from several ribs away. That is much stronger slicing than Loom's current ≤0.75.
- **Distortion shapes** (x = position across the rib):
  - *prism* `-(1.5x)³ + .5`
  - *lens* `2x² − .5`
  - *contour* `(2(x−.5))⁶ − .25`
  - *cascade* `.5·sin((x+.25)·2π)`
  - *flat* `.33·(.33 − |x|^.2·x)`

  A `shift` uniform adds a constant offset, sliding the whole picture inside the ribs.
- **Anti-aliased seams:** `smoothFract` plus a `fadeX` ramp near each rib edge eases the distortion
  back to neutral, so rib boundaries don't jag.
- **Grid shapes:** lines, irregular lines (`.5 + .5·sin(.5x)·sin(1.7x)` added to x), wave
  (`4·sin(.23y)`), zigzag and a 2D pattern. Each bends the rib lines by adding a curve to x.
- **Highlights:** thin strokes about 2px wide at the rib boundaries (from `fwidth`), in a chosen colour.
- **Shadows:** `pow(x, 1.3)` across each rib, strength squared, in a chosen colour.
- **Blur:** a true one-directional Gaussian along the ribs (σ up to 50px), plus extra blur at margins.
- **Stretch:** pulls `uv.y` toward the centre near rib edges, a vertical smear.
- **Extras:** margins (inset glass panel with distorted edges), grain mixed into the distortion, and
  a grain overlay.

### n4.studio: Webflow's fluted glass ([write-up](https://www.n4.studio/feed/building-a-fluted-glass-component-for-webflow))

- Three.js `ShaderMaterial` on a plane; all logic in the fragment shader.
- Column boundaries are precomputed once into a lookup texture (one texture read per pixel).
- Each column gets a *random* lateral offset from a hash (`fract(sin(i·12.99)·43758.5) − .5`). That's
  flat, etched-looking glass without lens shading.
- Backgrounds are pre-blurred on the CPU once (`ctx.filter = 'blur(15px)'`, with a downsample fallback
  for Safari), so the shader never blurs per frame.

### Others

- [The Lazy God: Fluted Glass](https://thelazygod.com/snippets/fluted-glass) is a no-code Three.js
  snippet (minified, with a YouTube walkthrough).
- SVG `feDisplacementMap` approaches
  ([Tuts+](https://webdesign.tutsplus.com/liquid-glass-effect-svg-filters--cms-109200t),
  [LogRocket](https://blog.logrocket.com/how-create-liquid-glass-effects-css-and-svg/)) displace pixels
  by a map image. They're fine for UI, but slow and imprecise for photo-sized images.

### What this means for Loom's Glass

Loom already does the core idea (per-rib shift, blur along ribs, edge light, colour fringe) on the CPU.
Worth adopting:

1. Larger shift range, measured in rib widths, plus a **Shift** control.
2. Paper's shape curves (prism, lens, contour, cascade) as Glass types.
3. Seam anti-aliasing (ease the shift to neutral over the last ~1px of each rib).
4. **Wave** and **zigzag** rib shapes, plus any angle (diagonal).
5. Optional highlight and shadow colours (e.g. warm highlight, cool shadow).
6. Later, if slider drags feel slow on phones: move the pass to a WebGL fragment shader. The maths
   above maps one-to-one onto GLSL.
