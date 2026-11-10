// 伏地挺身：不用網站的計次，自己數手肘「伸直 → 彎下去 → 再伸直」幾次（趴著的時候），和網站數到的比
//   嚴格：≥150° → ≤120° → ≥150°（和網站的門檻一樣）；寬鬆：≥140° → ≤110° → ≥140°（彎得比較少也算）
//   手肘角度用左右兩邊看得到的那一邊（都看得到用比較清楚的），看不到的格子跳過；也記看不到手肘的時間
// 用法：node dips.mjs <資料夾>
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
const W = '/home/user/claude-workspace';
const { parseRecording, analyzeRecording } = await import(W + '/js/data/replay-core.js');
const { PosePipeline } = await import(W + '/js/skeleton/pipeline.js');
const { bodyTilt } = await import(W + '/js/analysis/reps.js');
function count(series, up, down) {
    let state = 'wait', n = 0, times = [], start = null;
    for (const [t, v] of series) {
        if (state !== 'bent' && v >= up) { state = 'top'; start = t; }
        else if (state === 'top' && v <= down) state = 'bent';
        else if (state === 'bent' && v >= up) { n++; times.push(start.toFixed(1)); state = 'top'; start = t; }
    }
    return { n, times };
}
for (const name of readdirSync(process.argv[2]).filter(f => f.endsWith('.json')).sort()) {
    const parsed = parseRecording(readFileSync(join(process.argv[2], name), 'utf8'));
    const m = parsed.meta;
    if (m.workout !== 'pushup') continue;
    const pipeline = new PosePipeline(), w = m.videoWidth, h = m.videoHeight, t0 = parsed.frames[0].t;
    const series = []; let lying = 0, lyingNoElbow = 0;
    for (const f of parsed.frames) {
        const p = pipeline.process(f.raw, f.t, w, h);
        if (!p) continue;
        const tilt = bodyTilt(p.landmarks, w, h);
        if (tilt === null || tilt > 45) continue;
        lying++;
        const l = p.angles.LEFT_ELBOW, r = p.angles.RIGHT_ELBOW;
        const v = r ?? l;
        if (v === null || v === undefined) { lyingNoElbow++; continue; }
        series.push([(f.t - t0) / 1000, v]);
    }
    const out = await analyzeRecording(parsed, w, h, { workout: 'pushup' });
    const strict = count(series, 150, 120), loose = count(series, 140, 110);
    console.log(name.slice(5, 20) + '：網站數到 ' + out.reps.length + ' 下；自己數（嚴格）' + strict.n + ' 下、（寬鬆）' + loose.n + ' 下；趴著 ' + (lying / 22).toFixed(0) + ' 秒左右，其中看不到手肘 ' + Math.round(lyingNoElbow / Math.max(1, lying) * 100) + '%'
        + '\n   網站：' + out.reps.map(r => r.start.toFixed(1)).join(' ') + '\n   嚴格：' + strict.times.join(' ') + '\n   寬鬆：' + loose.times.join(' '));
}
