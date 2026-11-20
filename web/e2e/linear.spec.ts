// Entering 1D linear stock & parts, optimizing bars, switching views in mixed projects, and reload persistence.
import { expect, test, type Page } from '@playwright/test';
import {
  CABINET,
  enterParts,
  expectSheets,
  onPhone,
  openApp,
  section,
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

test.beforeEach(async ({ page }) => openApp(page));

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
