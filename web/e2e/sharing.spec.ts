// Moving projects between devices and apps: project files, the old app's .md, links.
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import {
  CABINET,
  enterParts,
  expectSheets,
  openApp,
  otherDevice,
  section,
  sidebar,
} from './helpers';

const OLD_MD = fileURLToPath(new URL('./fixtures/skrinky-do-dielne.md', import.meta.url));

test.beforeEach(async ({ page }) => openApp(page));

test('a saved project file opens on another device', async ({ page, browser }) => {
  await page.getByRole('textbox', { name: 'Project name' }).fill('Hall cabinet');
  await enterParts(page, CABINET);
  await expectSheets(page, 1);
  await section(page, 'Parts');
  await page.getByRole('button', { name: 'Share' }).click();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Save file' }).click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/\.pilina\.json$/);
  const path = await file.path();
  expect(JSON.parse(await readFile(path, 'utf8'))).toMatchObject({
    format: 'cutlist-project',
    project: { name: 'Hall cabinet' },
  });

  const other = await otherDevice(browser);
  await openApp(other);
  await sidebar(other, 'Import projects…');
  await other
    .getByRole('dialog', { name: 'Import projects' })
    .locator('input[type=file]')
    .setInputFiles(path);
  await expect(other.getByText('Imported 1 project: Hall cabinet.')).toBeVisible();
  await other.keyboard.press('Escape');
  await expect(other.getByRole('textbox', { name: 'Project name' })).toHaveValue('Hall cabinet');
  await expectSheets(other, 1);
  await other.context().close();
});

test('the old app’s .md export imports, in millimetres', async ({ page }) => {
  await sidebar(page, 'Import projects…');
  const dialog = page.getByRole('dialog', { name: 'Import projects' });
  await dialog.locator('input[type=file]').setInputFiles(OLD_MD);
  await expect(dialog.getByText('Imported 1 project: Skrinky do dielne.')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('textbox', { name: 'Project name' })).toHaveValue(
    'Skrinky do dielne',
  );
  await section(page, 'Parts');
  await expect(page.getByRole('textbox', { name: 'Length, Sides' })).toHaveValue('1000');
  // The disabled row comes along, still switched off.
  await expect(page.getByRole('checkbox', { name: 'Include Stretchers' })).not.toBeChecked();
});

test('a link holds the whole project and offers to add it', async ({ page, browser }) => {
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.getByRole('textbox', { name: 'Project name' }).fill('Shoe rack');
  await enterParts(page, CABINET);
  await expectSheets(page, 1);
  await section(page, 'Parts');
  await page.getByRole('button', { name: 'Share' }).click();
  await page.getByRole('button', { name: 'Copy link' }).click();
  await expect(page.getByRole('button', { name: 'Copied' })).toBeVisible();
  const link = await page.evaluate(() => navigator.clipboard.readText());
  expect(link).toContain('#import=');

  const other = await otherDevice(browser);
  await other.goto(link.replace(/^https?:\/\/[^/]+/, ''));
  await other.getByRole('button', { name: 'Add project' }).click();
  await expect(other.getByRole('textbox', { name: 'Project name' })).toHaveValue('Shoe rack');
  await expectSheets(other, 1);
  // The link is forgotten, so a reload doesn't ask again.
  expect(other.url()).not.toContain('#import=');
  await other.context().close();
});

test('the cutting plan saves as a PDF', async ({ page }) => {
  await enterParts(page, CABINET);
  await expectSheets(page, 1);
  await section(page, 'Parts');
  await page.getByRole('button', { name: 'Share' }).click();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Save PDF' }).click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/\.pdf$/);
  const bytes = await readFile(await file.path());
  expect(bytes.subarray(0, 5).toString()).toBe('%PDF-');
  expect(bytes.length).toBeGreaterThan(50_000);
});
