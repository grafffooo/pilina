// The workshop flow: cut mode step by step, keeping offcuts, printing their labels, and the
// offcut being offered to the next project.
import { expect, test, type Page } from '@playwright/test';
import { CABINET, enterParts, expectSheets, onPhone, openApp, section } from './helpers';

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

test('cut a sheet, keep its offcuts and print their labels', async ({ page }) => {
  await enterParts(page, CABINET);
  await expectSheets(page, 1);
  await section(page, 'Cut');
  await page.getByRole('button', { name: 'Start cutting' }).first().click();

  const mode = page.getByRole('dialog', { name: 'Cut mode' });
  await expect(mode.getByText('Cut 1 of 9')).toBeVisible();
  await expect(mode.getByText('Rip cuts · 1 of 2')).toBeVisible();
  const next = mode.getByRole('button', { name: 'Done, next cut' });
  await next.click();
  await next.click();
  // After the rips: pick up the first strip.
  await expect(mode.getByText('Pick up strip 1 of 2')).toBeVisible();
  await expect(mode.getByText('Strip 1 of 2 · cross cuts')).toBeVisible();

  // Leaving and coming back resumes at the same cut; the project shows how far it got.
  await mode.getByRole('button', { name: 'Close cut mode' }).click();
  await section(page, 'Parts');
  await expect(page.getByText('Cutting 0 / 1').first()).toBeVisible();
  await section(page, 'Cut');
  await page.getByRole('button', { name: 'Start cutting' }).first().click();
  await expect(mode.getByText('Cut 3 of 9')).toBeVisible();

  while (await next.isVisible()) await next.click();
  await mode.getByRole('button', { name: 'Done, sheet finished' }).click();

  // Both big leftovers are suggested; keep them on the default rack, labels queued.
  await expect(mode.getByText('Keep any offcuts?')).toBeVisible();
  await expect(mode.getByRole('checkbox', { name: /2070 × 1468/ })).toBeChecked();
  await expect(mode.getByRole('checkbox', { name: /622 × 560/ })).toBeChecked();
  await mode.getByRole('button', { name: 'Keep 2 offcuts' }).click();

  await expect(mode.getByText('All sheets are cut')).toBeVisible();
  await expect(mode.getByText(/OC-0001, OC-0002/)).toBeVisible();
  await mode.getByRole('button', { name: 'Print labels' }).click();

  // Labels: two in the queue, printed onto an A4 sheet, then marked as printed.
  await page.getByRole('button', { name: 'Print 2 labels' }).click();
  await expect.poll(() => prints(page)).toHaveLength(1);
  const sheet = (await prints(page))[0]!;
  expect(sheet).toContain('OC-0001');
  expect(sheet).toContain('OC-0002');
  await page.getByRole('button', { name: 'Mark as printed' }).click();
  await expect(page.getByRole('button', { name: 'Print 0 labels' })).toBeDisabled();

  // The library has them, and the project is now marked cut.
  await page.getByRole('button', { name: 'Offcut library' }).first().click();
  await expect(
    page.getByRole(onPhone() ? 'button' : 'row', { name: /OC-0001.*2070 × 1468.*Rack A.*Printed/ }),
  ).toBeVisible();
  await expect(
    page.getByRole(onPhone() ? 'button' : 'row', { name: /OC-0002.*622 × 560/ }),
  ).toBeVisible();

  // A new project that fits the big offcut cuts it before any new sheet.
  if (onPhone()) await page.getByRole('button', { name: 'Projects' }).click();
  await page.getByRole('button', { name: 'New project' }).click();
  await enterParts(page, [{ length: '1000', width: '600', label: 'Desk top' }]);
  await expectSheets(page, 1);
  await expect(page.getByText(/^2070 × 1468 · OC-0001 · .* · 1 part ·/)).toBeVisible();
});
