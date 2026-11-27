import { readFileSync } from 'node:fs';
import { serve, playwright } from '/home/user/claude-workspace/tests/browser/harness.mjs';
const S = '/tmp/claude-0/-home-user-claude-workspace/06177a5d-45ba-5b18-b395-0fd8d80e2079/scratchpad';
const q = process.argv[2] || '';
const { base, close } = await serve();
const browser = await playwright().chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--enable-unsafe-webgpu'] });
const context = await browser.newContext();
await context.route('**/__raw/**', route => {
  const p = new URL(route.request().url()).pathname.replace('/__raw/', '');
  const file = p.startsWith('wasm/') ? S + '/yolo/pkg/lr/' + p : p === 'pose.jpg' ? S + '/yolo/pose.jpg' : S + '/yphone/raw/' + p;
  const type = p.endsWith('.html') ? 'text/html' : p.endsWith('.js') ? 'text/javascript' : p.endsWith('.wasm') ? 'application/wasm' : 'image/jpeg';
  return route.fulfill({ body: readFileSync(file), contentType: type });
});
await context.route('**/__w/**', route => {
  const p = new URL(route.request().url()).pathname.replace('/__w/', '');
  return route.fulfill({ body: readFileSync(S + '/yolo/weights/' + p), contentType: 'application/octet-stream' });
});
const page = await context.newPage();
page.on('pageerror', e => console.log('pageerror', String(e)));
await page.goto(base + '__raw/raw.html' + q);
await page.waitForFunction(() => window.__out && window.__out.done, null, { timeout: 300000 });
const r = await page.evaluate(() => window.__out);
for (const [k, v] of Object.entries(r)) console.log(k, JSON.stringify(v));
await browser.close(); await close();
