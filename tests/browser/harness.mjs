// 瀏覽器端到端測試的共用工具（10/30 從暫存區的測試工具整理進專案）：真的 Chromium 打開網站，
// 鏡頭、AI、講話都用假的，只用合成資料（示範動畫的火柴人，tests/helpers.mjs），不用組員的錄影、不用連網路
//   假鏡頭：一張一直重畫的畫布（captureStream），內容不重要，AI 是假的
//   假 AI：網站向 CDN 要 MediaPipe 時，給一個假的模組：每一格照時間回傳事先排好的骨架（frames），不下載 AI 引擎
//     網站只用到 FilesetResolver、PoseLandmarker 兩樣（骨架連線在 js/ui/draw.js 自己有），背景執行緒（importScripts）和主畫面（import）兩種都有
//   模型檔：給幾個位元組就好（假 AI 不讀它）
// 需要 Playwright 和它的 Chromium（npm run test:browser 的說明見 docs/architecture.md「怎麼測試」）
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { extname, join, normalize, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { demoLandmarks } from '../helpers.mjs';

// 網站的資料夾：預設是這個專案；SITE_ROOT 可以換成別的資料夾（例如改之前的程式，比較改前改後）
export const ROOT = normalize(process.env.SITE_ROOT || join(dirname(fileURLToPath(import.meta.url)), '..', '..'));
const require = createRequire(import.meta.url);

// Playwright：專案不裝套件，用電腦上（或 CI 臨時裝）的；找不到時說清楚怎麼裝
export function playwright() {
    try {
        return require('playwright');
    } catch (err) {
        throw new Error('找不到 Playwright：先執行 npm install --no-save playwright 和 npx playwright install chromium（見 docs/architecture.md）');
    }
}

// 有 PLAYWRIGHT_CHROMIUM 就用指定的 Chromium（例如雲端開發環境的 /opt/pw-browsers/chromium），不然用 Playwright 自己的
export async function launch() {
    const { chromium } = playwright();
    const executablePath = process.env.PLAYWRIGHT_CHROMIUM || undefined;
    return chromium.launch(executablePath ? { executablePath } : {});
}

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
    '.png': 'image/png', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json', '.task': 'application/octet-stream' };

// 在本機開網站（127.0.0.1、隨便一個沒用的 port）；回傳 { base, close }
export function serve() {
    const server = createServer(async (req, res) => {
        const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
        const file = normalize(join(ROOT, path === '/' ? 'index.html' : path));
        if (!file.startsWith(ROOT)) { res.writeHead(403).end(); return; }
        try {
            const body = await readFile(file);
            res.writeHead(200, { 'Content-Type': TYPES[extname(file)] || 'application/octet-stream' }).end(body);
        } catch (err) {
            res.writeHead(404).end();
        }
    });
    return new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve({
        base: 'http://127.0.0.1:' + server.address().port + '/',
        close: () => new Promise(done => server.close(done))
    })));
}

// ---------- 假 AI ----------

// 每一格骨架存成 [x, y, z, visibility]（小數 4 位），世界座標隨便給（假的，只要有）
const encode = lm => lm.map(p => [+p.x.toFixed(4), +p.y.toFixed(4), 0, p.visibility]);

// 排骨架：每一段是 { id（示範動畫的動作）, depth（0～1，或 i => depth）, frames（幾格）, move（i => 每個點怎麼移，可省略）}
// 每秒 30 格
export function script(parts) {
    const frames = [];
    for (const part of parts) {
        for (let i = 0; i < part.frames; i++) {
            const depth = typeof part.depth === 'function' ? part.depth(i) : part.depth;
            let lm = demoLandmarks(part.id, depth);
            if (part.move) lm = lm.map((p, k) => part.move(p, k, frames.length));
            frames.push(encode(lm));
        }
    }
    return frames;
}

// 一下：下去 half 格、底部停 hold 格、起來 half 格、站直 rest 格
export function rep(id, { half = 30, hold = 0, rest = 30, move } = {}) {
    return [
        { id, depth: i => i / half, frames: half + 1, move },
        { id, depth: 1, frames: hold, move },
        { id, depth: i => 1 - i / half, frames: half + 1, move },
        { id, depth: 0, frames: rest }
    ];
}

// 假的 MediaPipe：第一次偵測時開始算時間，每 1000/30 毫秒換下一格；排完了就是「沒有人」
function fakeBody(frames) {
    return `const FRAMES = ${JSON.stringify(frames)};
const toPoints = f => f.map(([x, y, z, visibility]) => ({ x, y, z, visibility }));
const toWorld = f => f.map(([x, y]) => ({ x: x - 0.5, y: y - 0.5, z: 0 }));
let t0 = null;
const fake = {
    detectForVideo(source, ts) {
        // 網站量畫面亮度、開頭試算用的小圖（64 寬）：不算
        if (source && source.width === 64) return { landmarks: [], worldLandmarks: [] };
        if (t0 === null) t0 = ts;
        const f = FRAMES[Math.floor((ts - t0) / (1000 / 30))];
        return f ? { landmarks: [toPoints(f)], worldLandmarks: [toWorld(f)] } : { landmarks: [], worldLandmarks: [] };
    },
    close() {}
};
const FilesetResolver = { async forVisionTasks(base) { return { wasmLoaderPath: base + '/vision_wasm_internal.js', wasmBinaryPath: base + '/vision_wasm_internal.wasm' }; } };
class PoseLandmarker { static async createFromOptions() { return fake; } }`;
}
export const fakeModule = frames => fakeBody(frames) + '\nexport { FilesetResolver, PoseLandmarker };\n';
export const fakeWorkerScript = frames => '(() => {\n' + fakeBody(frames) + '\nself.Vision = { FilesetResolver, PoseLandmarker };\n})();\n';

// 假鏡頭（640×480）、假的講話（記下講了什麼，在 window.__said）；錄製前不倒數
const INIT = `(() => {
  try { localStorage.setItem('recordCountdown', '0'); } catch (e) {}
  navigator.mediaDevices.getUserMedia = async () => {
    const c = document.createElement('canvas'); c.width = 640; c.height = 480;
    const g = c.getContext('2d'); let n = 0;
    const draw = () => { g.fillStyle = '#5a88b8'; g.fillRect(0, 0, 640, 480); g.fillStyle = '#e8eef5'; g.fillRect(200 + (n++ % 20), 60, 160, 360); };
    draw(); setInterval(draw, 33);
    return c.captureStream(30);
  };
  const said = window.__said = [];
  const synth = { speaking: false, pending: false, getVoices: () => [{ lang: 'zh-TW', name: 'fake-zh' }], addEventListener() {},
    speak(u) { said.push(u.text); setTimeout(() => { if (u.onend) u.onend({}); }, 200); }, cancel() {} };
  Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: synth });
  window.SpeechSynthesisUtterance = function (text) { this.text = text; this.volume = 1; this.lang = ''; this.voice = null; this.rate = 1; };
})();`;

const CDNS = ['https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@*/**', 'https://unpkg.com/@mediapipe/tasks-vision@*/**'];
const MODEL = 'https://storage.googleapis.com/mediapipe-models/**';

// 一個瀏覽環境（等於一個乾淨的瀏覽器分頁）：假 AI 播 frames；errors 收集網頁的程式錯誤
// 擋在整個環境上（context.route），Service Worker 發出的請求也攔得到
export async function open(browser, frames, { width = 1280, height = 900, mobile = false } = {}) {
    const context = await browser.newContext({ viewport: { width, height }, isMobile: mobile, hasTouch: mobile });
    const page = await context.newPage();
    page.errors = [];
    page.on('pageerror', e => page.errors.push(String(e)));
    for (const cdn of CDNS) {
        await context.route(cdn, route => {
            const file = new URL(route.request().url()).pathname.split('/').pop();
            const headers = { 'Access-Control-Allow-Origin': '*' };
            if (file === 'vision_bundle.mjs') return route.fulfill({ body: fakeModule(frames), contentType: 'text/javascript', headers });
            if (file === 'vision_bundle.js') return route.fulfill({ body: fakeWorkerScript(frames), contentType: 'text/javascript', headers });
            return route.fulfill({ status: 404, headers });
        });
    }
    await context.route(MODEL, route => route.fulfill({ body: 'fake-model', contentType: 'application/octet-stream', headers: { 'Access-Control-Allow-Origin': '*' } }));
    await context.addInitScript(INIT);
    return { context, page };
}

// 選好動作、開鏡頭、等假 AI 播完（done：網頁裡的判斷式，例如次數到 6），再按「結束」回首頁看總結
export async function workout(page, base, id, done, { settle = 1500 } = {}) {
    await page.goto(base + 'index.html?workout=' + id);
    await page.waitForFunction(() => /已就緒|失敗/.test(document.getElementById('poseStatus').textContent), null, { timeout: 60000 });
    await page.click('#startBtn');
    await page.waitForFunction(() => !document.getElementById('stage').hidden, null, { timeout: 10000 });
    await page.waitForFunction(done, null, { timeout: 120000 });
    await page.waitForTimeout(settle);
    await page.click('#stopBtn');
    await page.waitForFunction(() => !document.getElementById('summary').hidden, null, { timeout: 10000 });
}

// 「這次運動」的內容：總結每一行、流暢度、穩定度、每一下的表格
export function summary(page) {
    return page.evaluate(() => {
        const text = id => { const el = document.getElementById(id); return el && !el.hidden ? el.textContent : ''; };
        return {
            lines: [...document.querySelectorAll('#summaryLines li')].map(li => li.textContent),
            fluency: text('fluencyBox'),
            stability: text('stabilityBox'),
            head: [...document.querySelectorAll('#repChart .rep-table thead th')].map(th => th.textContent),
            rows: [...document.querySelectorAll('#repChart .rep-table tbody tr')].map(tr => [...tr.children].map(td => td.textContent))
        };
    });
}
