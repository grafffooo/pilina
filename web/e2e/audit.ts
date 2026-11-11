// The phone audit's walk through every main screen, shared by the screenshot script
// (screenshots-mobile.spec.ts) and the test that fails on findings (mobile-audit.spec.ts).
import { expect, type Page } from '@playwright/test';
import { CABINET, openApp } from './helpers';

export interface Finding {
  screen: string;
  overflowX: number; // px the page is wider than the viewport
  scrollers: string[]; // inner areas that scroll sideways
  small: { what: string; w: number; h: number }[]; // touch targets under 44 × 44 px
  zoomInputs: { what: string; fontPx: number }[]; // inputs under 16 px: iOS zooms the page on focus
  tinySelects: { what: string; w: number }[]; // selects under 72 px wide
  clipped: { what: string; w: number }[]; // text inputs under 48 px wide
}

/** Measures the screen as it is now. Runs inside the page. */
export function measure(): Omit<Finding, 'screen'> {
  const name = (el: Element) => {
    const h = el as HTMLElement;
    const text = (h.getAttribute('aria-label') ?? h.title ?? h.textContent ?? '').trim();
    return `${el.tagName.toLowerCase()}${text ? ` “${text.slice(0, 40)}”` : ''}`;
  };
  const visible = (el: Element) => {
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    return (
      r.width > 0 &&
      r.height > 0 &&
      s.visibility !== 'hidden' &&
      s.display !== 'none' &&
      r.bottom > 0 &&
      r.top < innerHeight
    );
  };
  const all = [...document.querySelectorAll('*')];
  const scrollers = all
    .filter((el) => {
      const s = getComputedStyle(el);
      return /auto|scroll/.test(s.overflowX) && el.scrollWidth > el.clientWidth + 2 && visible(el);
    })
    .map((el) => `${name(el)} (${el.scrollWidth} px of ${el.clientWidth})`);

  const targets = [
    ...document.querySelectorAll(
      'button, a[href], input, select, textarea, summary, [role="button"], [role="checkbox"], [role="tab"], [role="switch"]',
    ),
  ].filter(visible);
  const small = targets
    .map((el) => {
      // A checkbox or radio is tapped through its label; measure the label when there is one.
      const box = (el.closest('label') ?? el).getBoundingClientRect();
      return { what: name(el), w: Math.round(box.width), h: Math.round(box.height) };
    })
    .filter((t) => t.w < 44 || t.h < 44);
  const fields = targets.filter((el) => /^(INPUT|SELECT|TEXTAREA)$/.test(el.tagName));
  const zoomInputs = fields
    .filter((el) => !/checkbox|radio|range/.test((el as HTMLInputElement).type))
    .map((el) => ({ what: name(el), fontPx: parseFloat(getComputedStyle(el).fontSize) }))
    .filter((f) => f.fontPx < 16);
  const tinySelects = fields
    .filter((el) => el.tagName === 'SELECT')
    .map((el) => ({ what: name(el), w: Math.round(el.getBoundingClientRect().width) }))
    .filter((s) => s.w < 72);
  const clipped = fields
    .filter(
      (el) => el.tagName === 'INPUT' && /text|number|search/.test((el as HTMLInputElement).type),
    )
    .map((el) => ({ what: name(el), w: Math.round(el.getBoundingClientRect().width) }))
    .filter((s) => s.w < 48);
  return {
    overflowX: Math.max(0, document.documentElement.scrollWidth - innerWidth),
    scrollers,
    small,
    zoomInputs,
    tinySelects,
    clipped,
  };
}

/** Opens every main screen in turn and calls `shot(name)` on each. */
export async function walkScreens(page: Page, shot: (screen: string) => Promise<void>) {
  const tab = (name: 'Parts' | 'Sheets' | 'Cut') =>
    page.getByRole('navigation', { name: 'Sections' }).getByRole('button', { name }).click();
  const bring = async (text: string) => {
    await page.getByText(text, { exact: true }).first().scrollIntoViewIfNeeded();
  };
  const menu = async (item: string | RegExp) => {
    await page.getByRole('button', { name: 'Projects' }).first().click();
    await page.getByRole('button', { name: item }).first().click({ force: true });
  };

  await page.addInitScript(() => {
    localStorage.setItem('cutlist.language', 'en');
    localStorage.setItem('cutlist.appearance', JSON.stringify({ theme: 'light' }));
  });
  await openApp(page);

  // — Editor —
  await shot('parts-empty');
  for (const [i, p] of CABINET.entries()) {
    if (i === 0) {
      // The first, blank card is open: type into it.
      await page.getByRole('textbox', { name: 'Length, Part 1' }).fill(p.length);
      await page.getByRole('textbox', { name: 'Width, Part 1' }).fill(p.width);
      await page.getByRole('textbox', { name: 'Qty, Part 1' }).fill(p.qty ?? '1');
      await page.getByRole('textbox', { name: 'Label, part 1' }).fill(p.label ?? '');
      continue;
    }
    // The others have their own screen.
    await page.getByRole('button', { name: 'Add part' }).first().click();
    if (i === 1) {
      await page.getByRole('textbox', { name: 'Length', exact: true }).fill(p.length);
      await shot('add-part');
      await page.getByRole('button', { name: /^Edge banding for/ }).click();
      await page.waitForTimeout(300);
      await shot('edge-sheet');
      await page.getByRole('button', { name: 'Done' }).click();
      await page.getByRole('button', { name: /^Material: / }).click();
      await page.waitForTimeout(300);
      await shot('material-sheet');
      await page.keyboard.press('Escape');
    }
    await page.getByRole('textbox', { name: 'Label', exact: true }).fill(p.label ?? '');
    await page.getByRole('textbox', { name: 'Length', exact: true }).fill(p.length);
    await page.getByRole('textbox', { name: 'Width', exact: true }).fill(p.width);
    await page.getByRole('textbox', { name: 'Qty', exact: true }).fill(p.qty ?? '1');
    await page.getByRole('button', { name: 'Add part', exact: true }).click();
    await expect(page.getByRole('textbox', { name: 'Length', exact: true })).toBeHidden();
  }
  await page.keyboard.press('Tab');
  await page.getByRole('textbox', { name: 'Project name' }).fill('Pantry shelving');
  await page.keyboard.press('Tab');
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await shot('parts-filled');
  await bring('Stock sheets');
  await shot('stock-sheets');
  await bring('Costs');
  await shot('costs');

  // Parts: the “more” row menu, grain, edges.
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.getByRole('textbox', { name: 'Project name' }).scrollIntoViewIfNeeded();
  const more = page.getByRole('button', { name: /^More/ }).first();
  if (await more.isVisible().catch(() => false)) {
    await more.click();
    await shot('parts-row-menu');
    await page.keyboard.press('Escape');
  }
  const edges = page.getByRole('button', { name: /edge/i }).first();
  if (await edges.isVisible().catch(() => false)) {
    await edges.click();
    await shot('edge-picker');
    await page.keyboard.press('Escape');
  }
  // A focused input, to see what the browser does on focus.
  await page.getByRole('button', { name: /×/, expanded: false }).first().click();
  await page
    .getByRole('textbox', { name: /^Length, / })
    .first()
    .focus();
  await shot('input-focused');
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());

  // Project header: share, undo, status.
  await page.getByRole('button', { name: 'Share', exact: true }).click();
  await shot('share');
  await page.keyboard.press('Escape');

  // Sheets of the Parts tab: cutting settings, adding a stock sheet, the project actions.
  await page.getByRole('button', { name: /^Kerf/ }).click();
  await shot('cutting-settings');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Add sheet' }).click();
  await shot('add-sheet-sheet');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Project actions' }).click();
  await shot('actions-sheet');
  await page.keyboard.press('Escape');

  // — Results —
  await tab('Sheets');
  await expect(page.getByText(/Sheet 1 of/).first()).toBeVisible();
  await shot('sheets');
  await page.evaluate(() =>
    document.querySelectorAll('*').forEach((e) => {
      if (e.scrollHeight > e.clientHeight + 40 && /auto|scroll/.test(getComputedStyle(e).overflowY))
        e.scrollTop = e.scrollHeight;
    }),
  );
  await shot('sheets-scrolled');
  await tab('Cut');
  await shot('cut-list');

  // — Cut mode —
  await page.getByRole('button', { name: 'Start cutting' }).first().click();
  const mode = page.getByRole('dialog', { name: 'Cut mode' });
  await expect(mode.getByText(/Cut 1 of/)).toBeVisible();
  await shot('cut-mode');
  const next = mode.getByRole('button', { name: 'Done, next cut' });
  await next.click();
  await next.click();
  await shot('cut-mode-strip');
  while (await next.isVisible()) await next.click();
  await mode.getByRole('button', { name: 'Done, sheet finished' }).click();
  await shot('cut-mode-keep-offcuts');
  await mode.getByRole('button', { name: /^Keep \d+ offcuts?/ }).click();
  await shot('cut-mode-done');
  await mode.getByRole('button', { name: 'Print labels' }).click();
  await shot('labels');

  // — Other screens through the menu —
  await page.goto('/');
  await expect(page.getByRole('textbox', { name: 'Project name' })).toBeVisible();
  await page.getByRole('button', { name: 'Projects' }).first().click();
  await shot('menu');
  await page.getByRole('button', { name: /Cut projects/ }).click();
  await shot('cut-projects');
  await page.goBack();
  await page.getByRole('button', { name: /Offcut library/ }).click();
  await shot('offcut-library');
  await page.getByRole('button', { name: 'Filters' }).click();
  await shot('filters-sheet');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Add offcut' }).click();
  await shot('add-offcut');
  await page.goBack();
  await menu(/Materials & prices/);
  await shot('materials');
  await page.getByRole('button', { name: 'Add board' }).first().click();
  await shot('add-board');
  await page.goBack();
  await page.getByRole('button', { name: 'Add edge band' }).click();
  await shot('add-edge-band');
  await page.goBack();
  await menu(/Statistics/);
  await shot('statistics');
  await menu(/Import projects/);
  await shot('import');
  await page.keyboard.press('Escape');
  await page.goto('/');
  await expect(page.getByRole('textbox', { name: 'Project name' })).toBeVisible();
  await page.getByRole('button', { name: 'Projects' }).first().click();
  await page.getByRole('button', { name: 'Settings' }).first().click();
  await shot('settings');
  await settleScroll(page);
  await shot('settings-end');
}

/** Scrolls whatever is scrolling to the bottom. */
async function settleScroll(page: Page) {
  await page.evaluate(() =>
    document.querySelectorAll('*').forEach((e) => {
      if (e.scrollHeight > e.clientHeight + 40 && /auto|scroll/.test(getComputedStyle(e).overflowY))
        e.scrollTop = e.scrollHeight;
    }),
  );
}
