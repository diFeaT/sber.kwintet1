import { launch, BASE } from './launch.mjs';
// node tests/tools/open-studio.mjs [mode] [w] [h] [out]
const [, , mode = 'exterior', w = '1440', h = '900', out = 'public/uploads/qa/studio.png'] = process.argv;
const { browser, page, logs } = await launch({ w: +w, h: +h, touch: +w < 800, mobile: +w < 800 });
page.on('crash', () => logs.push('!!! PAGE CRASH'));
try {
  await page.goto(BASE + 'index.html', { waitUntil: 'load' });
  await page.waitForTimeout(800);
  await page.evaluate(() => { try { localStorage.clear() } catch (e) { } });
  await page.click('#mainNav .nav-cta, .nav-toggle').catch(() => { });
  if (+w < 1060) { await page.click('#mainNav .nav-cta') }
  await page.waitForSelector('#tourModal:not([hidden])', { timeout: 15000 });
  await page.screenshot({ path: out.replace('.png', '-tour.png') });
  await page.click('#tourX');
  if (mode !== 'exterior') await page.click(`#stuModes [data-mode="${mode}"]`);
  await page.waitForTimeout(2500);
  await page.screenshot({ path: out });
  console.log('stats', JSON.stringify(await page.evaluate(() => window.__studio.stats())));
} catch (e) { logs.push('ERR: ' + e.message.split('\n')[0]) }
console.log(logs.join('\n') || '(консоль чистая)');
await browser.close();
