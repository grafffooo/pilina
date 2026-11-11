// The phone checklist, run on every main screen: no sideways scrolling, no tap target under 44 px,
// no field under 16 px (iOS zooms into smaller ones), no select too narrow to read.
// `npm run screenshots:mobile` runs the same walk and keeps screenshots and a report.
import { expect, test } from '@playwright/test';
import { measure, walkScreens } from './audit';
import { onPhone } from './helpers';

test('no main screen fails the phone checklist', async ({ page }) => {
  test.skip(!onPhone(), 'phone screens only');
  test.setTimeout(120_000);
  const problems: string[] = [];
  await walkScreens(page, async (screen) => {
    await page.waitForTimeout(200);
    const f = await page.evaluate(measure);
    if (f.overflowX > 0)
      problems.push(`${screen}: page is ${f.overflowX} px wider than the screen`);
    for (const s of f.scrollers) problems.push(`${screen}: scrolls sideways: ${s}`);
    for (const s of f.small) problems.push(`${screen}: ${s.what} is ${s.w} × ${s.h} px`);
    for (const s of f.zoomInputs) problems.push(`${screen}: ${s.what} is ${s.fontPx} px text`);
    for (const s of f.tinySelects) problems.push(`${screen}: ${s.what} is ${s.w} px wide`);
    for (const s of f.clipped) problems.push(`${screen}: ${s.what} is ${s.w} px wide`);
  });
  expect(problems).toEqual([]);
});
