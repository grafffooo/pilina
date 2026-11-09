# CutList Next: rebuild plan

A ground-up rebuild of CutList Optimizer. The existing apps (`index.html`, `CutListOptimizerApp`, `CutListOptimizerApp-i18n`) stay untouched next to this folder.

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
| Data | **Local only.** Each device keeps its own data in IndexedDB. Share by file (`.cutlist` JSON, plus `.md` the old app can read), a linked folder (Chromium desktop), the phone's share sheet, or a link/QR code holding a small project. No server. |
| Pricing | **Chosen per project:** whole sheets, or area used plus a waste %. Kept offcuts can be credited back. Edge banding is priced per metre. |
| Cut modes | **Guillotine first** (table saw / panel saw). The engine's API leaves room for a CNC nesting mode later. |
| Languages | **English, Slovak and Czech** at launch, with translations set up from day one. The other 41 come later from the old translation files. |
| Look | The design canvas: seafoam/moss accent, Inter font, orange rip cuts, red dashed cross cuts, light and dark themes. |

## Architecture

```
cutlist-next/
├─ crates/
│  ├─ cutlist-core/   Rust: data types, optimizer, pricing, statistics. Pure functions, no I/O.
│  ├─ cutlist-wasm/   wasm-bindgen wrapper → npm package the web app imports
│  ├─ cutlist-cli/    command line: optimize a project file, run benchmarks
│  └─ cutlist-ffi/    (later) UniFFI wrapper → Kotlin (Android) and Swift (iOS)
├─ web/               the PWA (TypeScript)
└─ docs/
```

### 1. Rust core (`cutlist-core`)

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
| Styling | CSS custom properties copied from the canvas tokens, plus CSS modules | Themes and accent switching come straight from the design. |
| State | Zustand | Small, simple, works well with a worker. |
| Storage | IndexedDB via Dexie, with a versioned schema and migrations | Local only, larger than localStorage, survives offline. |
| Engine | `cutlist-wasm` in a Web Worker via Comlink | Typed calls, the interface stays responsive. |
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

- **Material:** name, thickness, grain, colour, price per sheet *or* per m², currency.
- **Stock sheet:** material + size + quantity (or unlimited) + priority.
- **Edge band:** name, price per metre.
- **Project:**
  - name, kerf, trim, units, pricing mode (whole sheets / area + waste %), offcut credit on or off;
  - parts: size, quantity, label, grain, enabled, edge-band type per edge, material;
  - stock;
  - extra cost lines (for example hinges);
  - status: draft / cut.
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
| 5 | **Statistics, import, PWA, EN/SK/CS** | Installs, works offline, imports old projects |
| 6 | **Later:** AR (WebXR), native apps through UniFFI, CNC nesting, more languages | Separate plans |

Each milestone ends with tests passing and a short demo in the browser.

## Still open (not blocking)

- **Folder name** `cutlist-next` is a working title.
- **Engine speed on big jobs:** about 10 ms per greedy pass for 40 part types (≈12,000 strip simulations), so very large jobs get fewer lookahead passes within the budget. Fine for furniture; revisit if needed.
- **TypeScript types** are kept in sync with `model.rs` by hand; generating them (e.g. `ts-rs`) once the model settles.
- **End-to-end tests (Playwright)** aren't set up yet; milestone 2 was checked by unit tests (model, store with an in-memory IndexedDB) and by hand in the browser at desktop, tablet and phone sizes. Worth adding before milestone 4's cut-mode flow.
- **PDF size:** pdf-lib's font subsetting drops glyphs from the Inter TTFs, so both weights are embedded whole (~370 KB per PDF). Revisit if a fixed fontkit appears or with a different subsetter.
- **Edge bands** are chosen per part (or the project default), not per edge; the plan's "type per edge" can come later if anyone needs mixed bands on one part.
- **Cut mode positions** are measured from the sheet's left/top edge. Measuring from the edge of the piece being cut (what a panel saw fence needs) would be a useful option.
- **Label printing** was checked on screen (layout in millimetres, QR codes decode with the browser's barcode reader); a real print on sticker sheets still needs a try, using the outline test page first. Custom sticker sizes aren't in yet.
- **Scanning labels** works with a hardware scanner typing into the library search; scanning with the phone camera (BarcodeDetector) is a natural next step.
- **Interface text** is English only and written inline; it moves to i18next in milestone 5.
