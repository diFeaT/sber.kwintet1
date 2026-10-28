import { launch, BASE } from './launch.mjs';
const block = process.argv[2] || 'three.min.js';
const { browser, page, logs } = await launch({});
page.on('crash', () => logs.push('!!! PAGE CRASH'));
await page.route(new RegExp(block), r => r.abort());
try { await page.goto(BASE + 'index.html', { waitUntil: 'load', timeout: 40000 }); await page.waitForTimeout(2500); logs.push('loaded ok; title=' + await page.title()) } catch (e) { logs.push('ERR ' + e.message.split('\n')[0]) }
console.log(logs.join('\n'));
await browser.close();
