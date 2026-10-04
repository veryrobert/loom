# Accounts: groundwork, not hooked up

Loom has no sign-in yet, and nothing about accounts is visible in the app. Everything lives in the
browser's IndexedDB on this device (see `src/storage/`). This note records how accounts are meant to
fit in later, so today's code doesn't paint us into a corner.

## What's in place

- `src/storage/account.ts`: `currentAccount()` always returns the local, signed-out account
  (`id: 'local'`). It is the one place the rest of the app asks "who is this?".
- Every new record (saved style, uploaded photo, export) is tagged `ownerId: currentAccount().id`.
  Records saved before this have no `ownerId` and count as `local`.
- The Gallery (Creations, Styles, Photos) reads through the storage modules only. Nothing in the UI
  touches IndexedDB directly, so its data source can change without UI rewrites.

## How sign-in would plug in

1. **Auth provider:** add a hosted provider (e.g. Supabase Auth or Clerk) and have `currentAccount()`
   return the signed-in user. Email magic link plus Apple/Google would keep it phone-friendly.
2. **Claim local work:** on first sign-in, re-tag `ownerId: 'local'` records to the new account id
   so nothing made before signing in is lost.
3. **Sync:** keep IndexedDB as the fast local cache. Push records to a cloud store (object storage
   for blobs, a table for presets and metadata), keyed by `ownerId`, and pull on other devices.
   Presets are small JSON plus a thumbnail, so they sync first. Photos and exports are larger and
   could sync on demand.
4. **Gallery per account:** list queries filter by the current `ownerId`. A signed-out device still
   sees its local work.

## Later, once accounts exist

- Public or shared gallery pages and style links ("try this look on your photo").
- Storage limits per plan instead of the fixed local caps (`MAX_FILES`, `MAX_DOWNLOADS`).
- Account UI: a small avatar in the top bar or burger menu, plus a sign-in sheet.

## Open questions

- Should uploaded source photos sync at all, or only styles and exports? (Privacy, storage cost.)
- Does a shared style carry its palette as-is, or adapt to the viewer's photo?
