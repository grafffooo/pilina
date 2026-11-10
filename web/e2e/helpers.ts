// Shared steps for the end-to-end tests. On a phone the editor and the results are separate
// sections (Parts, Sheets, Cut in the bottom bar); on a desktop they're side by side.
import { expect, test, type Browser, type Page } from '@playwright/test';

export const onPhone = () => test.info().project.name === 'phone';

/** Shows a phone section; on a desktop everything is already on screen. */
export async function section(page: Page, name: 'Parts' | 'Sheets' | 'Cut') {
  if (!onPhone()) return;
  await page.getByRole('navigation', { name: 'Sections' }).getByRole('button', { name }).click();
}

/** Opens the app on a fresh device and waits for the first project. */
export async function openApp(page: Page) {
  await page.goto('/');
  await expect(page.getByRole('textbox', { name: 'Project name' })).toBeVisible();
}

export interface PartInput {
  length: string;
  width: string;
  qty?: string;
  label?: string;
}

/** Types parts into the Parts table, adding rows as needed (rows are "Part 1", "Part 2"…). */
export async function enterParts(page: Page, parts: PartInput[]) {
  await section(page, 'Parts');
  for (const [i, p] of parts.entries()) {
    const n = i + 1;
    const length = page.getByRole('textbox', { name: `Length, Part ${n}` });
    if (!(await length.isVisible())) await page.getByRole('button', { name: 'Add part' }).click();
    await length.fill(p.length);
    await page.getByRole('textbox', { name: `Width, Part ${n}` }).fill(p.width);
    if (p.qty) await page.getByRole('textbox', { name: `Qty, Part ${n}` }).fill(p.qty);
    if (p.label) await page.getByRole('textbox', { name: `Label, part ${n}` }).fill(p.label);
  }
  // Leave the last field so its value is committed.
  await page.keyboard.press('Tab');
}

/** A small cabinet: fits one 2800 × 2070 sheet. */
export const CABINET: PartInput[] = [
  { length: '720', width: '560', qty: '2', label: 'Side' },
  { length: '764', width: '560', qty: '2', label: 'Top and bottom' },
  { length: '764', width: '300', qty: '3', label: 'Shelf' },
];

/** Waits until the engine has made a plan with `sheets` sheets. */
export async function expectSheets(page: Page, sheets: number) {
  await section(page, 'Sheets');
  await expect(page.getByText(`Sheet 1 of ${sheets}`).first()).toBeVisible();
}

/** Everything saved in this browser's projects table, as JSON. */
export const savedProjects = (page: Page) =>
  page.evaluate(
    () =>
      new Promise<string>((resolve, reject) => {
        const open = indexedDB.open('cutlist');
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const get = open.result.transaction('projects').objectStore('projects').getAll();
          get.onsuccess = () => {
            open.result.close();
            resolve(JSON.stringify(get.result));
          };
          get.onerror = () => reject(get.error);
        };
      }),
  );

/** Waits until a saved project contains `text` (saving runs shortly after each change). */
export async function waitForSaved(page: Page, text: string) {
  await expect.poll(() => savedProjects(page)).toContain(text);
}

/** Opens Settings (on a phone it's in the projects drawer). */
export async function openSettings(page: Page) {
  if (onPhone()) await page.getByRole('button', { name: 'Projects' }).click();
  await page.getByRole('button', { name: 'Settings' }).click();
  await expect(page.getByRole('dialog', { name: 'Settings' })).toBeVisible();
}

export async function closeDialog(page: Page) {
  await page.keyboard.press('Escape');
}

/** Picks an item from the header's ⋯ menu. */
export async function projectAction(page: Page, item: string) {
  await page.getByRole('button', { name: 'Project actions' }).click();
  await page.getByRole('menuitem', { name: item }).click();
}

/** Opens a sidebar item (on a phone the sidebar is the projects drawer). */
export async function sidebar(page: Page, item: string | RegExp) {
  if (onPhone()) await page.getByRole('button', { name: 'Projects' }).click();
  await page.getByRole('button', { name: item }).first().click();
}

/** A second device: a fresh browser with its own empty storage, same screen size. */
export async function otherDevice(browser: Browser): Promise<Page> {
  const {
    baseURL,
    viewport,
    userAgent,
    deviceScaleFactor,
    isMobile,
    hasTouch,
    locale,
    timezoneId,
  } = test.info().project.use;
  const context = await browser.newContext({
    baseURL,
    viewport,
    userAgent,
    deviceScaleFactor,
    isMobile,
    hasTouch,
    locale,
    timezoneId,
  });
  return context.newPage();
}
