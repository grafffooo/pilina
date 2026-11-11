// The phone's own screens: bottom bar, Projects, add forms, sheets, and the Back button.
import { expect, test } from '@playwright/test';
import { onPhone, openApp, openPart } from './helpers';

test.beforeEach(async ({ page }) => {
  test.skip(!onPhone(), 'phone screens only');
  await openApp(page);
});

const bar = (page: import('@playwright/test').Page) =>
  page.getByRole('navigation', { name: 'Sections' });

test('the bottom bar moves between Projects and the open project', async ({ page }) => {
  await bar(page).getByRole('button', { name: 'Projects' }).click();
  await expect(page.getByRole('heading', { name: 'Pilina' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Offcut library' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'New project' })).toBeVisible();
  await page.getByRole('button', { name: 'Settings' }).click();
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
  // Back returns to Projects, and the bar still works.
  await page.goBack();
  await expect(page.getByRole('heading', { name: 'Pilina' })).toBeVisible();
  await bar(page).getByRole('button', { name: 'Parts' }).click();
  await expect(page.getByRole('textbox', { name: 'Project name' })).toBeVisible();
});

test('a part is added on its own screen; Back leaves it without adding', async ({ page }) => {
  await page.getByRole('button', { name: 'Add part' }).first().click();
  await expect(page.getByRole('heading', { name: 'Add part' })).toBeVisible();
  // Nothing to add until there is a size.
  await expect(page.getByRole('button', { name: 'Add part', exact: true })).toBeDisabled();
  await page.goBack();
  await expect(page.getByRole('heading', { name: 'Add part' })).toBeHidden();

  await page.getByRole('button', { name: 'Add part' }).first().click();
  await page.getByRole('textbox', { name: 'Label', exact: true }).fill('Door');
  await page.getByRole('textbox', { name: 'Length', exact: true }).fill('600');
  await page.getByRole('textbox', { name: 'Width', exact: true }).fill('400');
  await page.getByRole('textbox', { name: 'Qty', exact: true }).fill('2');
  await page.getByRole('button', { name: 'Add part', exact: true }).click();
  await expect(page.getByText('2 pieces · 1 row')).toBeVisible();
  await openPart(page, 'Door');
  await expect(page.getByRole('textbox', { name: 'Width, Door' })).toHaveValue('400');
});

test('the material and the edges of a part are chosen in sheets', async ({ page }) => {
  await page.getByRole('button', { name: 'Add part' }).first().click();
  await page.getByRole('textbox', { name: 'Length', exact: true }).fill('700');
  await page.getByRole('textbox', { name: 'Width', exact: true }).fill('300');

  // Material: library boards as cards; Back closes the sheet.
  await page.getByRole('button', { name: /^Material: / }).click();
  const material = page.getByRole('dialog', { name: 'Material' });
  await expect(material).toBeVisible();
  // The sheet adds its history entry a moment after it opens.
  await page.waitForTimeout(100);
  await page.goBack();
  await expect(material).toBeHidden();
  await page.getByRole('button', { name: /^Material: / }).click();
  await material.getByRole('button', { name: /Chipboard/ }).click();
  await expect(material).toBeHidden();

  // Edges: tap an edge, the summary follows.
  await page.getByRole('button', { name: /^Edge banding for/ }).click();
  const edges = page.getByRole('dialog', { name: 'Edge banding' });
  await edges.getByRole('button', { name: /Long edge 1/ }).click();
  await expect(edges.getByRole('button', { name: /Long edge 1/ })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await edges.getByRole('button', { name: 'Done' }).click();
  await expect(edges).toBeHidden();
  await page.getByRole('button', { name: 'Add part', exact: true }).click();
  await expect(page.getByText('1 piece · 1 row')).toBeVisible();
});

test('boards, edge bands and offcuts have their own add screens', async ({ page }) => {
  await bar(page).getByRole('button', { name: 'Projects' }).click();
  await page.getByRole('button', { name: 'Materials & prices' }).click();

  await page.getByRole('button', { name: 'Add board' }).first().click();
  await page.getByRole('textbox', { name: 'Board name' }).fill('Oak veneer 19mm');
  await page.getByRole('textbox', { name: 'Price', exact: true }).fill('118.5');
  await page.getByRole('button', { name: 'Add board', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Oak veneer 19mm' })).toBeVisible();

  await page.getByRole('button', { name: 'Add edge band' }).click();
  await page.getByRole('textbox', { name: 'Edge band name' }).fill('Oak 2 mm');
  await page.getByRole('button', { name: 'Add edge band', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Oak 2 mm' })).toBeVisible();

  await bar(page).getByRole('button', { name: 'Projects' }).click();
  await page.getByRole('button', { name: 'Offcut library' }).click();
  await page.getByRole('button', { name: 'Add offcut' }).click();
  await page.getByRole('textbox', { name: 'Length', exact: true }).fill('800');
  await page.getByRole('textbox', { name: 'Width', exact: true }).fill('300');
  await page.getByRole('button', { name: 'Add offcut', exact: true }).click();
  await expect(page.getByRole('button', { name: /OC-0001, 800 × 300/ })).toBeVisible();
});
