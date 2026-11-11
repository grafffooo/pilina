// Phone-viewport audit: takes a screenshot of every main screen and measures what makes a phone
// UI hard to use (touch targets, sideways scrolling, inputs that make iOS zoom, tiny selects).
// Output goes to ../docs/mobile/<phase>/<device>/ (screenshots plus report.json).
//
//   cd web && npm run screenshots:mobile              # phase "before" (default)
//   MOBILE_PHASE=after npm run screenshots:mobile     # after the milestone 12 changes
//
// It is an audit, not a pass/fail test: it never fails on a finding.
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { devices, test } from '@playwright/test';
import { measure, walkScreens, type Finding } from './audit';

const PHASE = process.env.MOBILE_PHASE ?? 'before';
const OUT = resolve(process.cwd(), '..', 'docs', 'mobile', PHASE);

// WebKit devices run in Chromium here: the size, pixel ratio, touch and mobile flags are what matter.
const { defaultBrowserType: _p, ...pixel } = devices['Pixel 7'];
const { defaultBrowserType: _i, ...iphone } = devices['iPhone 14'];
const DEVICES = [
  { id: 'pixel-7', use: pixel },
  { id: 'iphone-14', use: iphone },
];

for (const device of DEVICES) {
  test.describe(device.id, () => {
    test.use({ ...device.use, actionTimeout: 8000 });

    test('audit every main screen', async ({ page }) => {
      test.setTimeout(120_000);
      const dir = resolve(OUT, device.id);
      mkdirSync(dir, { recursive: true });
      const findings: Finding[] = [];
      let n = 0;

      /** Screenshot of the viewport plus measurements. */
      const shot = async (screen: string) => {
        n += 1;
        await page.waitForTimeout(250);
        const file = `${String(n).padStart(2, '0')}-${screen}`;
        await page.screenshot({ path: resolve(dir, `${file}.png`) });
        findings.push({ screen: file, ...(await page.evaluate(measure)) });
      };
      await walkScreens(page, shot);
      writeFileSync(resolve(dir, 'report.json'), JSON.stringify(findings, null, 2));
    });
  });
}
