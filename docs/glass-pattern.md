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
