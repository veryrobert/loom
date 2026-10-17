# Changes

## 2026-10-17 · README screenshot; desktop layout (59dec70)
A 16:9 screenshot of the Shapes pattern on a blank canvas at the top of the README. On desktop the
artwork is centred in the window (it sat to the right of the tab columns), the controls sit 16px clear
of the bottom edge, and the choice pills and title use 13px type like the other apps.

## 2026-10-17 · Reset with Undo, session timeout, new domain, sharper photos, Photos saving (d2fb95a)
Twelve commits that were sitting on local main. Reset now has Undo for 5 seconds, keeps a blank canvas's
own colours (it used to muddy them on every press) and is ignored while recording. Work left alone for
6 hours is cleared on reload or while open; the photo stays in Recents. Clear closes the export sheet,
gallery and copy/paste bubble, and a photo still loading can't reopen the editor. Also: phones save exports
to Photos through the share sheet; sharper photos (step-down resizing, up to 3x on iPhone, drag mode can't
stick at half resolution); perceptual palette extraction with mid-tone colours; patterns don't change
Adjust settings when first picked; Shapes background defaults to Auto. Now served from
loom.robertfarrelly.com (built for the root, with a CNAME).

## 2026-10-05 · Patterns keep their colours; desktop pills (99b7880)
Glyph, Martens and Dither keep their own palette and every other pattern shares one, so clicking through
Glyph and back leaves Shapes in its own colours. On desktop the choice pills use the full width beside the
menu, and a row that still scrolls fades at its edges instead of cutting pills off.
