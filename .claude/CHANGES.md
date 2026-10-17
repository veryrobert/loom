# Changes

## 2026-10-17 · Reset with Undo, session timeout, sharper photos, Photos saving (bb7747b)
Eleven commits that were sitting on local main. Reset now has Undo for 5 seconds, keeps a blank canvas's
own colours (it used to muddy them on every press) and is ignored while recording. Work left alone for
6 hours is cleared on reload or while open; the photo stays in Recents. Clear closes the export sheet,
gallery and copy/paste bubble, and a photo still loading can't reopen the editor. Also: phones save exports
to Photos through the share sheet; sharper photos (step-down resizing, up to 3x on iPhone, drag mode can't
stick at half resolution); perceptual palette extraction with mid-tone colours; patterns don't change
Adjust settings when first picked; Shapes background defaults to Auto.

## 2026-10-05 · Patterns keep their colours; desktop pills (99b7880)
Glyph, Martens and Dither keep their own palette and every other pattern shares one, so clicking through
Glyph and back leaves Shapes in its own colours. On desktop the choice pills use the full width beside the
menu, and a row that still scrolls fades at its edges instead of cutting pills off.

## 2026-10-05 · Blank canvas shuffle (fac3383)
A die button in the top-left corner on a blank canvas re-rolls the palette, the background layout and the
pattern's random choices in one tap. It shows on every tab, and never repeats the same palette twice in a row.
