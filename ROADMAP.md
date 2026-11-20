# Pilina: roadmap

**Wood first, practical on the shop floor, zero bloat.**

*Pilina* is the Slovak and Czech word for a single grain of sawdust. Pilina started as a sheet-goods cut optimizer with step-by-step sawing and QR-labeled offcut reuse (see [PLAN.md](PLAN.md) for architecture and Milestones 0–15). This roadmap charts the next five phases as Pilina expands into linear timber, transport pre-cuts, CAD-free furniture and house/garden builders, and time-bounded scrap projects — while staying 100% focused on woodworking and local-first execution.

Brand, color, typography, voice, and layout rules live in [DESIGN.md](DESIGN.md).

---

## Product North Star

Pilina is built for casual and amateur woodworkers and home DIYers building bespoke furniture or tackling house and garden woodwork — without needing CAD software or a commercial cabinet shop.

Every phase strengthens one four-stage workshop loop:

**Generate (or Match Scraps) → Optimize & Haul Home → Cut & Rescue at the Saw → Assemble Step by Step → Save Offcuts Back to the Loop**

---

## Design & Craft Guardrails

All new screens, 1D diagrams, 3D guides, and project cards follow [DESIGN.md](DESIGN.md):

- **Theme-invariant light drawing paper (`--paper`: `#f7f1e8` light / `#efe8dc` dark):** Used across every technical view — 2D sheet drawings, 1D linear bar diagrams, Store Saw Operator PDFs, and 3D exploded / IKEA-style assembly views. Crisp espresso-ink outlines (`#2a2119`) paired with real material swatch fills; never glossy 3D renders, drop-shadow illustrations, or dark-mode neon blueprints.
- **Color discipline:** Wood Brown (`--accent`, `#8a5a34`) carries all primary interactive emphasis across Generators, Build Mode, and Make Stuff. Workshop Moss (`--moss`, `#4f6b2a`) stays strictly reserved for **Start Cutting** actions and active cut-mode completion banners.
- **Iconography & typography:** Crisp `24×24` `1.8px`-stroke icons — never emoji as functional icons. Inter Variable with `font-variant-numeric: tabular-nums` on dimension cells, fence measurements, and cut lists.
- **Layout & touch posture:** Matches the existing token and component system (`12px` controls, `14px` cards, `20px` bottom sheets, `1px` `--border` `#e2d6c3` / `#3a3229`, `44px` minimum phone tap targets, `56–60px` targets in Cut Mode and Build Mode, and `16px` inputs to prevent iOS auto-zoom).
- **Local-first & offline:** Optimization, transport pre-cuts, parametric recipes, 3D assembly views, and Make Stuff scrap matching run locally in the browser and Tauri desktop app with no account or server.

---

## Phase Overview & Dependency Map

```text
Existing Pilina Foundation (Milestones 0–15 in PLAN.md)
  (Open Milestones 13 & 15 can land before Phase 1 or between phases)
  │
  ├─► Phase 1 (Milestone 16): Core 1D Linear Stock & Unified Offcut Loop
  │     • Unified 2D + 1D schema (SCHEMA_VERSION = 4), materials, QR offcuts
  │     • Rust 1D optimizer (kerf, rough-end trim, 1D offcuts reused first)
  │     • 1D bar diagram SVG, 1D Cut Mode, mixed 2D+1D totals & PDF
  │
  ├─► Phase 2 (Milestone 17): Shop-Floor Safety Nets & Advanced 1D Woodcraft
  │     • Transport Pre-Cut (Car trunk / Pass-through / Trailer · prívesný vozík)
  │       + dedicated Store Saw Operator A4 PDF (works for both 2D & 1D)
  │     • "Oops, I Miscut This Part!" Rescue inside Cut Mode (2D & 1D)
  │     • Advanced 1D: mitre angles + tip-to-tip nesting, knot skip zones, glue-ups
  │     • Finish / Paint / Oil Area Calculator + Wood Sanity Nudges v1
  │
  ├─► Phase 3 (Milestone 18): Parametric Recipe Engine, 3D Build Guide & Furniture
  │     • Unified Parametric Wood Recipe engine (powering Phases 3, 4 & 5)
  │     • Interactive 3D Exploded View + Step-by-Step IKEA-Style Build Mode (+ PDF)
  │     • Indoor Furniture Generators: Cabinet w/ Drawers, Bookshelf, Alcove, Slat Wall
  │     • Live Shelf Sag Warnings + contextual Wood Sanity Nudges v2
  │
  ├─► Phase 4 (Milestone 19): House & Garden Wood Generators (1D + 2D Pack)
  │     • Skirting (soklové lišty), Terrace (terasa), Raised Beds (vyvýšené záhony),
  │       Fences & Privacy Screens, Outdoor Benches & Chairs, Garden/Tool Sheds
  │
  └─► Phase 5 (Milestone 20): "Make Stuff" — Time-Bounded Scrap Proposer
        • Quick (≤ 1h) / Half Day (2–4h) / Weekend (1–2d) matcher across 2D + 1D offcuts
        • Auto-scales recipes to saved scraps + offcut-colored 3D previews → 1-tap start
```

**Why 1D comes before Transport Pre-Cut & Miscut Rescue (Lean 1D First):**
Unifying the data model once (`SCHEMA_VERSION = 4`) lets Transport Pre-Cut, Store Saw Operator PDF, Miscut Rescue, and Finish Area be built a single time for both sheet goods and linear timber instead of building them for 2D first and reworking every layer later. Deferring mitre nesting, knot skip zones, and glue-ups to Phase 2 keeps Phase 1 focused and shippable.

---

## Detailed Phase Breakdown

### Phase 1 (Milestone 16) — Core 1D Linear Stock & Unified Offcut Loop

Brings lumber, battens, KVH timber, trim, and solid boards into Pilina alongside sheet goods under a single material and offcut system.

- **Unified schema & storage (`SCHEMA_VERSION = 4`):**
  - Extend `Material` in `web/src/model/library.ts` with `kind: 'sheet' | 'linear'` (migrating all existing materials safely as `'sheet'`), linear profile dimensions (`width × thickness`), and `priceUnit` options `'piece' | 'metre'` (or per foot in imperial units).
  - Add `Settings.linearOffcutMinLength` (default `300 mm`) for keepable timber offcuts alongside `offcutMinLength` / `offcutMinWidth`, and `Project.linearEndTrim` (default `0 mm`) for rough lumber ends.
  - Extend `Offcut` (`web/src/model/offcut.ts`) so linear remnants share the same `OC-xxxx` IDs, storage locations (`Rack A`, `Bin 1`), camera QR scanning, and A4 sticker label sheets (`OC-0042 · 1180 mm · 40×60 Oak`).
  - Preserve full backwards compatibility for `.pilina.json`, `.cutlist.json`, `.md` imports, folder sync, and share links.
- **Rust 1D optimizer (`crates/pilina-core/src/linear.rs`, exposed via `pilina-wasm` and `pilina-cli`):**
  - Deterministic 1D bin-packing optimizer supporting blade kerf, rough-end trim on both ends of raw lumber, and priority reuse of matching 1D offcuts before allocating fresh full lengths.
- **Mixed projects, Results & Cut Mode:**
  - Blank projects start cleanly in **Sheets view** with a quiet **"+ Add linear stock"** action, opening the linear parts and stock editor when needed; a single project can mix 2D sheet goods and 1D linear stock (e.g., `18 mm Birch Ply` carcasses and `40 × 60 mm Oak` legs) with unified cost breakdown, workshop statistics, and Project PDF export.
  - Scaled 1D bar diagram SVG rendered on `--paper` showing stop-block lengths, cuts, and keepable offcuts.
  - 1D Cut Mode walking through cuts with stop-block measurements from the last cut edge, feeding directly into 1D Keep Offcuts.
  - Full desktop table + `44px` mobile card editors/sheets and localization coverage across supported languages.

**Done when:** One project mixes sheet goods and linear stock (`18 mm Birch Ply` + `40 × 60 mm Oak`), optimizes both, walks through 1D Cut Mode, prints QR stickers for leftover timber sticks, and automatically reuses those saved sticks on the next project.

---

### Phase 2 (Milestone 17) — Shop-Floor Safety Nets & Advanced 1D Woodcraft

Solves the real-world bottlenecks between the store counter, the saw, and the finishing bench — across both 2D sheets and 1D timber.

- **Transport Profiles & Pre-Cut Mode (2D + 1D):**
  - Saved vehicle presets in Workshop Settings: **Car trunk** (`L × W`), optional **Car + long pass-through** (`L × W` for folded rear seats / ski hatch), and optional **Trailer (`prívesný vozík`)** (`L × W`).
  - Per-project *"Fit in vehicle"* toggle with configurable store panel-saw kerf (e.g., `4–5 mm`).
  - Engine (`crates/pilina-core/src/search.rs`, `pack.rs`, `linear.rs`) calculates 1–3 safe breakdown cuts (constraining primary guillotine cuts when needed) so every resulting sub-sheet and beam length fits the selected vehicle or trailer, and warns immediately before the store trip if any single finished part exceeds cargo limits.
  - High-contrast mobile **"Store Saw Card"** for holding up at the saw counter, plus a **dedicated single-purpose "Store Saw Operator" A4 PDF** (`web/src/pdf/`) listing only the rough breakdown cuts, store kerf, orientation, and resulting piece sizes (also suitable for hardware-store click-and-collect cutting orders, with zero home-cut clutter).
  - Home Cut Mode picks up directly from the pre-cut sub-sheets and sub-lengths.
- **"Oops, I Miscut This Part!" Rescue (2D + 1D):**
  - In-session action inside `CutMode.tsx` to flag any cut part as miscut.
  - Immediately checks **(1)** unused leftover zones on the current or remaining sheets/sticks in the active plan, then **(2)** matching available pieces in the Offcut Library, and proposes an instant rescue cut (or clearly informs the woodworker that 1 extra board/stick is needed).
- **Advanced 1D Woodcraft:**
  - **Mitre / bevel end angles** (`90°`, `45°`, `22.5°`, custom) with opposing-angle tip-to-tip nesting to save stock length, plus clear angle and bevel-direction readouts in Cut Mode.
  - **Optional knot / defect skip zones** per stock board (`[start, end]` intervals) so the 1D optimizer routes parts cleanly around splits or dead knots.
  - **Solid-Wood Panel Glue-Up helper:** enter target tabletop or tread dimensions (`L × W`) and narrow board stock → calculates strip count, jointing/planing allowance, and alternating growth-ring notes, then feeds the strips straight into the 1D optimizer.
- **Finish / Paint / Oil Area Calculator + Wood Sanity Nudges v1:**
  - Computes exposed surface area (`m²` / `ft²`) across 2D faces (respecting edge-banded vs. exposed edges) and all four faces of 1D stock × coat count + tin coverage rate, with an optional finish cost line in Results and the PDF.
  - Calm, plain-spoken wood sanity nudges on entered parts (e.g., horizontal shelf-sag warning, wide solid-panel seasonal movement reminder).

**Done when:** You can export a clean 1-page Store Saw Operator PDF tailored to your car or `prívesný vozík`, rescue a miscut 2D or 1D part mid-session in Cut Mode, optimize mitered or knot-avoiding timber, and see accurate oil/paint quantities and basic wood sanity nudges.

---

### Phase 3 (Milestone 18) — Parametric Wood Recipe Engine, 3D IKEA-Style Build Guide & Indoor Furniture Generators

Eliminates CAD for casual woodworkers and amateurs building bespoke indoor furniture, while laying the single recipe foundation used by Phases 4 and 5.

- **Unified Parametric Wood Recipe Engine (`web/src/recipes/`):**
  - Typed recipe schema defining bounded user parameters/sliders (with safe min/max limits), part formulas emitting standard 2D + 1D Pilina parts (with grain direction, edge banding, and mitre angles), 3D placement coordinates, ordered assembly steps, active time formulas, and recipe-specific sanity checks.
- **Interactive 3D Exploded View & Step-by-Step IKEA-Style Build Mode:**
  - Lightweight Three.js (`react-three-fiber`) viewer styled cleanly on `--paper` with crisp espresso-ink edge lines and each material's real swatch color (matching technical blueprint clarity, never glossy studio renders).
  - Toggle smoothly between **Assembled** and **Exploded** views; tap any piece to inspect its dimensions, label, grain, and banded edges.
  - **Build Mode** (workbench companion to Cut Mode): walks Step 1 → Step *N*, muting already-assembled pieces and highlighting only the current step's parts sliding into position, with `56–60px` phone controls.
  - **Printable IKEA-style assembly pages** appended cleanly to the Project PDF.
- **Launch Generators (Indoor Bespoke Furniture):**
  1. **Cabinet / Carcass:** overlay or inset doors, adjustable/fixed shelves, optional **drawers** with slide clearance presets (e.g., `12.7 mm` ball-bearing slides or concealed-runner presets), plinth or legs, and grooved vs. flush-nailed back panel options.
  2. **Bookshelf / Open Shelving:** with live visual **Shelf Sag Warning** highlighting overloaded spans directly in the preview and nudging toward thicker stock or a stiffener cleat.
  3. **Crooked-Wall / Alcove Scribe Helper:** capture top, middle, and bottom wall measurements → automatically sizes a plumb inner carcass plus oversized scribe filler strips.
  4. **Acoustic Slat Wall:** wall width/height, slat profile, and gap → emits 1D slat cuts, 2D backing panels, and exact spacer block dimensions.
- **Contextual Wood Sanity Nudges v2:**
  - Recipe-aware guidance integrated cleanly into parameter panels (live shelf-sag deflection checks, back-panel squaring/grooving prompts, drawer-runner clearance checks, and solid-wood movement reminders).

**Done when:** A first-time woodworker configures a multi-drawer cabinet or alcove bookshelf with zero CAD skills, gets live shelf-sag and wood nudges, cuts it in Cut Mode, and follows the in-app and PDF IKEA-style 3D step-by-step guide to assemble it.

---

### Phase 4 (Milestone 19) — House & Garden Wood Generators (1D + 2D Pack)

Rapidly expands Pilina's parametric generator catalog for common homeowner renovation and garden builds using the Phase 1–3 1D engine and Recipe Engine:

- **Skirting / Baseboards (`soklové lišty`):** enter room wall lengths plus inside/outside `45°` corners → outputs strip count and mitered 1D cut list.
- **Wooden Terrace / Decking (`terasa`):** rectangle or L-shape layout, board width and expansion gap, stagger rule, automatic row-cutoff reuse, and KVH substructure framing.
- **Raised Garden Beds (`vyvýšené záhony`):** customizable length, width, board tiers, and corner posts.
- **Fences & Privacy Screens:** bay width, post spacing, slat width, and gap.
- **Simple 1D Outdoor Benches & Chairs:** clean timber furniture recipes with full 3D exploded views and IKEA-style assembly steps.
- **Garden / Tool / Firewood Sheds:** modular timber framing and cladding cut lists.

**Done when:** Every house and garden generator produces complete 1D + 2D cut plans, transport pre-cuts, and step-by-step 3D assembly guides in minutes.

---

### Phase 5 (Milestone 20) — "Make Stuff" — Time-Bounded Scrap Proposer

Turns saved 2D and 1D offcuts from leaning against a wall into finished weekend projects matched to your clock and your real scrap rack.

- **Unified Create Flow:**
  - Keep project creation straightforward with three clear entry points:
    1. **Blank Cut List** — classic Pilina manual parts entry
    2. **Generators** — *"I know what I want to build"* (Phases 3 & 4)
    3. **Make Stuff** — *"I have X hours and a rack of scraps — propose something"*
- **Curated Starter Recipe Pack (~15–20 recipes across time tiers):**
  - **Quick (up to 1 hour):** floating shelf, entryway key/mail tray, monitor riser, laptop/phone stand, French cleat tool holder, sandpaper/clamp rack, hardwood-scrap coasters and serving board, step stool, simple herb planter.
  - **Half Day (2–4 hours):** spice rack, bedside caddy/nightstand, entryway shoe bench, desktop drawer box, picture-frame set (alongside medium Phase 4 builds like raised beds and outdoor benches).
  - **Weekend (1–2 days):** pulls in Phase 3 & 4 bespoke cabinets, bookcases, acoustic slat walls, terraces, outdoor chairs, and sheds.
- **Time-Bounded & Offcut-Aware Matching Engine:**
  - Choose a time tier (**Quick**, **Half Day**, **Weekend**), optional category (**All**, **Home**, **Workshop**, **Garden**, **Gift**), and budget rule (**My scraps only** vs. **OK to buy 1 board**).
  - Solver scans your available 2D + 1D Offcut Library, **auto-fits parametric recipe bounds** to match the exact dimensions of your saved scraps, separates **active shop time** from glue/finish drying wait, and ranks **3–5 varied proposal cards** (preferring 100% scrap coverage and clearing long-sitting offcuts, with a **Shuffle** option and quick size tweak).
  - Each card displays a clean 3D preview on `--paper` rendered in the **actual material swatch color of your matched offcuts**, lists the `OC-xxxx` pieces used, and launches a ready-to-cut + IKEA-build-ready Pilina project in one tap.

**Done when:** Picking "Half Day" and "My scraps only" proposes concrete, auto-fitted wood builds matched to real 2D and 1D offcuts in your library and creates a ready-to-cut project in a single tap.

---

## Scope Boundaries: Parked vs. Cut

Keeping Pilina disciplined prevents bloat and protects speed on the shop floor.

### Parked for Later (V2+ Horizon)
- **Community Recipe Catalog ("Offcut Pinterest"):** shareable `.pilina-recipe` format or open static catalog plugging directly into *Make Stuff*.
- **Weight & Load Estimator:** sheet weight, transport sub-sheet weight, and finished build weight (once optional density is added to Materials).
- **Auto-Generated Hardware & Fastener BOM:** automatic hinge, runner, shelf-pin, and screw lists for generated cabinets.
- **Room Batching:** combining parts from multiple projects in the same room into a shared cut plan.
- **Beginner Drilling Assistant:** hinge-cup, shelf-pin, and handle hole layouts.
- **Infrastructure tracks already scoped in [PLAN.md](PLAN.md):** public share-link hosting and cloud Drive/OneDrive sync (Milestone 11 / 14 follow-up), Windows/Linux/Android packaging (Milestone 13), review fixes and polish (Milestone 15), and AR cut-line projection.

### Intentionally Out of Scope (Cut)
- **CO2 / diode laser cutter workflows** and kerf-compensated SVG/DXF exports.
- **3D printing workflows** (STL/3MF jigs, brackets, or dust-port adapters).
- **Printed cut-part sticker labels:** marking part names with a carpenter's pencil on freshly cut timber or panels is faster at the bench; A4 QR stickers stay focused on reusable offcuts.
