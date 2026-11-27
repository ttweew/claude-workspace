// 手機的 GPU 算錯（11/27）：組員的手機選 YOLO 完全沒有骨架（全身進到畫面也沒有），MediaPipe 正常
//   原因：手機的 GPU 支援半精度，LiteRT.js 預設就用半精度；算壞時每個數字都是 0、不會報錯（這台電腦的軟體 GPU 強制半精度時就是這樣），
//   以前啟動時只看「算出來的是不是數字」，0 也通過，什麼都沒算又最快，就選了 GPU，之後每一格都「沒有人」
//   現在（js/ai/yolo-worker.js）：GPU 指定一般精度（fp32）；啟動時全灰的畫面和 CPU 對答案；用 GPU 時前幾格有人的畫面也和 CPU 對答案
// 假的 GPU（harness.mjs 的 fakeLiteRt，yoloGpu）：'zeros' 每個數字都是 0、'blind' 啟動時正常但畫面上有人時給 0、'ok' 算得和 CPU 一樣
// 手機的畫面大小（390×844）；合成資料（示範動畫的火柴人）
import test from 'node:test';
import assert from 'node:assert/strict';
import { launch, serve, open, script, rep } from './harness.mjs';

const stand = (id, frames) => ({ id, depth: 0, frames });
const SQUAT = script([stand('squat', 60), ...[1, 2, 3, 4].flatMap(() => rep('squat', { hold: 10, rest: 40 })), stand('squat', 60)]);
// 中途換成 YOLO26s 用：深蹲 12 下（換模型時畫面會停 1～2 秒，排多一點）
const LONG = script([stand('squat', 60), ...Array.from({ length: 12 }, () => rep('squat', { hold: 10, rest: 40 })).flat(), stand('squat', 90)]);
const PHONE = { width: 390, height: 844, mobile: true };

let browser, site;
test.before(async () => {
    site = await serve();
    browser = await launch();
});
test.after(async () => {
    await browser.close();
    await site.close();
});

const reps = page => page.evaluate(() => Number(document.getElementById('hudReps').textContent) || 0);

async function startYolo(page) {
    await page.goto(site.base + 'index.html?model=yolo-n&workout=squat');
    await page.waitForFunction(() => /已就緒|失敗/.test(document.getElementById('poseStatus').textContent), null, { timeout: 60000 });
    assert.match(await page.textContent('#poseStatus'), /已就緒/);
    await page.click('#startBtn');
    await page.waitForFunction(() => !document.getElementById('stage').hidden, null, { timeout: 10000 });
}

// 運算標籤點開：「CPU：原因 · 每秒幾格 …」
async function perfDetail(page) {
    if (!(await page.textContent('#perfBtn')).includes('：')) await page.click('#perfBtn');
    await page.waitForFunction(() => document.getElementById('perfBtn').textContent.includes('：'), null, { timeout: 5000 });
    return (await page.textContent('#perfBtn')).trim();
}

// YOLO 的背景執行緒（換模型時舊的會關掉，等到只剩一個）：編譯過哪些運算方式、有畫面的格子 GPU 和 CPU 各算幾次
async function yoloWorker(page) {
    let list = [];
    for (let i = 0; i < 50; i++) {
        list = page.workers().filter(w => w.url().includes('yolo-worker.js'));
        if (list.length === 1) break;
        await page.waitForTimeout(100);
    }
    assert.equal(list.length, 1, 'YOLO 的背景執行緒只有一個');
    return list[0].evaluate(() => ({
        compiles: self.__fakeCompiles.map(c => c.accelerator + (c.precision ? ':' + c.precision : '')),
        runs: { ...self.__fakeRuns }
    }));
}

test('GPU 算出來全部是 0（手機半精度算壞）：啟動時和 CPU 對答案就發現，改用 CPU；深蹲 4 下照樣數；GPU 指定一般精度', async () => {
    const { context, page } = await open(browser, SQUAT, { ...PHONE, yoloGpu: 'zeros' });
    await startYolo(page);
    await page.waitForFunction(() => document.getElementById('hudReps').textContent === '4', null, { timeout: 120000 });
    assert.match(await page.textContent('#perfBtn'), /^CPU/);
    assert.match(await perfDetail(page), /^CPU：GPU 算出來的和 CPU 對不起來，改用 CPU（量過：GPU 每格 \d+ 毫秒、CPU \d+ 毫秒）（背景運算）/);
    const w = await yoloWorker(page);
    // 先量 CPU（標準答案），再量 GPU，GPU 指定一般精度（fp32）
    assert.deepEqual(w.compiles, ['wasm', 'webgpu:fp32']);
    assert.equal(w.runs.GPU, 0, 'GPU 一格畫面都沒算');
    assert.deepEqual(page.errors, []);
    await context.close();
});

test('GPU 啟動時正常、畫面上有人時算錯：前 2 格就發現，改用 CPU，那 2 格用 CPU 的結果、次數一下都沒少；換成 YOLO26s 不再試 GPU', async () => {
    const { context, page } = await open(browser, LONG, { ...PHONE, yoloGpu: 'blind' });
    await startYolo(page);
    // 以前：GPU 比較快就一直用 GPU，每一格都「沒有人」，一下都數不到
    await page.waitForFunction(() => Number(document.getElementById('hudReps').textContent) >= 2, null, { timeout: 60000 });
    assert.match(await page.textContent('#perfBtn'), /^CPU/);
    assert.match(await perfDetail(page), /^CPU：GPU 算出來的和 CPU 對不起來，改用 CPU（量過：GPU 每格 \d+ 毫秒、CPU \d+ 毫秒）/);
    let w = await yoloWorker(page);
    assert.deepEqual(w.compiles, ['wasm', 'webgpu:fp32']);
    assert.equal(w.runs.GPU, 2, 'GPU 只算了對答案的 2 格');
    // 中途換成 YOLO26s（重新啟動背景執行緒）：這支手機的 GPU 算錯過，直接用 CPU，不用再對一次
    const before = await reps(page);
    await page.evaluate(() => {
        const select = document.getElementById('modelLive');
        select.value = 'yolo-s';
        select.dispatchEvent(new Event('change'));
    });
    await page.waitForFunction(() => /已就緒（YOLO26s 模型）/.test(document.getElementById('modelStatus').textContent), null, { timeout: 60000 });
    w = await yoloWorker(page);
    assert.deepEqual(w.compiles, ['wasm'], '換模型後只編譯 CPU');
    await page.waitForFunction(n => Number(document.getElementById('hudReps').textContent) >= n + 2, before, { timeout: 60000 });
    assert.match(await perfDetail(page), /^CPU：GPU 算出來的和 CPU 對不起來，改用 CPU（背景運算）/);
    assert.deepEqual(page.errors, []);
    await context.close();
});

test('GPU 算得對：前 3 格有人的畫面和 CPU 對過答案，之後只用 GPU；運算標籤寫「和 CPU 對過答案」；深蹲 4 下', async () => {
    const { context, page } = await open(browser, SQUAT, { ...PHONE, yoloGpu: 'ok' });
    await startYolo(page);
    await page.waitForFunction(() => document.getElementById('hudReps').textContent === '4', null, { timeout: 120000 });
    assert.match(await page.textContent('#perfBtn'), /^GPU/);
    assert.match(await perfDetail(page), /^GPU：WebGPU（量過：GPU 每格 \d+ 毫秒、CPU \d+ 毫秒），和 CPU 對過答案（背景運算）/);
    const w = await yoloWorker(page);
    assert.deepEqual(w.compiles, ['wasm', 'webgpu:fp32']);
    assert.equal(w.runs.CPU, 3, 'CPU 只算了對答案的 3 格');
    assert.ok(w.runs.GPU > 100, 'GPU 算了每一格：' + w.runs.GPU);
    assert.deepEqual(page.errors, []);
    await context.close();
});
