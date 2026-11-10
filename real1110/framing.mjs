// 趴著（身體和地面夾角 ≤ 45°）的格子裡，手肘、手腕、肩膀、頭、腳踝：在畫面外（x、y 超出 0～1）、在畫面內但看不清楚、看得到 各幾成
// 用法：node framing.mjs <資料夾>
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
const W = '/home/user/claude-workspace';
const { parseRecording } = await import(W + '/js/data/replay-core.js');
const { P, isVisible } = await import(W + '/js/skeleton/landmarks.js');
const { bodyTilt } = await import(W + '/js/analysis/reps.js');
const parts = { 頭: [P.NOSE], 肩: [P.LEFT_SHOULDER, P.RIGHT_SHOULDER], 手肘: [P.LEFT_ELBOW, P.RIGHT_ELBOW], 手腕: [P.LEFT_WRIST, P.RIGHT_WRIST], 腳踝: [P.LEFT_ANKLE, P.RIGHT_ANKLE] };
for (const name of readdirSync(process.argv[2]).filter(f => f.endsWith('.json')).sort()) {
    const parsed = parseRecording(readFileSync(join(process.argv[2], name), 'utf8'));
    const m = parsed.meta;
    if (!['pushup', 'plank'].includes(m.workout)) continue;
    let lyingN = 0; const stat = {};
    for (const k of Object.keys(parts)) stat[k] = { out: 0, dim: 0, ok: 0 };
    const xs = [];
    for (const f of parsed.frames) {
        if (!f.raw) continue;
        const tilt = bodyTilt(f.raw, m.videoWidth, m.videoHeight);
        if (tilt === null || tilt > 45) continue;
        lyingN++;
        for (const [k, ids] of Object.entries(parts)) {
            // 兩邊取比較好的那一邊（側面拍時近的那一邊）
            const best = ids.map(i => f.raw[i]).map(q => (q.x < 0 || q.x > 1 || q.y < 0 || q.y > 1) ? 0 : isVisible(q) ? 2 : 1).reduce((a, b) => Math.max(a, b), 0);
            stat[k][['out', 'dim', 'ok'][best]]++;
        }
        const head = f.raw[P.NOSE], ank = f.raw[P.LEFT_ANKLE];
        xs.push([head.x, ank.x]);
    }
    const pc = v => Math.round(v / Math.max(1, lyingN) * 100) + '%';
    const span = xs.length ? xs.reduce((a, [h, k]) => a + Math.abs(h - k), 0) / xs.length : 0;
    console.log(name.slice(5, 20) + ' ' + m.workout + '：趴著 ' + lyingN + ' 格（' + Math.round(lyingN / parsed.frames.length * 100) + '%），頭到腳踝平均占畫面寬 ' + Math.round(span * 100) + '%');
    for (const [k, s] of Object.entries(stat)) console.log('   ' + k.padEnd(3) + ' 看得到 ' + pc(s.ok) + '、畫面內但看不清楚 ' + pc(s.dim) + '、在畫面外 ' + pc(s.out));
}
