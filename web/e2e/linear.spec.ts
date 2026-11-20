// Entering 1D linear stock & parts, optimizing bars, switching views in mixed projects, and reload persistence.
import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import {
  CABINET,
  closeDialog,
  enterParts,
  expectSheets,
  onPhone,
  openApp,
  openSettings,
  section,
  sidebar,
  waitForSaved,
} from './helpers';

interface LinearPartInput {
  length: string;
  qty?: string;
  label?: string;
}

async function enterLinearParts(page: Page, parts: LinearPartInput[]) {
  for (const [i, p] of parts.entries()) {
    const n = i + 1;
    const length = page.getByRole('textbox', { name: `Length, Part ${n}` });
    if (onPhone() && !(await length.isVisible())) {
      await page.getByRole('button', { name: 'Add part' }).first().click();
      if (p.label) await page.getByRole('textbox', { name: 'Label', exact: true }).fill(p.label);
      await page.getByRole('textbox', { name: 'Length', exact: true }).fill(p.length);
      if (p.qty) await page.getByRole('textbox', { name: 'Qty', exact: true }).fill(p.qty);
      await page.getByRole('button', { name: 'Add part', exact: true }).click();
      await expect(page.getByRole('textbox', { name: 'Length', exact: true })).toBeHidden();
      continue;
    }
    if (!(await length.isVisible())) await page.getByRole('button', { name: 'Add part' }).click();
    await length.fill(p.length);
    if (p.qty) await page.getByRole('textbox', { name: `Qty, Part ${n}` }).fill(p.qty);
    if (p.label) await page.getByRole('textbox', { name: `Label, part ${n}` }).fill(p.label);
  }
  await page.keyboard.press('Tab');
}

test.beforeEach(async ({ page }) => {
  // Printing opens the system dialog; record what the print sheet holds instead.
  await page.addInitScript(() => {
    const w = window as unknown as { __prints: string[] };
    w.__prints = [];
    window.print = () => {
      w.__prints.push(document.querySelector('.print-root')?.textContent ?? '');
    };
  });
  await openApp(page);
});

const prints = (page: Page) =>
  page.evaluate(() => (window as unknown as { __prints: string[] }).__prints);

test('starts in Sheets view with Add linear stock and builds a 1D bar cutting plan', async ({
  page,
}) => {
  await section(page, 'Parts');
  await expect(page.getByRole('heading', { name: 'Parts' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Linear parts' })).toBeHidden();

  await page.getByRole('button', { name: 'Add linear stock' }).click();
  await expect(page.getByRole('heading', { name: 'Linear parts' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Linear stock' })).toBeVisible();

  await enterLinearParts(page, [
    { length: '1200', qty: '2', label: 'Leg' },
    { length: '800', qty: '3', label: 'Rail' },
  ]);
  await expect(page.getByText('5 pieces · 2 rows')).toBeVisible();

  await section(page, 'Sheets');
  await expect(page.getByText('Bar 1 of 2').first()).toBeVisible();
  await expect(page.getByRole('img', { name: /Bar 1: .* on a 3000 mm bar/ })).toBeVisible();

  await section(page, 'Cut');
  await expect(page.getByRole('list').filter({ hasText: 'Cross cut' })).toBeVisible();
});

test('reopens linear-only projects directly in linear view after reload', async ({ page }) => {
  await page.getByRole('textbox', { name: 'Project name' }).fill('Sawhorse');
  await section(page, 'Parts');
  await page.getByRole('button', { name: 'Add linear stock' }).click();
  await enterLinearParts(page, [{ length: '1200', qty: '4', label: 'Leg' }]);
  await waitForSaved(page, 'Sawhorse');

  await page.reload();
  await expect(page.getByRole('textbox', { name: 'Project name' })).toHaveValue('Sawhorse');
  await section(page, 'Parts');
  await expect(page.getByRole('heading', { name: 'Linear parts' })).toBeVisible();
  await section(page, 'Sheets');
  await expect(page.getByText('Bars 1–2 of 2').first()).toBeVisible();
  await expect(page.getByText('cut ×2').first()).toBeVisible();
});

test('handles mixed 2D + 1D projects and explains oversized linear parts', async ({ page }) => {
  await page.getByRole('textbox', { name: 'Project name' }).fill('Workbench');
  await enterParts(page, [CABINET[0]!]);
  await expectSheets(page, 1);

  await section(page, 'Parts');
  await page.getByRole('button', { name: 'Add linear stock' }).click();
  await enterLinearParts(page, [{ length: '3500', qty: '1', label: 'Beam' }]);
  await waitForSaved(page, 'Workbench');

  await section(page, 'Sheets');
  await expect(page.getByText('1 part doesn’t fit')).toBeVisible();
  await expect(page.getByText(/Beam.*longer than every stock bar \(with end trim\)/)).toBeVisible();

  await page
    .getByRole('group', { name: 'Stock type' })
    .last()
    .getByRole('button', { name: 'Sheets' })
    .click();
  await expect(page.getByText('Sheet 1 of 1').first()).toBeVisible();

  await page.reload();
  await expect(page.getByRole('textbox', { name: 'Project name' })).toHaveValue('Workbench');
  await section(page, 'Parts');
  await page
    .getByRole('group', { name: 'Stock type' })
    .first()
    .getByRole('button', { name: 'Linear stock' })
    .click();
  await expect(page.getByRole('heading', { name: 'Linear parts' })).toBeVisible();
});

test('cut a bar, keep its tail offcut, print its QR label and reuse it', async ({ page }) => {
  await section(page, 'Parts');
  await page.getByRole('button', { name: 'Add linear stock' }).click();
  await enterLinearParts(page, [{ length: '1200', qty: '2', label: 'Leg' }]);

  await section(page, 'Sheets');
  await expect(page.getByText('Bar 1 of 1').first()).toBeVisible();

  await section(page, 'Cut');
  await page.getByRole('button', { name: 'Start cutting' }).first().click();

  const mode = page.getByRole('dialog', { name: 'Cut mode' });
  await expect(mode.getByText('Cut 1 of 2')).toBeVisible();
  await expect(mode.getByText('1200').first()).toBeVisible();
  await mode.getByRole('button', { name: 'Done, next cut' }).click();

  // Closing and reopening cut mode resumes at the next cut and tracks bar progress.
  await mode.getByRole('button', { name: 'Close cut mode' }).click();
  await section(page, 'Parts');
  await expect(page.getByText('Cutting 0 / 1').first()).toBeVisible();

  await section(page, 'Cut');
  await page.getByRole('button', { name: 'Start cutting' }).first().click();
  await expect(mode.getByText('Cut 2 of 2')).toBeVisible();
  await mode.getByRole('button', { name: 'Done, bar finished' }).click();

  // The 594 mm tail offcut is suggested and pre-checked; keep it and queue its label.
  await expect(mode.getByText('Keep any offcuts?')).toBeVisible();
  await expect(mode.getByRole('checkbox', { name: /594 mm/ })).toBeChecked();
  await mode.getByRole('button', { name: 'Keep 1 offcut' }).click();

  await expect(mode.getByText('All bars are cut')).toBeVisible();
  await expect(mode.getByText(/OC-0001/)).toBeVisible();
  await mode.getByRole('button', { name: 'Print labels' }).click();

  // Labels: 1 in the queue, prints without "× 0" width, then marks as printed.
  await page.getByRole('button', { name: 'Print 1 label' }).click();
  await expect.poll(() => prints(page)).toHaveLength(1);
  const printed = (await prints(page))[0]!;
  expect(printed).toContain('OC-0001');
  expect(printed).toContain('594 mm');
  expect(printed).not.toContain('594 × 0');
  await page.getByRole('button', { name: 'Mark as printed' }).click();
  await expect(page.getByRole('button', { name: 'Print 0 labels' })).toBeDisabled();

  // The library lists the linear offcut with its length and printed status.
  await page.getByRole('button', { name: 'Offcut library' }).first().click();
  await expect(
    page.getByRole(onPhone() ? 'button' : 'row', { name: /OC-0001.*594 mm.*Rack A.*Printed/ }),
  ).toBeVisible();

  // A new linear project automatically reuses the 594 mm offcut before full bars.
  if (onPhone()) await page.getByRole('button', { name: 'Projects' }).click();
  await page.getByRole('button', { name: 'New project' }).click();
  await section(page, 'Parts');
  await page.getByRole('button', { name: 'Add linear stock' }).click();
  await enterLinearParts(page, [{ length: '500', qty: '1', label: 'Block' }]);
  await section(page, 'Sheets');
  await expect(page.getByText(/^594 mm · OC-0001 · .* · 1 part ·/)).toBeVisible();
});

test('configures linear materials and threshold, exports mixed PDF, and records statistics', async ({
  page,
}) => {
  await openSettings(page);
  await page.getByRole('textbox', { name: 'Minimum bar leftover length' }).fill('400');
  await page.keyboard.press('Tab');
  if (onPhone()) {
    await page.getByRole('button', { name: 'Back' }).click();
    await page.getByRole('button', { name: /Materials & prices/ }).click();
  } else {
    await closeDialog(page);
    await sidebar(page, /Materials & prices/);
  }
  if (onPhone()) {
    await page.getByRole('button', { name: 'Add linear stock' }).click();
    await page.getByRole('textbox', { name: 'Linear stock name' }).fill('KVH 45x95');
    await page.getByRole('textbox', { name: 'Price', exact: true }).fill('16');
    await page.getByRole('button', { name: 'Add linear stock', exact: true }).click();
    await expect(page.getByRole('button', { name: /KVH 45x95/ })).toBeVisible();
    await page.getByRole('navigation', { name: 'Sections' }).getByRole('button', { name: 'Parts' }).click();
  } else {
    await page.getByRole('button', { name: 'Add linear stock' }).click();
    await page.getByRole('textbox', { name: 'Linear stock name' }).last().fill('KVH 45x95');
    await page.keyboard.press('Tab');
    await page.getByRole('textbox', { name: 'Price of KVH 45x95', exact: true }).fill('16');
    await page.keyboard.press('Tab');
    await page.getByRole('button', { name: 'Back to project' }).click();
  }

  await enterParts(page, [{ length: '600', width: '400', label: 'Top' }]);
  await expectSheets(page, 1);

  await section(page, 'Parts');
  await page.getByRole('button', { name: 'Add linear stock' }).click();
  await enterLinearParts(page, [{ length: '1000', qty: '1', label: 'Rail' }]);

  await section(page, 'Sheets');
  await expect(page.getByText('Bar 1 of 1').first()).toBeVisible();
  const costSection = page.getByRole('region', { name: 'Cost' });
  await expect(costSection.getByText(/KVH 45x95/)).toBeVisible();
  await expect(costSection.getByText('€16.00', { exact: true })).toBeVisible();

  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export PDF' }).first().click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/\.pdf$/);
  const bytes = await readFile(await file.path());
  expect(bytes.subarray(0, 5).toString()).toBe('%PDF-');
  expect(bytes.length).toBeGreaterThan(50_000);

  await section(page, 'Cut');
  await page.getByRole('button', { name: 'Start cutting' }).first().click();
  const mode = page.getByRole('dialog', { name: 'Cut mode' });
  await expect(mode.getByText('Cut 1 of 1')).toBeVisible();
  await mode.getByRole('button', { name: 'Done, bar finished' }).click();
  await mode.getByRole('button', { name: 'Skip' }).click();
  await expect(mode.getByText('All bars are cut')).toBeVisible();
  await mode.getByRole('button', { name: 'Close', exact: true }).click();

  await sidebar(page, /Statistics/);
  await expect(page.getByText('Bars cut')).toBeVisible();
  await expect(page.getByText('KVH 45x95').first()).toBeVisible();
});
