import { launch, BASE } from './launch.mjs';
// node tests/tools/shot.mjs <path-with-query> <out.png> [w] [h] [waitMs]
const [, , path, out, w = '1280', h = '800', wait = '1500'] = process.argv;
const { browser, page, logs } = await launch({ w: +w, h: +h });
page.on('crash', () => logs.push('!!! PAGE CRASH'));
try {
  await page.goto(BASE + path, { waitUntil: 'load', timeout: 60000 });
  await page.waitForTimeout(+wait);
  await page.screenshot({ path: out, fullPage: !!process.env.FULL });
} catch (e) { logs.push('ERR: ' + e.message.split('\n')[0]) }
console.log(logs.join('\n') || '(консоль чистая)');
await browser.close();
