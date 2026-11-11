# Pilina 0.2.0 on a phone: audit and plan for milestone 12

Screenshots: `docs/mobile/before/pixel-7/` (412 × 915 px) and `docs/mobile/before/iphone-14/` (390 × 844 px), 24 screens each,
plus `report.json` with the measurements. Reproduce with `cd web && npm run screenshots:mobile`
(`MOBILE_PHASE=after` writes to `docs/mobile/after/` for the before/after comparison).

## What was measured

Counts per screen, Pixel 7 (iPhone 14 is within a few of these):

| Screen | Touch targets under 44 px | Inputs under 16 px (iOS zooms) | Sideways scrolling | Selects under 72 px |
|---|---|---|---|---|
| Parts / stock / costs | 45 | 16 | none | 0 |
| Sheets | 12 | 0 | none | 0 |
| Cut list, cut mode | 13 | 0 | none | 0 |
| Print labels | 36 | 0 | none | 0 |
| Drawer menu | 52 | 17 | none | 0 |
| **Offcut library** | 18 | 8 | **table 719 px in a 386 px view** | 0 |
| **Materials & prices** | 13 | 8 | **table 539 px in a 386 px view** | **2 (30 and 45 px)** |
| Statistics | 7 | 0 | none | 0 |
| Settings | 67 | 22 | none | 0 |

## Where the UI fails the user

**1. Tapping an input zooms the page.** Every text, number and select field is 13 px (`--text-sm`).
iOS Safari zooms the whole page when a field under 16 px gets focus, and doesn't zoom back. This is the "feels like a web page" problem. It hits all 16 fields in the Parts and Stock editor, the search box, and every field in Settings.
Cut mode and Sheets have no fields, so they are fine.

**2. Touch targets are desktop-sized.** The standard is 44 pt (Apple) or 48 dp (Android). Found:
- checkboxes 18 × 18, with no larger tap area;
- the number cells are 32 px high and the label cell 32 px;
- the toolbar buttons (undo, redo, share, ⋯, menu) are 32 × 32;
- the grain chip is 40 × 28 and the edge-banding box is a bare 18 px rectangle;
- the "more" button and priority star are 32 × 32;
- the "Start at sticker" cells on Print labels are 41 × 18, 24 of them in a tight grid;
- on the Sheets screen the Cuts/Sizes/Edges toggle and the zoom buttons are 28–32 px high.

The rows are packed 4 px apart, so a thumb that misses a field lands on the next one.

**3. Three screens are still desktop tables.** The Parts and Stock editors do reflow into two-line rows (a container query at 500 px in `Editor.module.css`). That part works. The reflow was never applied to:
- **Offcut library** (719 px wide): the Place column is cut off at "Rack /", and the row actions are off-screen. Nothing signals that the table scrolls, so the actions look missing.
- **Materials & prices** (539 px wide): the Grain and Per selects are 45 px and 30 px wide and show a clipped "Alc" and an arrow with no value. The Price field is empty and the "For sheet size" column is hidden.
- **Edge bands** has the same table pattern.

These are your "tables with horizontal scrolling and dropdowns a few pixels wide".

**4. It is hard to scan.**
- Everything is one size (13 px) with little weight contrast, and a project fills about three screens of identical bordered fields. You can't tell "which row am I in?" at a glance.
- Row 2 holds three unrelated controls (label, grain, edges), with the edges as an unlabelled box.
- The page title is set at 28 px while its controls are 13 px, so the screen looks top-heavy and the data looks small.
- The summary ("7 pieces · 3 rows") and the Kerf and Edge-trim chips sit in a header that wraps oddly: the chips float right of the "Parts" title with the "Add part" button, and read as part of the table.

**4b. Smaller, native-feel problems.**
- Dropdowns open the browser's own picker, but the closed state (13 px text with a chevron) looks like a desktop form.
- The Cut and Sheets tabs work, but the project menu is hidden behind a hamburger (a drawer), which is an Android habit rather than an iOS one.
- Popovers (the edge-trim popover over the table) are positioned for a mouse and cover the rows they edit.
- Hint text sits in `title=` tooltips ("Leave empty for unlimited", "Used before other sheets"), which touch users never see.
- No `touch-action`, `overscroll-behavior` or tap-highlight rules. Pull-to-refresh and rubber-banding can fight the sheet drawing and Cut mode.
- Settings and Print labels read well, but their radio and checkbox rows are 18 px controls with no larger tap area.

**5. What already works** (keep it): bottom navigation with safe-area padding, a large "Done, next cut" button and the big dimension in Cut mode, the sheet drawing and its zoom controls, number fields that ask for a decimal keyboard (`inputMode="decimal"`), and the Cuts/Sizes/Edges toggle.

## How to fix the tables, with nothing lost

One rule for every list screen: **at phone width a table row becomes a card, and a card has three tiers.** The container query approach already used for Parts and Stock extends to the rest.

1. **Tier 1, always visible, one big line** (17 px, bold): the identity of the row. For an offcut, `OC-0001 · 2070 × 1468`. For a material, `Chipboard 18mm`. For a part, `720 × 560 × 2` with its label.
2. **Tier 2, a quiet second line** (13 px, muted): material, place, source project. This is where today's cut-off columns go.
3. **Tier 3, the editing controls, one tap away.** Tap the card to expand it in place into labelled fields, one per line at 16 px, full width, 48 px tall. Row actions (use, delete, print label) live in an action row at the bottom of the expanded card, as full-size buttons with text, never as a hidden column.

Why this keeps desktop parity: every column is still reachable and editable (nothing is dropped), and the desktop layout doesn't change, since the card is the same row under a width breakpoint. Where a screen is mostly *reading* (offcut library, statistics), the collapsed card is enough. Where it is mostly *entering* (Parts, Stock), the row stays expanded so typing flows: tab, next field.

Per screen:

| Screen | Collapsed card | Expanded |
|---|---|---|
| Parts | `720 × 560` big, `× 2` qty, label under it; grain and edge icons as 44 px buttons | Length, Width, Qty on one line (three 48 px fields), then Label, Material, Grain, Edges as full-width rows |
| Stock sheets | `2800 × 2070`, material, ★ | Same fields as the desktop columns, stacked |
| Offcut library | `OC-0001 · 2070 × 1468`, material and place beneath, thumbnail on the left | Place, notes, used-state toggle, Print label, Delete as buttons |
| Materials | Name, thickness, price per unit | Grain, price unit, sheet size, colour as labelled rows (the selects get a full-width line, so they can't collapse) |
| Edge bands | Name, price per metre | Same |
| Statistics | Already single-column; enlarge the table rows, keep the charts | none |

Alternatives considered:
- *Keep horizontal scrolling with a sticky first column:* it preserves every column but hides actions and is the exact complaint, so no.
- *Hide low-value columns on phones:* easy, but it breaks parity and users lose controls, so no.
- *Separate mobile pages:* more code to keep in sync with the desktop; the card approach reuses the same row components.

## The rest of the native feel

- **No zoom:** all inputs and selects are 16 px or larger at phone width (`font-size: max(16px, …)`). Don't use `maximum-scale=1` in the viewport: it blocks pinch zoom, which is an accessibility problem. The 16 px rule alone is enough for iOS.
- **Touch targets:** at least 44 × 44 px (48 px for primary controls), with at least 8 px between neighbours. Small visual icons can keep their size by padding the hit area (`::after` or `padding`), so the look stays light. Checkbox rows get a whole-row tap area.
- **Keyboards:** `inputMode="decimal"` stays; use `inputMode="numeric"` for quantities, `enterKeyHint="next"` on the row's fields, and `autocapitalize="sentences"` on labels. The sticky bottom bar must move above the keyboard (`visualViewport` or `interactive-widget=resizes-content`).
- **Navigation:** keep the bottom tabs. Make the project menu a bottom sheet (project list, Offcuts, Materials, Statistics, Import, Settings) instead of a left drawer, since a bottom sheet is easier to reach on tall phones and matches iOS. The top bar is a back button plus title on the secondary screens.
- **Sheets and dialogs:** dialogs become bottom sheets with a grab handle at phone width. The edge-trim and kerf popovers open as sheets too, instead of covering the rows.
- **Feedback and polish:** `:active` pressed states, `-webkit-tap-highlight-color: transparent`, `touch-action: manipulation` (no 300 ms delay or double-tap zoom on controls), `overscroll-behavior: contain` on the drawing and Cut mode, `env(safe-area-inset-*)` everywhere (already used in some places), and haptics where supported (`navigator.vibrate`) on Cut mode's "Done".
- **Explain without hover:** turn `title=` tooltips into visible one-line hints under the field, or an "i" button that opens a sheet.
- **Appearance:** one type scale for phones: row title 17, body 15, hint 13, page title 22 (not 28).

## Acceptance for the milestone (to automate)

The Playwright audit (`screenshots-mobile.spec.ts`) already collects what's needed. Before the milestone is done it should show, on both phones and on every screen:
- sideways scroll: 0 px, no inner scrollers;
- touch targets under 44 px: 0 (except text links inside a paragraph);
- inputs and selects under 16 px: 0;
- selects under 72 px: 0;
- a before/after screenshot pair for every screen, committed under `docs/mobile/`.

A second check will compare a list of every desktop control (taken from the desktop DOM) against what is reachable on a phone, so parity is tested and not assumed.

## Suggested order

1. Shared base: 16 px fields, 44 px hit areas, pressed states, the type scale, no-zoom. This alone fixes the zoom and most of the target counts.
2. Cards for Offcut library, Materials and Edge bands (the three broken tables).
3. Parts and Stock editor: the row polish and the expanded editing state.
4. Bottom-sheet menu and dialogs, popovers as sheets.
5. Visible hints instead of tooltips, haptics, keyboard behaviour on a real device.
6. Re-run the audit as `after`, commit both sets, and add the zero-findings assertions to the Playwright phone project.

## Limits of this audit

It ran in Chromium with Pixel 7 and iPhone 14 viewports, touch and mobile flags. It can't show the real iOS Safari zoom-on-focus, the on-screen keyboard covering fields, or the Android and iOS system pickers. Step 5 therefore needs a check on real phones (or the iOS Simulator, which this setup can drive for Safari).
