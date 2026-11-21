import { createRequire } from 'node:module';
import { readFileSync, existsSync } from 'node:fs';
import { createServer } from 'node:http';
import { join, normalize, extname } from 'node:path';
const { chromium } = createRequire(import.meta.url)('playwright');
const S = '/tmp/claude-0/-home-user-claude-workspace/06177a5d-45ba-5b18-b395-0fd8d80e2079/scratchpad';
const SITE = S + '/p2gpu';
const T = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript' };
const server = createServer((req, res) => {
  const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const f = normalize(join(SITE, p));
  if (!f.startsWith(SITE) || !existsSync(f)) { res.writeHead(404).end(); return; }
  res.writeHead(200, { 'Content-Type': T[extname(f)] || 'application/octet-stream' }).end(readFileSync(f));
}).listen(0, '127.0.0.1');
await new Promise(r => server.on('listening', r));
const b = await chromium.launch({ args: ['--enable-unsafe-webgpu'] });
const ctx = await b.newContext();
await ctx.route('https://cdn.jsdelivr.net/npm/@litertjs/core@2.6.0/wasm/**', r => {
  const f = S + '/yolo/pkg/lrweb/node_modules/@litertjs/core/wasm/' + new URL(r.request().url()).pathname.split('/').pop();
  r.fulfill({ path: f, contentType: f.endsWith('.wasm') ? 'application/wasm' : 'text/javascript', headers: { 'Access-Control-Allow-Origin': '*' } });
});
await ctx.route('**/__test/pu_*.png', r => r.fulfill({ path: S + '/yolo/frames/' + new URL(r.request().url()).pathname.split('/').pop(), contentType: 'image/png' }));
const p = await ctx.newPage();
await p.goto('http://127.0.0.1:' + server.address().port + '/gpucheck.html');
await p.waitForFunction(() => window.__out && window.__out.done, null, { timeout: 300000 });
console.log(JSON.stringify(await p.evaluate(() => window.__out)));
await b.close(); server.close();
