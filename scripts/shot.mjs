// Headless screenshot: node scripts/shot.mjs <url> <out.png> [click-selector] [year]
import { chromium } from 'playwright-core';
const [,, url = 'http://localhost:4173/', out = 'shot.png', clickSel, year] = process.argv;
const browser = await chromium.launch({ executablePath: '/home/mick/.cache/ms-playwright/chromium-1223/chrome-linux64/chrome', args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 950 } });
page.on('pageerror', e => console.log('PAGEERROR', e.message));
page.on('console', m => { if (m.type() === 'error') console.log('CONSOLE', m.text()); });
await page.goto(url, { waitUntil: 'networkidle' });
await page.waitForSelector('svg', { timeout: 15000 });
if (year) { await page.locator('input[type=range]').fill(String(year)); }
if (clickSel?.startsWith('actor:')) { await page.locator('header select').nth(1).selectOption(clickSel.slice(6)); await page.waitForTimeout(300); }
else if (clickSel) { await page.locator(clickSel).first().click(); await page.waitForTimeout(300); }
await page.waitForTimeout(500);
await page.screenshot({ path: out });
console.log('saved', out);
await browser.close();
