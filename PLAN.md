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
| Languages | **All 44 languages of the old app** (English plus 43), including right-to-left Arabic and Urdu. Translations were written fresh, without native review. |
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
| 11 | **Later:** a public address for share links (publishing the web app); phones and the cloud folder (Google Drive and OneDrive web APIs, iCloud through the native app); a real two-Mac test of folder sync in iCloud Drive; AR (WebXR), native apps through UniFFI, CNC nesting, native-speaker review of the translations | Separate plans |
| 12 | **Mobile UI that feels native (Android and iOS).** Audit and design are done (see [the audit](docs/mobile/ANALYSIS-0.2.0.md) and "Mobile UI design (milestone 12)" below); what's left is building it. Fixes: 44 px touch targets, 16 px fields so iOS doesn't zoom on focus, table rows as cards (Parts, Stock, Offcut library, Materials, Edge bands) with every desktop column and action kept, dialogs as bottom sheets, a bottom bar with the app icon first (no hamburger) that opens a full-screen Projects tab, a full-screen Settings, a Cut projects archive, and full-screen task screens for Add part, Add board, Add edge band, Add offcut and Print labels. One 12 px corner radius on every button and a circular saw-blade icon in place of the scissors, on desktop too. Order: shared base (sizes, radius, icon), bottom bar with Projects, Cut projects and Settings, cards, sheets and the add/label screens, Sheets/Cut/Cut mode/Keep offcuts polish, then re-run the audit as `after` | At phone width there is no sideways scrolling, no tap target under 44 px, no field under 16 px and no select under 72 px on any screen; every desktop control is reachable; `docs/mobile/after/` holds before/after screenshots; the Playwright phone project asserts the numbers (`npm run screenshots:mobile` collects them) |
| 13 | **Apps for Windows, Linux and Android.** Windows and Linux: build and test the Tauri app on both (installer, file access to the synced folder, auto-update decision), and check that the release workflow's output actually installs and runs. Android: **decide first** between a native app (UniFFI or Tauri mobile with the Rust engine, real file/folder access, better camera scanning) and a wrapper around the PWA (Bubblewrap/TWA as in the current workflow, or Capacitor), comparing effort, offline use, folder sync, store rules and how native it feels. Write the decision in this file | Windows and Linux installers install and run with the same features as the Mac app; the Android decision is written down with reasons, and an Android build following it installs on a phone and opens, edits and cuts a project |
| 14 | **SPIKE: a local database in the sync folder instead of JSON files.** Research whether the cloud folder could hold one database file (for example SQLite compiled to WASM with a file-backed store, or another embedded format) rather than many `.json`/`.md` files. Questions: how it behaves when Google Drive, OneDrive or iCloud sync a single large changing file (conflicted copies, partial uploads, locking); whether two devices can merge changes; browser file access on the web app versus Tauri; size and speed against the current files; migration from the existing files and keeping the `.md` export. Output: a short write-up with a measured prototype and a recommendation (switch, keep files, or a hybrid), no change to the app yet | A written recommendation in this file with measurements, a throwaway prototype, and a clear yes/no on moving forward |
| 15 | **Review fixes and polish:** folder sync deletion tracking for materials/bands and safe tombstone clearing; hand-added offcuts without a material used by stock without a material; workshop offcut size thresholds used in drawings, Results and the PDF; material check in `unplacedReason`; changing `cutOrder` renumbers without re-optimizing; single engine worker without cold-start restarts; fewer allocations in `pack_frame`; narrow Tauri filesystem scope | All unit, property and e2e tests pass; deleting a material or offcut stays deleted across syncs; toggling cut order is instant and keeps the exact layout |

Each milestone ends with tests passing and a short demo in the browser.

## Still open (not blocking)

- **Mobile UI design (milestone 12):** the design canvas (Pilina Redesign, "Phone" and "Mobile" boards) is the reference; the audit and screenshots of 0.2.0 are in `docs/mobile/`.
  - **Navigation:** no hamburger. The bottom bar is Projects (the app icon), Parts, Sheets, Cut. Projects is a full screen: app icon and name with a gear for Settings, a fixed search box, tiles for Offcuts, Materials, Statistics and Import, a "Cut projects" folder row (like the desktop archive) and the active projects grouped Today / Yesterday / This week / Earlier, with a floating New project button. Cut projects open their own screen grouped by month (collapsible, read-only until edited as draft). Settings is a full screen, with Language as a picker sheet and Theme, Units, Cut positions and Cut order as segmented controls.
  - **Projects at scale (20 active, 30 cut):** the header (app icon, name, gear, search) stays fixed while the list scrolls. Four shortcut tiles (Offcuts, Materials, Statistics, Import) sit above the list, so they aren't buried. A "Cut projects" folder row with its count sits above the active list, like the desktop archive, and opens a screen grouped by month (collapsible, with its own search). Active projects are grouped Today / Yesterday / This week / Earlier, 64 px rows with a Sort chip. New project is a floating button above the bar.
  - **Task screens (bottom bar hidden, back arrow, one big action at the bottom):** Cut mode, Keep offcuts, Print labels and the add screens. All add screens share one pattern: a live preview card, labelled fields, "Add another" and the primary button. Add part (preview drawn to scale with banded edges; Label, Length, Width, a narrower Qty, Material through the picker sheet, Grain, Edge banding through the edge sheet); Add board (preview with price per sheet and per m², Name, Thickness, Price, Sheet / Square metre, Sheet size, Grain, system colour picker); Add edge band (strip preview with a cost example, Name, Price per metre, system colour picker); Add offcut (to-scale preview that says whether the size is reusable, Material picker, Length, Width, Grain, Storage place chips, label queue). Print labels: sticker sheet choice (three A4 formats or Custom), a grid of 44 px stickers to tap the first free one, a label preview and Show on label checkboxes, the 100% print warning, the outline test page and a bottom Print button.
  - **Cards (three tiers):** identity in 17 px bold (size and quantity, offcut code and size, material name), context in 13–15 px (label, material, place, source: the columns that were cut off), and an opened state with labelled 48 px fields and visible action buttons. Parts are collapsed by default; Quantity is a narrower field than Length and Width.
  - **Bottom sheets:** the material picker (the library's board cards; a tap selects; New material and Manage materials), Add stock sheet (from the library or a custom size), edge banding (tap the four edges, plus None / Front / Long edges / All 4), cutting settings (kerf, edge trim, units), project actions, offcut filter, share, language, delete confirmation. Board colour keeps the system colour picker and shows the hex.
  - **Results and cutting:** the Sheets tab has Labels, Sizes, Cuts and Edges as checkbox chips (independent) and zoom buttons; the Cut tab is an information list with the cut order as a segmented control and Start cutting as a floating button above the bar; Cut mode is one big number per cut with the cut highlighted on a small sheet and 60 px Back / Done buttons, ending in Keep offcuts (a card per suggested offcut, storage place, label queue).
  - **Rules:** targets at least 44 px, fields 16 px, 8 px between targets; corner radius 12 on every button, chip and field, 16 around a segmented control, 14 on cards, 20 on sheets, status badges stay pills; the Cut icon is a circular saw blade (replace `SawIcon`, also on desktop).
  - **Still to decide:** whether Projects keeps its label next to the icon, whether the Offcut library and Materials open a card by default, and whether the offcut Material field also uses the picker sheet (the design shows the field only).
- **Review fixes and polish (milestone 15):**
  - **Folder sync deletions (`merge.ts`, `workshop.ts`, `folderSync.ts`):**
    - *Problem:* `mergeById` in `merge.ts` takes the union of local and folder materials/edge bands without deletion markers, so a material or edge band deleted on one device comes right back from `pilina-library.json` on the next sync. Also, `syncNow()` in `folderSync.ts` unconditionally resets `DELETIONS` and `OFFCUT_DELETIONS` to `{}` after writing, which drops any deletion made while `f.list()` / `f.write()` was in flight, and permanently loses local offcut deletions if `pilina-offcuts.json` was temporarily unreadable (`skip(OFFCUTS_FILE)`).
    - *Solution & benefit:* Add `deleted: Record<string, number>` to `LibraryFile` (matching `OffcutsFile`), snapshot the local deletion maps at the start of `syncNow()`, and only remove keys that were processed and whose target file wasn't skipped. Deleted materials, edge bands and offcuts stay deleted reliably across cloud syncs.
  - **Hand-added offcuts without a material (`offcut.ts`):**
    - *Problem:* `matchingOffcuts` requires `o.materialId !== null`, so hand-added offcuts without a material are never used, even when the project's stock also has no material set (whereas `prep::compatible` in `pilina-core` treats `None` as compatible).
    - *Solution & benefit:* Match offcuts with `materialId === null` when the project has enabled stock with `materialId === null` (or let any material-less offcut match material-less stock), so quick projects and hand-added offcuts work together without forcing a library material first.
  - **One offcut size rule everywhere (`describe.ts`, `offcut.ts`, `SheetDrawing.tsx`, `Results.tsx`, `buildPdf.ts`, `summaryPage.ts`):**
    - *Problem:* `classifyOffcut` in `describe.ts` hardcodes `300 × 100 mm`, while Pricing (`OffcutRule`) and Cut mode (`keepAdvice`) use `settings.offcutMinLength` and `settings.offcutMinWidth`. Changing those settings leaves the sheet drawing, the Results leftovers list and the PDF disagreeing with Pricing and Cut mode on which leftovers are reusable.
    - *Solution & benefit:* Replace `classifyOffcut` with `keepAdvice` (using the workshop settings, with defaults where needed) and pass the thresholds into the drawing, Results and `PdfInput`. Every screen and export agrees on what counts as a reusable offcut.
  - **Material compatibility in `unplacedReason` (`job.ts` / `pilina-core`):**
    - *Problem:* `unplacedReason` checks whether an unplaced part fits the size and grain of *any* sheet in `job.stock`, ignoring `material`. In a multi-material project, an Oak part too large for the Oak stock (or with no Oak stock enabled) matches a larger sheet of another material and is reported as `out-of-stock` ("not enough stock sheets") instead of `too-big`.
    - *Solution & benefit:* Filter `job.stock` by material compatibility (`!part.material || !s.material || part.material === s.material`) in `unplacedReason` (or return the reason directly on `Unplaced` from `pilina-core`). Multi-material projects always show the right reason when a part can't be placed.
  - **Renumbering cuts without re-running the search (`useOptimizer.ts`, `pilina-core`, `pilina-wasm`):**
    - *Problem:* `cutOrder` is passed inside `Job.options`, changing `jobKey(job)` and triggering a full 600 ms worker search whenever the user switches between "Rips first" and "Strip by strip"—which can also produce a different layout if the wall-clock budget cuts the search after a different pass count.
    - *Solution & benefit:* Exclude `cutOrder` from the search trigger and apply `layout::order_cuts` (exposed through `pilina-wasm` or in TS) to the existing plan when `cutOrder` changes. Switching cut order becomes instant and never alters the sheet layout.
  - **Single worker and cooperative cancellation (`engine/client.ts`, `engine/worker.ts`, `pilina-wasm`):**
    - *Problem:* `client.ts` terminates and respawns the Web Worker (re-fetching and re-instantiating WASM) whenever a new edit arrives during an active `optimize()` call, and spawns a second permanent worker just for `price()` (which takes microseconds).
    - *Solution & benefit:* Run `price()` on the same worker (or on the main thread), and use a shared cancellation flag (or queued latest-job handoff with a fallback timeout) instead of killing the worker on every keystroke. Eliminates WASM cold-start overhead and halves worker memory use.
  - **Fewer allocations in the strip packer (`pack.rs`):**
    - *Problem:* Inside `pack_frame`, every `(col_w, tall_first)` lookup into `StripMemo` allocates `counts.clone()` even on a cache hit, and every new best candidate clones `sim.strip` (including all `Vec<Row>` and `Vec<RowPart>`) and `sim.counts` inside the loop instead of once for the winner. `FxHasher::write` also hashes byte slices one byte at a time.
    - *Solution & benefit:* Keep only the winning `(score, key)` during the inner candidate loop and clone `strip` and `counts` once after the loop; avoid allocating a new `Vec<u32>` on memo hits (or pre-hash `counts` once per outer strip step) and hash 8-byte chunks in `FxHasher`. Speeds up `pack_frame` on 40+ part jobs so more lookahead and shuffle passes fit in the 600 ms budget.
  - **Narrower filesystem scope in the Mac app (`desktop/capabilities/default.json`, `desktop/src/main.rs`):**
    - *Problem:* `default.json` grants static `fs:scope` access to `$HOME/**` and `/Volumes/**`.
    - *Solution & benefit:* Rely on Tauri's dialog-granted dynamic scope (or register the chosen sync folder path via a small Rust command in `desktop/src/main.rs`) instead of granting blanket access to `$HOME/**`. Keeps the WebView sandboxed to only the files and folders the user explicitly picked.
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
- **Interface languages:** 44, via i18next with English sentences as keys. Every language except English is lazy-loaded (about 11 KB gzipped each) and `startLanguage()` loads the chosen one before the first render. `src/i18n/i18n.test.ts` fails if any language lacks a key or plural form (plural forms come from `Intl.PluralRules`), has an unused or empty string, or drops or adds a `{{placeholder}}`. Arabic and Urdu set `document.dir=rtl`; the CSS uses logical properties, directional icons carry `data-flip-rtl`, and the sheet drawing is not mirrored. Inter has no glyphs for Chinese, Japanese, Korean, Thai, Hindi, Bengali, Arabic or Urdu and pdf-lib can't shape text, so PDFs in those languages are written in English (`inPrintLanguage`); user-typed labels in those scripts still won't render in a PDF. Known weak spots: Irish and Maltese counted strings use a "Label: count" style, and Bosnian is derived from Croatian. To add a language: a JSON file and one line in `languages.ts`.
- **Offline install** is checked from the build (manifest, PNG/maskable icons, every needed file precached, navigation fallback), but the built-in browser pane can't register service workers and no Chromium browser is installed here. Still to do by hand: open the production build in Safari (File → Add to Dock) or Chrome, go offline, and reload.
- **Import:** old `.md` exports, the old app's browser storage (read directly when served from the same address, otherwise pasted), and this app's `.pilina.json` (and older `.cutlist.json`) project files. Old project folders synced with "Link folder" are imported by selecting all their `.md` files.
