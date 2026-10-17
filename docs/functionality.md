# loom: what it does, and what's been checked

Inventory for the move onto the starter (React, Tailwind, shadcn/ui), on the `port/starter` branch. Each line is checked as its
piece moves across. ✅ checked and working · 🔧 fixed · ☐ not checked yet.

## Opening work
- ✅ Start screen: upload an image or video, or start a blank canvas (image and canvas checked; video not yet)
- ☐ Recents on the start screen (last 5), plus "All photos" into the gallery
- ☐ Drag and drop a file anywhere
- ☐ Video: loads muted and looping; "Tap to start the video" when autoplay is blocked
- ✅ Session: the open photo/canvas and every setting are restored on reload
- 🔧 Session expires after 6 hours idle, on reload or while open (photo stays in Recents)
- ☐ Boot splash (woven mark), loader only when opening takes over 150ms

## Top bar (burger menu on phones)
- ☐ Crop: opens the Crop tab (format, zoom, reset position, hold to compare)
- ✅ Gallery
- 🔧 Reset: every setting to default. Now with Undo; a blank canvas keeps its colours; blocked while recording
- ☐ Upload
- ✅ New blank canvas
- 🔧 Clear: back to the start screen. Now also closes open sheets and cancels a load in flight
- ☐ Shuffle: new random seed
- ☐ Save style: auto-named by pattern and time
- ✅ Download: opens the export sheet
- ☐ Play/pause and record (video only)

## Tabs and controls (bottom dock on phones, left columns on desktop)
Each tab is a list of controls: sliders (scrub strip, double-tap item to reset), choices (chip row),
toggles, actions, colour, hold-to-compare. Toggles, actions and colour sit in the top-left corner group.
- ☐ Pattern: None, Shapes, Pixel, Glyph, Dither, Martens, Glass, Blobs, Diffuse, each with its own settings
- ☐ Adjust: canvas base (blank canvas only), brightness, contrast, saturation, hue, blur, blend + amount, adjust pattern only
- ☐ Colour: depends on pattern. Invert, colour the photo, palette size, extract, random palette, pick from image; swatches (edit, add, remove)
- ☐ Texture: grain, glow + size, dither finish (type, levels, dot size, random sizes, use palette)
- ☐ Scale: scale, density zones (hidden for None and Diffuse)
- ☐ Mask: treated area (full, fractions, patches), side, patch settings, move/scale/reset/shuffle mask
- ☐ Controls that depend on others appear and disappear without losing the selected control
- ☐ Patterns keep their own palettes (Glyph, Martens, Dither start black and white)
- ☐ Controls fade after 12s idle; tapping the artwork toggles them

## Artwork gestures
- ☐ Drag to pan, pinch or scroll to zoom (or move/scale the mask in Move mask)
- ☐ Half resolution while dragging, sharp when let go (including iPhone pinch end)
- ☐ Hold for Copy style / Paste style; ⌘C / ⌘V on desktop
- ☐ Pick from image: tap to add a colour to the palette

## Export
- ☐ Image: PNG at original, 1080, 2048, 4096; SVG and PDF for flat Shapes
- ☐ Video: records one pass at 720/1080/1920, MP4 or WebM
- ☐ Phones: share sheet, with a "Save to Photos" button when it needs a fresh tap
- ☐ Every export kept in the gallery

## Gallery
- ☐ Patterns (exports), Styles (saved looks), Photos (sources), as a masonry grid
- ☐ Tile opens a large view (grows out of the tile) with actions: download, open, duplicate, rename, delete
- ☐ Hold a tile or the large view to copy its style
- ☐ Escape closes the view, then the gallery

## Port steps
1. ✅ Toolchain and theme: Vite 8, TypeScript 6, React 19, Tailwind 4, shadcn/ui, Lucide; true-black theme
   and system type in loom's own CSS. The engine still draws every control.
2. ☐ Top bar → `Toolbar` + `ToolButton` (burger menu on phones)
3. ☐ Export sheet → shadcn `Sheet` with `Segmented`
4. ☐ Start screen and recents
5. ☐ Dock: tabs, item strip, scrub strip, chips, swatches, corner group, from the existing control schema
6. ☐ Gallery and large view
7. ☐ Engine split from UI: rendering, palette, gestures, video and export behind a small API, like cards
