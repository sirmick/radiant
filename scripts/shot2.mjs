// node scripts/shot2.mjs out.png year "btn1,btn2" [actor]  — toggles header buttons by label, sets year, optionally selects an actor
import { chromium } from 'playwright-core';
const [,, out, year, btns = '', actor, tab] = process.argv;
const b = await chromium.launch({ executablePath: '/home/mick/.cache/ms-playwright/chromium-1223/chrome-linux64/chrome', args: ['--no-sandbox'] });
const p = await b.newPage({ viewport: { width: 1600, height: 950 } });
p.on('pageerror', e => console.log('PAGEERROR', e.message));
await p.goto('http://localhost:4173/', { waitUntil: 'networkidle' }); await p.waitForSelector('svg');
if (year) { await p.locator('input[type=range]').fill(String(year)); await p.waitForTimeout(200); }
for (const t of btns.split(',').filter(Boolean)) { await p.locator('header button', { hasText: t }).first().click(); await p.waitForTimeout(150); }
if (actor) { await p.locator('header select').nth(1).selectOption(actor); await p.waitForTimeout(300); }
if (tab) { await p.locator('.tabs button', { hasText: tab }).first().click(); await p.waitForTimeout(300); }
await p.waitForTimeout(600); await p.screenshot({ path: out }); console.log('saved', out); await b.close();
