// Screenshot with the right-hand panel scrolled: node scripts/analysis/shot-panel.mjs out.png "<hash>" <tab> [scrollTop]
// scripts/shot2.mjs cannot reach anything below the panel's fold, and the occupancy table on the Scores tab is below it.
import { chromium } from 'playwright-core';
const [, , out, hash = '#y=2036&view=conflict', tab = 'Scores', top = '1150'] = process.argv;
const b = await chromium.launch({ executablePath: '/home/mick/.cache/ms-playwright/chromium-1223/chrome-linux64/chrome', args: ['--no-sandbox'] });
const p = await b.newPage({ viewport: { width: 1600, height: 950 } });
p.on('pageerror', e => console.log('PAGEERROR', e.message));
await p.goto('http://localhost:4173/' + hash, { waitUntil: 'networkidle' });
await p.waitForTimeout(1500);
await p.locator('.tabs button', { hasText: tab }).first().click();
await p.waitForTimeout(600);
await p.locator('.panel .body').evaluate((el, t) => { el.scrollTop = t; }, +top);
await p.waitForTimeout(500);
await p.screenshot({ path: out });
console.log('saved', out);
await b.close();
