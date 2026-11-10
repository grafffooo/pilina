# Pilina: plan

Pilina started as a ground-up rebuild of CutList Optimizer. The existing apps (`index.html`, `CutListOptimizerApp`, `CutListOptimizerApp-i18n`) are not part of this project. This project lives in `~/Developer/pilina` and in a private GitHub repository (see [README](README.md#repository)).

## Goals

1. **The cutting engine is its own library, written in Rust.** The web app uses it now; native Android and iOS apps reuse it later.
2. **The web app works on desktop and phone** and installs as a PWA that works offline.
3. **Material prices give a project cost**, using either whole sheets or area used.
4. **Statistics:** for each project and across all projects.
5. **Offcut library** with QR labels on A4 sticker sheets, as on the design canvas.
6. **Ready for AR later:** cut lines drawn over a real sheet lying on the floor.

## Decisions so far

| Topic | Decision |
|---|---|
| Data | **Local only.** Each device keeps its own data in IndexedDB. Share by file (`.pilina.json`, plus `.md` the old app can read), a linked folder (Chromium desktop), the phone's share sheet, or a link/QR code holding a small project. No server. |
| Pricing | **Chosen per project:** whole sheets, or area used plus a waste %. Kept offcuts can be credited back. Edge banding is priced per metre (per foot when working in inches). |
| Cut modes | **Guillotine first** (table saw / panel saw). The engine's API leaves room for a CNC nesting mode later. |
| Languages | **English, Slovak and Czech** at launch, with translations set up from day one. The other 41 come later from the old translation files. |
| Look | The design canvas: warm workshop palette (wood-brown accent, moss green only on Start cutting), Inter font, orange rip cuts, red dashed cross cuts, light and dark themes. |

## Architecture

```
pilina/
├─ crates/
│  ├─ pilina-core/   Rust: data types, optimizer, pricing, statistics. Pure functions, no I/O.
│  ├─ pilina-wasm/   wasm-bindgen wrapper → npm package the web app imports
│  ├─ pilina-cli/    command line: optimize a project file, run benchmarks
│  └─ pilina-ffi/    (later) UniFFI wrapper → Kotlin (Android) and Swift (iOS)
├─ web/               the PWA (TypeScript)
├─ desktop/           Tauri shell: the web app as a Mac app
└─ docs/
```

### 1. Rust core (`pilina-core`)

- **Input/output:** plain data that converts to JSON: `Job { parts, stock, offcuts, kerf, trim, options }` produces `Plan { sheets, cuts, offcutsProduced, unplaced, totals }`. All sizes are in millimetres, and every sheet's layout uses that sheet's own coordinates, so the same data can drive the SVG drawing, the PDF and AR.
- **Optimizer:** a `Packer` interface with `GuillotinePacker` in version 1. It starts as a port of the improved JS engine:
  - 3-stage cuts plus trims;
  - both sheet orientations;
  - several scoring strategies;
  - many starting orders, keeping the best result;
  - identical sheets merged into one layout with a count;
  - cuts numbered in sawing order.

  It then gets better than the JS version: a **pilot (lookahead) search** that tries the best few candidates for each sheet, finishes the job greedily from each and keeps the one leading to the best plan; and **library offcuts used first** (stock marked `offcut`) when the material matches. A `NestingPacker` for CNC can be added behind the same interface later.

  *Status (milestone 1):* done. The port matches the JS engine exactly on every test job; with the lookahead it beats it (random 40-type job: 12 sheets instead of 13, at the area lower bound) inside the same 600 ms budget. Plans compare by: fewest unplaced parts, least new sheet area (offcuts are free), biggest leftover on the last sheet, fewest cuts.
- **Behaviour:** results are deterministic (seeded), the run has a time budget, and it reports progress and can be cancelled. Large jobs run in a Web Worker so the page never freezes.
- **Pricing and statistics** are also in the core, so phones and the web always get the same numbers.
- **Quality checks:**
  - property tests (`proptest`) on random jobs: no overlaps, nothing outside a sheet, every part either placed or reported;
  - fixed-answer tests, including "Skrinky do dielne": 1 sheet, 17 cuts, 16,386 mm, or better;
  - `criterion` benchmarks.

### 2. Web app (`web/`)

| Concern | Choice | Why |
|---|---|---|
| Framework | **React 19 + TypeScript + Vite** | Largest ecosystem, and `react-three-fiber` / `@react-three/xr` make the future AR view natural. |
| Styling | CSS custom properties copied from the canvas tokens, plus CSS modules | Light and dark themes come straight from the design. |
| State | Zustand | Small, simple, works well with a worker. |
| Storage | IndexedDB via Dexie, with a versioned schema and migrations | Local only, larger than localStorage, survives offline. |
| Engine | `pilina-wasm` in a Web Worker via Comlink | Typed calls, the interface stays responsive. |
| Sheet drawing | SVG components | Sharp at any zoom, prints, accessible. |
| PDF | `pdf-lib` with an embedded Inter font subset | Fixes the "?" problem with Slovak/Czech characters in the old PDF. |
| Labels | Print stylesheet in millimetre units for A4 sticker sheets, plus the `qrcode` library | Exact positions on the stickers; the QR holds identifying text only. |
| Charts | Recharts | Enough for the statistics pages. |
| Translations | i18next with JSON files per language | Easy to bring the old translations back in later. |
| PWA | `vite-plugin-pwa` (Workbox) | Install, offline use, update prompt. |
| Tests | Vitest (logic), Playwright (end to end on desktop and phone sizes) | |

**Screens:** the canvas designs.
- Desktop workspace: sidebar, editor, results.
- Phone tabs: Parts / Sheets / Cut.
- Step-by-step cut mode.
- Offcut library, "keep offcuts" after a sheet, and A4 label printing.
- **New:** a Materials and prices screen, and a Statistics screen.

### 3. Data model (stored on the device)

- **Material:** name, thickness, grain (along the sheet's length, along its width, or none), colour, price per sheet *or* per m², currency. A part's grain setting says which of its sides must follow the board's grain; on a board without grain, parts rotate freely. Offcuts remember which way their grain runs.
- **Stock sheet:** material + size + quantity (or unlimited) + priority.
- **Edge band:** name, price per metre.
- **Project:**
  - name, kerf, trim, pricing mode (whole sheets / area + waste %), offcut credit on or off;
  - parts: size, quantity, label, grain, enabled, banded edges and their edge band, material;
  - stock;
  - extra cost lines (for example hinges);
  - status: draft, cutting (a cut mode session in progress, "2 / 5" sheets) or cut. Nothing extra is stored: "cut" is the project's `cutAt`, set by cut mode after the last sheet or by "Mark as cut". A cut project is read-only until "Edit as draft", and the sidebar keeps cut projects in a collapsed "Cut" group.
- **Units** (a workshop setting, not per project, since materials and offcuts are shared): millimetres, centimetres or inches. Everything is stored in millimetres; only typing and display convert. Inches show as fractions to 1/32″ and accept `23 5/8`, `23-5/8`, `23.625` or feet and inches (`2' 3 1/2"`); a unit typed after a number (`600mm`) wins over the setting. With inches, long lengths are in feet and areas in ft², so prices per m² and per metre are shown and entered per ft² and per foot. Old CutList projects measured in inches or centimetres are converted on import, and the import offers to switch the setting.
- **Offcut:** `OC-0001` ID, material, size, location, status (available / reserved / used), where it came from, label printed or not.
- **Cut record:** saved when a sheet is marked as cut (date, project, material used, waste, cost). The statistics are built from these records.
- **Import** from the old app: its localStorage data and its `.md` files.

Parts get a material field. The current app assumes a single material, but furniture often mixes board types, so the optimizer runs once per material group.

### 4. Pricing

- **Whole sheets:** cost = every sheet started × that sheet's price. Kept offcuts can be credited back at their share of the area.
- **Area used:** cost = used m² × price per m² × (1 + waste %).
- **Edge banding:** metres × price per metre, with a small extra length per edge (setting, default 20 mm).
- **Shown in:** a cost card in Results (total, cost per material, sheets vs area), the PDF, and the statistics.

### 5. Statistics

- **Per project:** usage and waste per material, cost breakdown, cut count and length, edge banding.
- **Across all projects:**
  - material used and money spent per month;
  - waste % trend;
  - offcuts kept, reused, and the value they saved;
  - most used materials.

### 6. AR later (not in version 1)

- **Android Chrome:** WebXR `immersive-ar` with hit testing. You tap 2–3 corners of the real sheet, the app works out where it lies, and the cut lines appear on it using the same millimetre layout data.
- **iOS:** Safari has no WebXR, so this needs the native app with ARKit plus the Rust core through UniFFI.
- **What version 1 does to prepare:** layouts are in real millimetres per sheet, with the drawing kept separate from the data, so the AR view is just another way of drawing them.

## Milestones

| # | Milestone | Done when |
|---|---|---|
| 0 ✅ | **Setup:** Rust toolchain (rustup, wasm32 target, wasm-pack), git repo, Vite app skeleton, lint and format | `cargo test` and `npm run dev` both work |
| 1 ✅ | **Rust engine:** port plus improvements, property tests, benchmarks, CLI, WASM build | Better than or equal to the JS engine on the test jobs; no overlaps across 10k random jobs |
| 2 ✅ | **Web foundation:** design tokens, layout (desktop and phone), projects and IndexedDB, parts/stock editors, live optimizing in a worker, sheet drawing, cut list | You can enter "Skrinky do dielne" and see the correct layout |
| 3 ✅ | **Materials, pricing, PDF** | Costs show in Results and the PDF; Slovak/Czech text prints correctly |
| 4 ✅ | **Workshop flow:** cut mode, keep offcuts, offcut library, A4 QR labels, offcuts used first | The canvas flows work end to end; printed labels scan |
| 5 ✅ | **Statistics, import, PWA, EN/SK/CS** | Installs, works offline, imports old projects |
| 6 ✅ | **PDF overview page:** page 1 as on the canvas ("Cutting plan PDF, page 1"): header with the total, a to-scale thumbnail of the first sheet, a board-use bar (parts / reusable leftovers / waste), key facts with icons, materials and cost with use bars and a cost split, and a parts list with to-scale silhouettes showing banded edges and a tick box per part | The exported PDF matches the canvas page in English, Slovak and Czech, and long part lists continue on the next page |
| 7 ✅ | **Cut order: rips first.** Number and show the cuts the way most workshops saw: all rip cuts first (track saw or plunge saw on the whole sheet), then the cross cuts of each strip (mitre saw or table saw), strip by strip. Applies everywhere cuts appear: the sheet drawing's numbers, the cut list, cut mode, the PDF, spoken cuts and the "from the last cut" measurements. "Strip by strip" (rip, then that strip's cross cuts) stays as a setting for panel saws | A plan's cuts read rips first in every screen; cut mode walks through the rips, then each strip's cross cuts, and says which strip to pick up; measurements still give the size of the piece coming off |
| 8 ✅ | **Sharing and cloud folders:** `.md` export the old app can read; the phone's share sheet; a link/QR code holding a small project; and a linked folder kept in a cloud drive (Google Drive, OneDrive, iCloud Drive) used as file storage, one project file per project, not as a database. The folder also carries the offcut library, the cut records and the workshop settings | A project, an offcut or a settings change made on one computer shows up on another through the cloud folder; a link opens the project wherever the app runs |
| 9 ✅ | **Small gaps:** cut mode positions measured from the last cut edge (what a track saw, table saw fence or panel saw needs), with the sheet edge as an option; grain for hand-added offcuts; full-width Statistics; custom sticker sizes; scanning labels with the phone camera | Each works in the browser, with tests where there's logic |
| 10 ✅ | **End-to-end tests (Playwright)** on desktop and phone sizes: enter parts, cut mode with keep offcuts, labels, import/export, units, cut status | Run with one command, pass on a clean checkout |
| 11 | **Later:** a public address for share links (publishing the web app); phones and the cloud folder (Google Drive and OneDrive web APIs, iCloud through the native app); a real two-Mac test of folder sync in iCloud Drive; AR (WebXR), native apps through UniFFI, CNC nesting, more languages | Separate plans |

Each milestone ends with tests passing and a short demo in the browser.

## Still open (not blocking)

- **Engine speed on big jobs:** about 10 ms per greedy pass for 40 part types (≈12,000 strip simulations), so very large jobs get fewer lookahead passes within the budget. Fine for furniture; revisit if needed.
- **TypeScript types** are kept in sync with `model.rs` by hand; generating them (e.g. `ts-rs`) once the model settles.
- **End-to-end tests (milestone 10, as built):** `npm run e2e` runs 11 tests in `web/e2e/` twice, at a desktop size (1440 × 900) and as a phone (Pixel 7), each on a fresh browser with empty storage, against its own dev server on port 5174. Covered: typing and pasting parts, the plan and its rips-first cut list, a part that doesn't fit, saving across a reload; inches with feet and fractions; marking cut, the lock and back to draft; cut mode from first cut to keeping offcuts (with resuming and the "Cutting" status), printing their labels (the print call is stubbed and the print sheet read), and the offcut used first by the next project; a project file and a share link opened on a second device, the old app's `.md` import, and the PDF. Only Chromium so far; WebKit (Safari, iPhone) would be the next browser to add. Not covered: folder sync (the browser's folder picker can't be driven; `folderSync.test.ts` covers it with an in-memory folder), the camera scanner, and the Mac app.
- **Cut order (milestone 7), as built:**
  - **In the engine**, so every screen (and the future native apps) gets the same numbers: the layout already knows each cut's stage (0 edge trim, 1 rip, 2 cross cut of a strip, 3 split of a row, 4 part trimmed to length). "Rips first" numbers the edge trims, then every stage-1 rip from left to right, then strip by strip: its cross cuts, then the splits and trims inside each row. "Strip by strip" keeps today's order. It's a job option, so plans stay deterministic and the cut list, drawing and PDF can't disagree.
  - **Which cuts count as rips:** only the full-length stage-1 cuts on the whole sheet (the track saw work). Row splits (stage 3) run the same way as rips but on small pieces, so they belong to the cross-cut phase at the mitre or table saw.
  - **Cut mode** gets two phases on each sheet: "Rip cuts" (the whole sheet stays on the bench), then "Cross cuts" strip by strip, with "Pick up strip 2 of 3 (760 wide)" before each strip so it's clear which piece is next. The drawing highlights the current strip. Keep offcuts still comes after the sheet's last cut.
  - **Measurements from the last cut** keep working unchanged: they replay the cuts in the new order.
  - **Setting:** Settings → Cut order: "Rips first" (default) or "Strip by strip". Changing it re-optimizes nothing, only renumbers.
  - **What the engine returns:** each cut carries `strip` (the strip it belongs to; 0 for edge trims) and each sheet lists its `strips` as rectangles, so cut mode can say "Pick up strip 2 of 3 (760 wide, 2780 long)" and fade the rest of the drawing. The Results cut list gets "Rip cuts" and "Strip n of m" headings. Plans saved before this (in a cutting session) have no strips and simply show no strip hints.
  - **Found on the way:** square parts always came back with `rotated: false`, so a square part with grain could be drawn with its grain the wrong way; the layout now takes the flag from the orientation the packer chose.
  - **Later, if wanted:** ripping every sheet of a material before any cross cut (batching by tool across sheets). Cut mode would then go rips of sheets 1–3, then cross cuts of sheet 1, 2, 3; keep offcuts moves to the end of each sheet's cross cuts.
- **Sharing and cloud folders (milestone 8), what's built:** a Share dialog (header button, or ⋯ → Share or export) with the project file, the PDF and an old-app `.md`, each through the share sheet where the browser has one, otherwise saved; a link holding the whole project after `#` (compressed, short ids, about 1 KB for a typical project, with a QR code up to 1200 characters), which offers to add the project when opened; and a linked folder (Settings → Cloud folder) in the Mac app and in Chrome/Edge on a computer. The folder holds one `.pilina.json` per project (the same file as "Save file") and `pilina-library.json` with materials and edge bands; every sync reads the folder and the newer copy of each project wins. A missing file never deletes anything; a deletion leaves a small marker file that other devices follow (unless they changed the project afterwards). Syncs run 2.5 s after a change, on window focus and every minute.
- **Workshop data in the folder (milestone 8):** three more files beside the projects. `pilina-settings.json` holds the workshop settings (units, currency, cut positions and order, offcut sizes, storage places, sticker sheets); the newer side wins, a tie goes to the folder, and the offcut counter only ever goes up (keeping an offcut doesn't count as a settings change). `pilina-offcuts.json` holds every offcut plus the ids of deleted ones; the newer copy of each offcut wins (offcuts now carry `updatedAt`), and a deletion only wins over a copy that hasn't changed since. If two devices kept an offcut under the same code before syncing, the one kept first keeps it and the other gets the next free number and a label in the print queue. `pilina-cut-records.json` holds the cut records behind the statistics; they're only ever added, so it's the union. Language and theme stay per device.
- **Moved to Later (milestone 11):**
  - **A public address for links.** Links point to wherever the app runs (or `VITE_PUBLIC_URL`), so on `localhost` they only open on this computer, and the Mac app shows no link until the app is published (for example GitHub Pages or Netlify).
  - **Phones and the cloud folder.** A phone browser can't keep a folder open. Options: the Google Drive and OneDrive web APIs (sign-in in the browser, files in an app folder, still no server of ours; needs an app registration with Google and Microsoft); for iCloud, the share sheet and the Files app until the native iOS app.
  - Not tested on a real cloud drive yet: link a folder in iCloud Drive on two Macs and edit on both.
- **PDF size:** pdf-lib's font subsetting drops glyphs from the Inter TTFs, so both weights are embedded whole (~370 KB per PDF). Revisit if a fixed fontkit appears or with a different subsetter.
- **Label printing** was checked on screen (layout in millimetres, QR codes decode with the browser's barcode reader); a real print on sticker sheets still needs a try, using the outline test page first. Sticker sheets not in the list can be measured in (Custom size: columns, rows, sticker size, margins, gaps), with a warning when they run past the A4 page.
- **Cut positions** are measured from the last cut edge by default (Settings → Cut positions): the cuts are replayed in sawing order, and each position is the distance from the edge of the piece being cut to the near side of the blade, so it equals the size of the piece coming off. "From the sheet edge" gives the old kerf-centre positions. Cut mode, the cut list and the PDF follow the setting; cut mode also shows the size of the piece being cut. While building this, the engine's edge-trim cuts were found running half a kerf into the parts; they now run inside the trimmed margin.
- **Scanning labels:** a hardware scanner types into the library search; on phones the scan button in the search box reads the label's QR code with the camera (Chrome's built-in reader, or the jsQR library in Safari). Not in the Mac app, which has no camera permission. Still to try on a real phone with printed labels.
- **Interface languages:** English, Slovak and Czech via i18next, with English sentences as keys. `src/i18n/i18n.test.ts` fails if a Slovak or Czech translation (or a plural form) is missing, so new text can't slip through untranslated. More languages: add a JSON file and one line in `LANGUAGES`.
- **Offline install** is checked from the build (manifest, PNG/maskable icons, every needed file precached, navigation fallback), but the built-in browser pane can't register service workers and no Chromium browser is installed here. Still to do by hand: open the production build in Safari (File → Add to Dock) or Chrome, go offline, and reload.
- **Import:** old `.md` exports, the old app's browser storage (read directly when served from the same address, otherwise pasted), and this app's `.pilina.json` (and older `.cutlist.json`) project files. Old project folders synced with "Link folder" are imported by selecting all their `.md` files.
