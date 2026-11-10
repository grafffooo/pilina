// Workshop settings and project status.
import { expect, test } from '@playwright/test';
import {
  CABINET,
  closeDialog,
  enterParts,
  expectSheets,
  openApp,
  openSettings,
  projectAction,
  section,
} from './helpers';

test.beforeEach(async ({ page }) => openApp(page));

test('inches: sizes show in inches and typed fractions are understood', async ({ page }) => {
  await enterParts(page, [{ length: '762', width: '304.8', label: 'Shelf' }]);
  await openSettings(page);
  await page.getByRole('button', { name: 'Inches' }).click();
  await closeDialog(page);

  await section(page, 'Parts');
  await expect(page.getByRole('textbox', { name: 'Length, Shelf' })).toHaveValue('30');
  await expect(page.getByRole('textbox', { name: 'Width, Shelf' })).toHaveValue('12');
  // Feet and inches, and a fraction.
  await page.getByRole('textbox', { name: 'Length, Shelf' }).fill(`2' 11 1/2"`);
  await page.getByRole('textbox', { name: 'Width, Shelf' }).fill('11 3/4');
  await page.keyboard.press('Tab');
  await expect(page.getByRole('textbox', { name: 'Length, Shelf' })).toHaveValue('35 1/2');

  // Stored in millimetres: back in mm the same part reads 901.7 × 298.45.
  await openSettings(page);
  await page.getByRole('button', { name: 'Millimetres' }).click();
  await closeDialog(page);
  await section(page, 'Parts');
  await expect(page.getByRole('textbox', { name: 'Length, Shelf' })).toHaveValue('901.7');
  await expect(page.getByRole('textbox', { name: 'Width, Shelf' })).toHaveValue('298.45');
});

test('marking a project cut locks it until it goes back to draft', async ({ page }) => {
  await enterParts(page, CABINET);
  await expectSheets(page, 1);
  // The status and the ⋯ menu sit in the editor's header (on a phone, the Parts section).
  await section(page, 'Parts');
  const name = page.getByRole('textbox', { name: 'Project name' });
  await expect(page.getByText('Draft', { exact: true }).first()).toBeVisible();

  await projectAction(page, 'Mark as cut');
  await expect(page.getByRole('note').filter({ hasText: 'The project is locked' })).toBeVisible();
  await expect(page.getByTitle(/^Cut on /).first()).toBeVisible();
  await expect(name).not.toBeEditable();
  await expect(page.getByRole('textbox', { name: 'Length, Side' })).toBeDisabled();

  await page.getByRole('button', { name: 'Edit as draft' }).click();
  await expect(page.getByRole('textbox', { name: 'Length, Side' })).toBeEnabled();
  await expect(page.getByText('The project is locked')).toHaveCount(0);
});
