// Captures README screenshots in Light and Dark mode into ../docs/screenshots/.
// Run with: cd web && npm run screenshots
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { CABINET, enterParts, expectSheets, openApp } from './helpers';

const OUT_DIR = resolve(process.cwd(), '..', 'docs', 'screenshots');

test.use({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 2,
});

async function setTheme(page: Page, theme: 'light' | 'dark') {
  await page.evaluate((t) => {
    localStorage.setItem('cutlist.appearance', JSON.stringify({ theme: t }));
    document.documentElement.setAttribute('data-theme', t);
  }, theme);
}

test('generate README screenshots (light and dark mode)', async ({ page }) => {
  mkdirSync(OUT_DIR, { recursive: true });

  await page.addInitScript(() => {
    localStorage.setItem('cutlist.language', 'en');
    localStorage.setItem('cutlist.appearance', JSON.stringify({ theme: 'light' }));
  });

  await openApp(page);
  await setTheme(page, 'light');

  // 1. First project: cut a sheet, keep its two offcuts (OC-0001 and OC-0002), and capture
  //    both Cut Mode (in Dark Mode) and the A4 QR Label sheet preview (in Light Mode).
  const nameInput = page.getByRole('textbox', { name: 'Project name' });
  await nameInput.fill('Pantry Shelving');
  await enterParts(page, CABINET);
  await expectSheets(page, 1);

  await page.getByRole('button', { name: 'Start cutting' }).first().click();
  const mode = page.getByRole('dialog', { name: 'Cut mode' });
  await expect(mode.getByText('Cut 1 of 9')).toBeVisible();

  const next = mode.getByRole('button', { name: 'Done, next cut' });
  await next.click();
  await next.click();
  await expect(mode.getByText('Pick up strip 1 of 2')).toBeVisible();

  // Screenshot: Step-by-step Cut Mode in Dark Mode
  await setTheme(page, 'dark');
  await page.screenshot({ path: resolve(OUT_DIR, 'cut-mode-dark.png') });
  await setTheme(page, 'light');

  // Finish the sheet and keep both suggested leftovers (OC-0001 and OC-0002)
  while (await next.isVisible()) await next.click();
  await mode.getByRole('button', { name: 'Done, sheet finished' }).click();
  await expect(mode.getByText('Keep any offcuts?')).toBeVisible();
  await mode.getByRole('button', { name: 'Keep 2 offcuts' }).click();
  await expect(mode.getByText('All sheets are cut')).toBeVisible();

  // Open the A4 QR sticker sheet screen and start at sticker #4 (stickers 1–3 already peeled)
  await mode.getByRole('button', { name: 'Print labels' }).click();
  await expect(page.getByRole('heading', { name: 'Print labels' })).toBeVisible();
  await page.getByRole('button', { name: 'Start at sticker 4', exact: true }).click();

  // Screenshot: A4 QR Sticker Label Sheet preview in Light Mode
  await page.screenshot({ path: resolve(OUT_DIR, 'offcuts-labels-light.png') });

  // 2. Second project: "Workshop Cabinets" — automatically reuses OC-0001 before new sheets!
  await page.getByRole('button', { name: 'New project' }).click();
  await page.getByRole('textbox', { name: 'Project name' }).fill('Workshop Cabinets');
  await enterParts(page, [
    { length: '1000', width: '600', qty: '2', label: 'Desk top' },
    { length: '720', width: '560', qty: '2', label: 'Cabinet side' },
    { length: '1160', width: '540', qty: '2', label: 'Shelf' },
  ]);
  await expect(page.getByText(/OC-0001/).first()).toBeVisible();

  // Screenshot: Full Workspace (Sidebar + Editor + Results with offcut reuse) in Light Mode
  await page.screenshot({ path: resolve(OUT_DIR, 'workspace-light.png') });

  // Cut the second project's sheets too so Statistics shows offcut reuse & money saved
  await page.getByRole('button', { name: 'Start cutting' }).first().click();
  while (
    (await next.isVisible()) ||
    (await mode.getByRole('button', { name: 'Done, sheet finished' }).isVisible()) ||
    (await mode.getByRole('button', { name: /Keep .* offcut|No, finish/ }).isVisible())
  ) {
    if (await next.isVisible()) {
      await next.click();
    } else if (await mode.getByRole('button', { name: 'Done, sheet finished' }).isVisible()) {
      await mode.getByRole('button', { name: 'Done, sheet finished' }).click();
    } else {
      const keepBtn = mode.getByRole('button', { name: /Keep .* offcut|No, finish/ }).first();
      await keepBtn.click();
    }
  }
  await mode.getByRole('button', { name: 'Close cut mode' }).click();

  // 3. Open Statistics in Dark Mode
  await setTheme(page, 'dark');
  await page.getByRole('button', { name: 'Statistics' }).first().click();
  await expect(page.getByRole('heading', { name: 'Statistics' })).toBeVisible();
  await expect(page.getByText('Saved by reusing')).toBeVisible();

  // Screenshot: Workshop Statistics in Dark Mode
  await page.screenshot({ path: resolve(OUT_DIR, 'stats-dark.png') });
});
