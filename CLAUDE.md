# Studio — pottery studio app

A personal app Yudi uses **in the pottery studio, on an iPhone, with clay on their hands**. Two jobs:

1. Reference a board of inspiration photos.
2. Track glazes, clay bodies, and what went on which piece — including *where* on the piece.

Everything lives in `studio.html`. One file, no build step, no dependencies.

---

## Decisions already made — don't quietly reverse these

**Web app, not native.** Chosen deliberately over SwiftUI. The deciding factor was iteration speed: the glaze-pin interaction needs many rounds of adjustment, and a Mac/Xcode rebuild loop (plus 7-day expiry on a free provisioning profile) would have made that miserable. Native is a *later* conversation if the app earns its keep over a few months. The data model is the part that's hard to change, and it's designed to port cleanly.

**On-device storage, export as the backup story.** IndexedDB for records, image blobs in the same DB. No accounts, no backend, no API keys — the studio has bad wifi and Yudi's hands are dirty. Backup is a single JSON file with base64-embedded images: bigger file, zero dependencies, drop it in iCloud Drive. iOS can evict a home-screen web app's storage after ~7 weeks of no opens, which is why the Backup tab nags about this. **Do not add a sync backend without asking.**

**Materials are one store with a `type` field, not separate stores.** Type defaults to `Glaze`; `Underglaze`, `Slip`, and `Oxide` exist in the picker. Yudi doesn't use underglazes *yet* but expects to — the taxonomy is deliberately present and deliberately not prominent. Don't "simplify" it away, and don't promote the other types into the UI's foreground.

**Glazes support commercial fields AND recipes.** Yudi uses both. Brand/code fields are up front; the recipe section is collapsed by default and only shows on the detail view if it's filled in. The recipe total is displayed but **not enforced** to 100 — real recipes get scaled and tweaked.

**Cone 6 electric oxidation is pre-filled on every piece.** That's Yudi's actual setup, so logging a firing should normally be zero taps. Atmosphere, kiln, and schedule notes live behind a "Firing" disclosure for the rare non-standard firing. Don't surface these by default; don't remove them either.

**Application order is the point of the glaze pins.** Yudi paints on pieces, so a spot on a pot is often *N* materials stacked. The pin stores an ordered `layers` array and the UI labels it `first → last` explicitly, because application order is the single thing that's impossible to reconstruct from a finished pot weeks later. Any redesign of the pin sheet must keep order unambiguous.

---

## Data model

```
materials  { id, name, type, cone, colorHex, imageId, brand, code,
             method, coats, foodSafe, notes, recipe:[{material,pct}], updated }
clays      { id, name, type, supplier, coneRange, colorRaw, colorFired,
             colorFiredHex, imageId, notes, updated }
pieces     { id, name, clayId, form, stage, dateStarted, notes,
             photos:[imageId], pins:[Pin],
             firing:{cone, atmos, kiln, schedule, date}, updated }
Pin        { id, photoId, x, y, note, layers:[{materialId, coats, method}] }
inspo      { id, imageId, tags:[string], note, added }
images     { id, blob, w, h }
```

`Pin.x` / `Pin.y` are **normalized 0–1** against the displayed photo. This only works because the photo renders at `width:100%; height:auto`, so the element box equals the image box and no object-fit math is needed. If you change the photo layout to use `object-fit`, you must fix the coordinate math in the `stage-tap` handler.

`STAGES` are `Idea → Thrown → Trimmed → Drying → Bisque → Glazed → Fired`, each with a color in `STAGE_COLOR`.

Images are resized to 1800px on the long edge at JPEG 0.82 on import. Storage adds up fast on a phone; don't raise this without a reason.

---

## State of the code

Written in one pass. **Not yet verified with real renders** — a screenshot pass was started and interrupted. Assume there are rough edges. Priorities on pickup:

1. Serve it and confirm all four tabs render without console errors.
2. Walk the pin flow end to end: add piece → add photo → mark a glaze → multiple layers → save → tap pin → edit → delete.
3. Confirm the search input doesn't lose focus or cursor position while typing (there's a re-render hack in the `input` handler that's the likely suspect).
4. Confirm the material and clay photo pickers don't drop unsaved form fields when re-rendering the sheet after an image is chosen. This is the sketchiest code in the file.

The Backup tab has a **Load sample data** button that generates fake glazes, clay bodies, pieces with pins, and inspo images using canvas-drawn placeholder art. Use it for testing — no photo picking required.

---

## Not done yet, known

- **Hosting.** Needs a stable HTTPS origin for Add to Home Screen to behave and for a service worker. Currently there's no service worker; offline relies on iOS caching the page, which is not good enough. Adding a real SW means going multi-file — that's fine, the single-file constraint was for the prototype phase only.
- **Style.** Yudi is giving visual direction *after* seeing it work. Current styling is deliberately plain: warm near-black, one amber accent, system font, 48px minimum tap targets. **Treat all of it as placeholder.** Don't invest in visual polish before that direction lands.
- **Pinch-zoom in the lightbox** is a hand-rolled double-tap-to-2.5x with drag pan, because the viewport is locked with `user-scalable=no`. It's adequate, not good. Real pinch would be better.
- No reordering of pin layers after creation — you delete and re-add.
- No way to duplicate a piece or a glaze combo, which will probably get annoying.

## Working with Yudi

Iterating on visuals happens in **discussion mode** — hold changes and play them back for confirmation, don't rebuild the file on every note. Build when told to build. When an edit is named specifically, make that edit; don't take it as license to rewrite the surrounding code.
