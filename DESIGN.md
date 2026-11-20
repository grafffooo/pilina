---
name: "Pilina"
category: Brands
surface: web
colors:
  workshop-paper: "#f4eee4"
  birch-card: "#fbf8f2"
  espresso-ink: "#2a2119"
  warm-walnut: "#574a3c"
  sanded-edge: "#e2d6c3"
  wood-brown: "#8a5a34"
  workshop-moss: "#4f6b2a"
---

# Pilina

> Category: Brands

> Surface: web

*Cut plans, step-by-step sawing, and automatic offcut management for sheet-goods workshops.*

Pilina is a local-first woodworking and sheet-goods cut optimizer (pilina means a single grain of sawdust in Slovak and Czech). It plans guillotine cuts for plywood, MDF, melamine, and veneered boards, guides woodworkers step by step at the saw with fence measurements, labels usable leftovers with printable A4 QR stickers, and automatically prioritizes saved offcuts on future projects.

## Color Palette

| Role | Name | Hex | Usage |
| --- | --- | --- | --- |
| background | Workshop Paper | `#f4eee4` | Primary light-mode page canvas (--bg). Dark mode switches to Charcoal Espresso (#1a1612). |
| surface | Birch Card | `#fbf8f2` | Elevated cards, dialogs, bottom sheets, form fields, and control surfaces (--surface). Nested secondary surfaces use #f7f1e8 (--surface-2) and the desktop sidebar uses #ece3d4 (--side). |
| foreground | Espresso Ink | `#2a2119` | Primary headings, body copy, part labels, and numerical measurements (--text). 14.90:1 contrast on Birch Card. |
| muted | Warm Walnut | `#574a3c` | Secondary text, form labels, and inactive icons (--text-2; 8.09:1 on surface). Tertiary metadata, table headers, and timestamps use #6e5f4e (--text-3; 5.81:1 on surface). |
| border | Sanded Edge | `#e2d6c3` | 1px hairline dividers, card outlines, input frames, and table rules (--border). Dark mode uses #3a3229. |
| accent | Wood Brown | `#8a5a34` | Primary interactive accent (--accent) for selection, focus rings, primary buttons, checkboxes, and progress bars. Pair with #ffffff (--on-accent; 5.85:1), #f1e3d1 (--accent-soft), and #6b4426 (--accent-ink; 6.71:1). Dark mode shifts to #d9a672 with #1a1612 ink. |
| accent-secondary | Workshop Moss | `#4f6b2a` | Reserved exclusively for the Start Cutting call-to-action button and the active cut-mode completion banner (--moss with #ffffff text; 6.05:1). Dark mode shifts to #b5cf7a with #1a1612 ink. Never dilute moss onto ordinary links or secondary buttons. |

## Typography
- **Display:** Inter Variable — weights 400, 500, 600, 700, 800 — fallbacks: Inter, system-ui, -apple-system, Segoe UI, Roboto, sans-serif
- **Body:** Inter Variable — weights 400, 500, 600, 700 — fallbacks: Inter, system-ui, -apple-system, Segoe UI, Roboto, sans-serif

## Voice & Tone

- **Adjectives:** Practical, Workshop-literate, Plain-spoken, Precise, Calm
- **Tone:** Direct, sawdust-real craft language written for woodworkers standing at a track saw, table saw, or workbench. Leads with exact measurements, physical next steps, and honest costs rather than marketing hype or abstract SaaS jargon.

### Messaging pillars
- Close the workshop offcut loop: capture usable leftovers in one tap, label them with A4 QR stickers, and automatically reuse them before buying new boards.
- Saw-side clarity: real fence and stop-block measurements from the last cut edge, with Rips-first or Strip-by-strip modes and large glove-ready targets.
- Honest sheet-goods costing: price whole sheets, used area, or sheets minus credit for kept offcuts alongside edge banding and hardware extras.
- Local-first and private: deterministic Rust/WASM engine running offline as a PWA, native desktop app, or self-hosted workshop container across 41 languages.

### Vocabulary
- **Use:** rip cut, cross cut, offcut, fence measurement, kerf, edge banding, grain direction, sheet goods, strip by strip, rips first, trim to size, rack / bin location
- **Avoid:** AI-powered, synergy, enterprise workflow, cloud-native magic, hyper-optimized, seamless ecosystem

## Imagery

- **Style:** Precision architectural SVG sheet-cutting blueprints rendered on warm workshop paper (#f7f1e8 light / #efe8dc dark) alongside authentic UI screenshots and crisp 24x24 1.8px stroke icons.
- **Subjects:** Scaled millimetre/inch guillotine sheet layouts with hatched waste zones and numbered rip/cross cuts, Edge-banding glyphs showing L1/L2/W1/W2 banded sides, A4 QR sticker label sheets (e.g., 3x8 70x37 mm) with partly-used sheet offset picker, Step-by-step Cut Mode strip focus overlays and workshop utilization charts
- **Treatment:** Theme-invariant light drawing paper so orange rip lines (#dd6b0b), crimson dashed cross cuts (#b42318), muted pastel part fills, and espresso ink labels stay legible even in Dark Mode. Never apply glossy gradients, drop-shadow photos, or stock illustrations.
- **Avoid:** Stock photography of generic carpenters or sunlit studios, Dark-mode inverted blueprints with neon cut lines, Hand-drawn decorative SVG scenes or emoji as functional icons, Purple or multi-color SaaS gradients

## Layout

- **Radius:** 12px controls, 14px cards, 20px bottom sheets, 8px compact cells, 999px pills
- **Border weight:** 1px
- **Spacing:** 4px/8px tactile rhythm with 16px-24px panel gutters, 248px sticky desktop sidebar, and 44px minimum phone tap targets (56px-60px in Cut Mode)

### Posture rules
- Desktop uses a 3-column flow: 248px sticky sidebar (--side), flexible parts/stock editor (1 1 580px), and live sheet-results column (1.15 1 560px); stacks results below editor under 1100px.
- Phone (<768px) switches to single-column cards (14px radius, 76px min row height), a 64px fixed BottomBar with 4 tabs, 44px minimum tap targets, and 16px inputs to prevent iOS auto-zoom.
- Numbers use font-variant-numeric: tabular-nums globally (except oversized KPI stat tiles which use proportional-nums) and right-aligned dimension cells.
- Sheet diagrams always render on light paper (--paper) in both Light and Dark themes so cut lines, part swatches, and edge-banding marks remain unambiguous at the saw.
- Reserve Workshop Moss (--moss) strictly for Start Cutting actions and the cut-completion banner; use Wood Brown (--accent) for all other primary interactive emphasis.
- Component kit covers: Sidebar, ProjectHeader, StatusBadge, PartsTable/PartCards, StockTable, OffcutCard, SheetDrawing, CutMode, PricingCard/CostCard, BottomBar, BottomSheet, Dialogs, SegmentedControl, ComboInput, and RowCard.
