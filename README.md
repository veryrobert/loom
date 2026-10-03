# Loom

Turns a photo or video into a flat graphic pattern — weave stripes or halftone
shapes, built from the image's own colours — entirely in the browser.

## Stack

- **Vite + TypeScript** for the build. No UI framework: the control surface is
  a hand-rolled, imperative DOM/canvas renderer (its own `v` state object
  drives everything), so wrapping it in React/Vue would mean rewriting a
  finely-tuned pixel engine for no real benefit. Vite just gives it proper
  modules, a dev server, and a production bundle.
- **Dexie (IndexedDB)** for persistence — presets, uploaded source files, and
  past exports all survive a reload. localStorage can't hold file blobs and
  caps out around 5MB, so this is a real "memory" layer rather than browser
  storage pretending to be one.

## Structure

```
index.html            Vite entry — static page shell (canvas, dock, sheets)
src/
  main.ts             Boots the app
  engine/
    loom.js            The renderer/controls/gestures/export engine (ported
                        near-verbatim from the original single-file artifact)
  storage/
    db.ts              Dexie schema: presets, files, downloads
    presets.ts         Save/list/load/delete named setting snapshots
    files.ts           Store/list/reopen uploaded source images & videos
    downloads.ts       Trigger a real download + keep a re-downloadable copy
  styles/
    app.css            All styling (including the new Library sheet)
reference/
  Loom.cleanup-reference.html   Superseded single-file version, kept for history
```

## Library (new)

A "Library" button sits in the top-right control bar, next to Download. It
opens a sheet with three tabs:

- **Presets** — save the current look under a name, reload it later, or delete it.
- **Files** — every image/video you've opened is kept (most recent ~16); tap
  one to reopen it without a file picker.
- **Downloads** — every PNG/SVG/PDF/video export is kept (most recent ~24);
  tap one to re-trigger the download.

All of it lives in IndexedDB, under the origin this page is served from — it
persists across reloads but is local to this browser/device.

## Develop

```
npm install
npm run dev       # dev server with HMR
npm run build     # type-check + production build to dist/
npm run preview   # serve the production build locally
```
