# Studio — pottery studio app

A personal app Yudi uses **in the pottery studio, on an iPhone, with clay on their hands**. Two jobs:

1. Reference a board of inspiration photos.
2. Track glazes, clay bodies, and what went on which piece — including *where* on the piece.

Everything lives in `studio.html`, plus one vendored file: `libheif-bundle.js` (libheif-js 1.19.8, LGPL/MIT wasm bundle), lazy-loaded only when a photo fails native decode and byte-sniffs as HEIC — Yudi's photos come off an iPhone, and desktop Chrome can't decode HEIC. heic2any was tried first and failed on real iPhone HEICs (its embedded libheif is 2019-era, predating 10-bit HDR HEVC). Detection sniffs the ISO-BMFF `ftyp` brand, not the filename — iPhone HEICs sometimes arrive named `.jpeg`. The two files must be served/hosted together. No build step, no CDN fetches at runtime, no other dependencies.

---

## Decisions already made — don't quietly reverse these

**Web app, not native.** Chosen deliberately over SwiftUI. The deciding factor was iteration speed: the glaze-pin interaction needs many rounds of adjustment, and a Mac/Xcode rebuild loop (plus 7-day expiry on a free provisioning profile) would have made that miserable. Native is a *later* conversation if the app earns its keep over a few months. The data model is the part that's hard to change, and it's designed to port cleanly.

**On-device storage, export as the backup story.** IndexedDB for records, image blobs in the same DB. No accounts, no backend, no API keys — the studio has bad wifi and Yudi's hands are dirty. Backup is a single JSON file with base64-embedded images: bigger file, zero dependencies, drop it in iCloud Drive. iOS can evict a home-screen web app's storage after ~7 weeks of no opens, which is why the Backup tab nags about this. **Do not add a sync backend without asking.**

**Materials are one store with a `type` field, not separate stores.** Type defaults to `Glaze`; `Underglaze`, `Slip`, and `Oxide` exist in the picker. Yudi doesn't use underglazes *yet* but expects to — the taxonomy is deliberately present and deliberately not prominent. Don't "simplify" it away, and don't promote the other types into the UI's foreground.

**Glazes support commercial fields AND recipes.** Yudi uses both. Brand/code fields are up front; the recipe section is collapsed by default and only shows on the detail view if it's filled in. The recipe total is displayed but **not enforced** to 100 — real recipes get scaled and tweaked.

**No firing data — reversed 2026-08-09.** An earlier version pre-filled cone 6 electric oxidation on every piece behind a "Firing" disclosure. Yudi doesn't do their own firing, so all firing UI (fields, disclosure, defaults) was removed at their request. Do not restore it. The `firing` key may still appear on old piece records and in old backups; it rides along untouched and is ignored by the UI.

**The photo IS the piece.** Pieces are created photo-first: tap + → photo picker → the piece exists. Name and notes are optional (`pieceTitle()` falls back to clay body, then "Untitled"); form, weight, and started-date fields were removed as noise — you can see the form in the photo. Piece metadata is just clay body + stage.

**Application order is the point of the glaze pins.** Yudi paints on pieces, so a spot on a pot is often *N* materials stacked. The pin stores an ordered `layers` array and the UI labels it `first → last` explicitly, because application order is the single thing that's impossible to reconstruct from a finished pot weeks later. Any redesign of the pin sheet must keep order unambiguous.

**Pin layers and clay bodies are entered by name, not picked from a dropdown.** Typing a name that matches an existing record (case-insensitive) links to it; an unknown name auto-creates a bare record (`Glaze` material for layers, clay body for the piece sheet) to enrich later. Storage is unchanged — layers keep `materialId`, pieces keep `clayId`; names are resolved at save time. This keeps the flow fast in the studio and lets the library build itself as a side effect. Piece cards list the distinct glaze names used (from pin layers), not a mark count. Suggestions render as tappable chips (`.sugg` + `renderSugg`) under the input, per Yudi's request — not a `<datalist>`, which iOS buries in the keyboard row.

---

## Data model

```
materials  { id, name, type, cone, colorHex, imageId, brand, code,
             method, coats, foodSafe, notes, recipe:[{material,pct}], updated }
clays      { id, name, type, supplier, coneRange, colorRaw, colorFired,
             colorFiredHex, imageId, notes, updated }
pieces     { id, name, clayId, stage, notes,
             photos:[imageId], pins:[Pin], updated }
           (name/notes optional; legacy records may also carry
            form, dateStarted, firing — kept but unused)
Pin        { id, photoId, x, y, note, layers:[{materialId, coats, method}] }
inspo      { id, imageId, tags:[string], note, added }
images     { id, blob, w, h }
```

`Pin.x` / `Pin.y` are **normalized 0–1** against the displayed photo. The `stage-tap` handler measures the IMG's `getBoundingClientRect()` (not the stage), so coordinates stay correct even while the photo is pinch-zoomed. The piece photo supports in-place pinch zoom (`attachStageZoom`, transform on `.zw` wrapper). **Pins live in `.pinlayer`, OUTSIDE the transformed wrapper**, repositioned by math in `apply()` — inside the scaled layer they rasterize blurry (Yudi noticed immediately). Don't move them back in. If you change the photo layout to use `object-fit`, you must fix the coordinate math.

Photo strip: the selected thumb carries an ✕ badge to remove; hold-and-drag reorders (`attachStripDrag`, iOS-Photos style; first photo is the piece's cover). A left-edge swipe (>70px, mostly horizontal) goes back from detail views — standalone mode has no browser back gesture.

`STAGES` are `Thrown → Bisque → Glazed → Fired`, each with a color in `STAGE_COLOR`. The ladder used to include Idea/Trimmed/Drying; `STAGE_ALIAS` maps those (from old data or backups) to `Thrown` — display via `stageOf()`, never raw `p.stage`.

Images are resized to 1800px on the long edge at JPEG 0.82 on import. Storage adds up fast on a phone; don't raise this without a reason.

---

## State of the code

Verified in Chrome at iPhone size on 2026-08-09 (see git history): all four tabs render without console errors, the pin flow works end to end (photo-first piece → two-layer mark → save → reopen → edit → delete), the search input keeps focus and mid-string cursor position through re-renders, and the material/clay photo pickers preserve unsaved form fields (including checkbox and recipe rows). Not yet verified on a real iPhone — Safari keyboard behavior around the search re-render is the main open question.

The Backup tab has a **Load sample data** button that generates fake glazes, clay bodies, pieces with pins, and inspo images using canvas-drawn placeholder art. Use it for testing — no photo picking required.

---

## Not done yet, known

- **Hosting.** Needs a stable HTTPS origin for Add to Home Screen to behave and for a service worker. Currently there's no service worker; offline relies on iOS caching the page, which is not good enough. Adding a real SW means going multi-file — that's fine, the single-file constraint was for the prototype phase only.
- **Style direction landed 2026-08-09: Blank Street Coffee's app.** Minimalist, clean, light mode. Warm cream page (#f6efe6), white cards with 20–24px radii, beige tonal tiles/inputs (#f0e4d2), dark warm-brown type (#46372a), one forest-green accent (#2e5c44). Primary actions are full-width green pills with UPPERCASE letter-spaced labels; secondary actions are beige pills; icon buttons are beige circles. System font, 48px minimum tap targets. The lightbox stays black — it's a photo viewer. Stage colors are muted (terracotta/ochre/steel/green) to sit on cream. Iterate within this language; don't reintroduce dark mode without asking.
- ~~Pinch-zoom~~ Done 2026-08-09: the piece photo pinch-zooms **in place** (Yudi explicitly did not want an overlay), and the inspo lightbox has real two-finger pinch plus double-tap. Both hand-rolled since the viewport is locked with `user-scalable=no`.
- **Lightbox layout is Apple Photos-shaped (Yudi's direction):** × left, counter dead-center, one ⋯ menu right (Delete lives in it), image top-aligned just under the bar, tag chips + an inline note field at the bottom. Tapping into the note reveals a tags field; both save in place — there is no inspo Edit sheet anymore. Long-pressing a tile in the inspo grid also deletes (with confirm).
- New pins offer the piece's existing layer stacks as one-tap "combo" chips (`pieceCombos`) — marking the same combo on a second photo of the same piece is the common case.
- **Marks are presented grouped by combo (Yudi approved 2026-08-09).** Pins with identical layer stacks (`comboKey`: materialId+coats+method) share one number on every photo, and the detail list shows one row per combo ("N spots · M photos") that expands to the individual spots (photo thumbnail + note → tap to open that mark). Pins stay independent records underneath — grouping is presentation only. Editing a spot's layers moves it to a different combo, which renumbers; that's expected.
- No reordering of pin layers after creation — you delete and re-add.
- No way to duplicate a piece or a glaze combo, which will probably get annoying.

## Working with Yudi

Iterating on visuals happens in **discussion mode** — hold changes and play them back for confirmation, don't rebuild the file on every note. Build when told to build. When an edit is named specifically, make that edit; don't take it as license to rewrite the surrounding code.
