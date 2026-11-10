// 總體檢（11/10）：同一批畫面給不同版本的 MediaPipe 算，比骨架座標、關節角度、速度
// 用法：node mp_compare.mjs [lite|full] [CPU|GPU]
import { writeFileSync } from 'node:fs';
const W = '/home/user/claude-workspace';
const H = await import(W + '/tests/browser/harness.mjs');
const { computeAngles } = await import(W + '/js/analysis/angles.js');
const ROOT = new URL('../mpver/', import.meta.url).pathname;
const model = process.argv[2] || 'lite', delegate = process.argv[3] || 'CPU';
const site = await H.serve(ROOT), browser = await H.launch();
const VERS = ['1.0.1', '1.0.1', '1.1.1', '1.2.0', '1.2.2'];   // 1.0.1 跑兩次：同一版自己和自己差多少（雜訊）
const out = [];
for (const v of VERS) {
    const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
    const errs = []; page.on('pageerror', e => errs.push(String(e))); page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
    await page.goto(site.base + 'compare.html?v=' + v + '&model=' + model + '&delegate=' + delegate);
    await page.waitForFunction(() => typeof window.run === 'function', null, { timeout: 20000 });
    let r;
    try { r = await page.evaluate(() => window.run()); } catch (e) { r = { ver: v, error: String(e).slice(0, 300) }; }
    r.errs = errs.slice(0, 3);
    out.push(r);
    await page.close();
}
await browser.close(); await site.close();
const med = a => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];
const WPX = 640, HPX = 480;
const toLm = f => f.lm.map(p => ({ x: p[0], y: p[1], z: p[2], visibility: p[3] }));
function diff(a, b) {
    let sum = 0, n = 0, max = 0, ang = { n: 0, sum: 0, max: 0 }, visMax = 0, missing = 0;
    for (let i = 0; i < a.frames.length; i++) {
        const fa = a.frames[i], fb = b.frames[i];
        if (!fa.lm || !fb.lm) { if (!!fa.lm !== !!fb.lm) missing++; continue; }
        for (let k = 0; k < 33; k++) {
            const d = Math.hypot((fa.lm[k][0] - fb.lm[k][0]) * WPX, (fa.lm[k][1] - fb.lm[k][1]) * HPX);
            sum += d; n++; if (d > max) max = d;
            visMax = Math.max(visMax, Math.abs(fa.lm[k][3] - fb.lm[k][3]));
        }
        const A = computeAngles(toLm(fa), WPX, HPX), B = computeAngles(toLm(fb), WPX, HPX);
        for (const key of Object.keys(A)) if (A[key] !== null && B[key] !== null) { const d = Math.abs(A[key] - B[key]); ang.sum += d; ang.n++; if (d > ang.max) ang.max = d; }
    }
    return { 平均差像素: +(sum / Math.max(1, n)).toFixed(3), 最大差像素: +max.toFixed(2), 角度平均差: +(ang.sum / Math.max(1, ang.n)).toFixed(3), 角度最大差: +ang.max.toFixed(2), 看得到的程度最大差: +visMax.toFixed(3), 有沒有人不一樣的格數: missing };
}
console.log('模型 ' + model + '、' + delegate);
for (const r of out) console.log(r.ver, r.error ? '錯誤：' + r.error : '建立 ' + Math.round(r.createMs) + ' 毫秒；每格中位數 ' + med(r.times.slice(10)).toFixed(1) + ' 毫秒；有人的格數 ' + r.frames.filter(f => f.lm).length + '／150；presence ' + (r.frames.find(f => f.lm)?.lm[0][4]) + '；' + r.wasm.split('/').pop(), r.errs.length ? JSON.stringify(r.errs) : '');
const base = out[0];
for (const r of out.slice(1)) if (!r.error && !base.error) console.log('1.0.1 對 ' + r.ver + '：', JSON.stringify(diff(base, r)));
// 後 50 格畫面不動：點還在不在動（平滑處理有沒有漂移）
for (const r of out) if (!r.error) {
    let drift = 0;
    for (let k = 0; k < 33; k++) drift = Math.max(drift, Math.hypot((r.frames[149].lm[k][0] - r.frames[120].lm[k][0]) * WPX, (r.frames[149].lm[k][1] - r.frames[120].lm[k][1]) * HPX));
    console.log(r.ver + ' 畫面不動後第 120 → 149 格，點最多移動 ' + drift.toFixed(3) + ' 像素');
}
writeFileSync(new URL('../mp_compare_' + model + '_' + delegate + '.json', import.meta.url), JSON.stringify(out.map(r => ({ ...r, frames: undefined }))));
