// Вспомогательный запуск Chromium для проверок (Playwright-core должен быть установлен в /tmp/pw).
process.env.PLAYWRIGHT_BROWSERS_PATH = '/workspace/node_modules/.pw-browsers';
process.env.LD_LIBRARY_PATH = '/workspace/node_modules/.debs/root/usr/lib/x86_64-linux-gnu:/workspace/node_modules/.debs/root/lib/x86_64-linux-gnu';
process.env.FONTCONFIG_FILE = '/workspace/node_modules/.debs/fonts.conf';
const { chromium } = await import('/tmp/pw/node_modules/playwright-core/index.mjs');
export const BASE = process.env.BASE || 'http://localhost:5173/preview/e4dd7fdb-afe9-4636-aee3-4b073ee0db9f/';
export async function launch(opts = {}) {
  const browser = await chromium.launch({
    args: ['--disable-dev-shm-usage', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl', ...(opts.args || [])]
  });
  const ctx = await browser.newContext({ viewport: { width: opts.w || 1280, height: opts.h || 800 }, hasTouch: !!opts.touch, isMobile: !!opts.mobile, deviceScaleFactor: opts.dpr || 1, reducedMotion: opts.motion ? 'no-preference' : 'reduce' });
  const page = await ctx.newPage();
  const logs = [];
  page.on('console', m => { if (!/Download the React DevTools|\[vite\]|WebSocket connection|WebSocket closed without opened/.test(m.text())) logs.push(m.type() + ': ' + m.text()) });
  page.on('pageerror', e => { if (!/WebSocket closed without opened/.test(e.message)) logs.push('PAGEERROR: ' + e.message) });
  page.on('requestfailed', r => logs.push('REQFAIL: ' + r.url().slice(0, 120) + ' ' + (r.failure() && r.failure().errorText)));
  return { browser, ctx, page, logs };
}
