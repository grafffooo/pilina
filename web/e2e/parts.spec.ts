// Entering parts and getting a cutting plan.
import { expect, test, type Page } from '@playwright/test';
import { CABINET, enterParts, expectSheets, openApp, section, waitForSaved } from './helpers';

/** Pastes text into a field the way the clipboard would. */
async function paste(page: Page, field: string, text: string) {
  await page.getByRole('textbox', { name: field }).evaluate((el, value) => {
    const data = new DataTransfer();
    data.setData('text/plain', value);
    el.dispatchEvent(
      new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }),
    );
  }, text);
}

test.beforeEach(async ({ page }) => openApp(page));

test('parts typed in become a plan, rips first', async ({ page }) => {
  await enterParts(page, CABINET);
  await expect(page.getByText('7 pieces · 3 rows')).toBeVisible();

  await expectSheets(page, 1);
  await expect(
    page.getByRole('img', { name: /Sheet 1: 7 parts on a 2800 × 2070 mm board/ }),
  ).toBeVisible();

  await section(page, 'Cut');
  const cuts = page.getByRole('list').filter({ hasText: 'Rip, full length' });
  await expect(cuts.getByText('Rip cuts')).toBeVisible();
  await expect(cuts.getByText('Strip 2 of 2')).toBeVisible();
  // Every rip is numbered before the first cross cut.
  const kinds = await cuts.getByRole('button').allTextContents();
  const firstCross = kinds.findIndex((k) => k.includes('Cross cut'));
  expect(kinds.slice(firstCross).some((k) => k.includes('Rip'))).toBe(false);
});

test('rows pasted from a spreadsheet fill the table', async ({ page }) => {
  await section(page, 'Parts');
  await paste(
    page,
    'Length, Part 1',
    'Length\tWidth\tQty\tName\n600\t400\t2\tDoor\n500\t300\t1\tDrawer front\n',
  );
  await expect(page.getByRole('textbox', { name: 'Label, part 1' })).toHaveValue('Door');
  await expect(page.getByRole('textbox', { name: 'Width, Drawer front' })).toHaveValue('300');
  await expect(page.getByText('3 pieces · 2 rows')).toBeVisible();
  await expectSheets(page, 1);
});

test('a part bigger than every sheet is reported', async ({ page }) => {
  await enterParts(page, [...CABINET, { length: '3000', width: '500', label: 'Worktop' }]);
  await section(page, 'Sheets');
  await expect(page.getByText('1 part doesn’t fit')).toBeVisible();
  await expect(page.getByText(/Worktop.*bigger than every stock sheet/)).toBeVisible();
});

test('the project is still there after a reload', async ({ page }) => {
  await page.getByRole('textbox', { name: 'Project name' }).fill('Kitchen');
  await enterParts(page, CABINET);
  await waitForSaved(page, 'Kitchen');
  await page.reload();
  await expect(page.getByRole('textbox', { name: 'Project name' })).toHaveValue('Kitchen');
  await section(page, 'Parts');
  await expect(page.getByRole('textbox', { name: 'Label, part 3' })).toHaveValue('Shelf');
});
