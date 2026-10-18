// 動作相似度：每一下的角度曲線（例如深蹲的膝蓋角度從站直 → 蹲下 → 站直）和標準動作的曲線比對，給 0～100 分
//
// 用「動態時間校正」（DTW，Dynamic Time Warping）：兩條曲線快慢不同也能對齊，
//   例如標準動作 2.4 秒一下、使用者 4 秒一下，DTW 會把「蹲到最低」對到「蹲到最低」再比角度差，不會因為比較慢就扣分
// 分數：對齊後平均每一點差幾度，差 0° 是 100 分，每差 1° 扣 2.5 分（平均差 4° 約 90 分、12° 約 70 分、40° 以上 0 分）
// 對齊時最多偏移一下的 20%（Sakoe-Chiba 限制）：底部停久一點、上下快慢不同都對得起來，但蹲得淺不能靠「拉長對齊」混過去
//   實測（合成曲線）：標準深蹲約 97 分、底部停 2 秒約 96 分、最低 100° 約 89 分、110° 約 82 分、125° 約 69 分
// 標準曲線取自示範動畫（js/ui/demo.js）的標準姿勢，和使用者看到的示範一樣
// 這是可以講得出原理的「智慧分析」：不用訓練資料，結果可以解釋（哪裡差、差幾度）

import { POSES, angleAt } from '../ui/demo.js';

export const SIMILARITY = { points: 40, perDegree: 2.5, window: 0.2 };

// 曲線重新取樣成 n 點（依時間平均分配）；samples：[{ t, v }]
export function resample(samples, n = SIMILARITY.points) {
    if (samples.length < 2) return samples.map(s => s.v);
    const t0 = samples[0].t, t1 = samples[samples.length - 1].t;
    const out = [];
    let j = 0;
    for (let i = 0; i < n; i++) {
        const t = t0 + (t1 - t0) * i / (n - 1);
        while (j < samples.length - 2 && samples[j + 1].t < t) j++;
        const a = samples[j], b = samples[j + 1];
        const f = b.t === a.t ? 0 : Math.min(1, Math.max(0, (t - a.t) / (b.t - a.t)));
        out.push(a.v + (b.v - a.v) * f);
    }
    return out;
}

// DTW：兩條曲線對齊後，平均每一點差幾度（路徑上的差距總和 ÷ 路徑長度）
// window：對齊時最多偏移幾點（限制太離譜的對齊，也比較快）
export function dtw(a, b, window = Math.ceil(Math.max(a.length, b.length) * SIMILARITY.window)) {
    const n = a.length, m = b.length;
    if (!n || !m) return null;
    const w = Math.max(window, Math.abs(n - m));
    const INF = Infinity;
    // cost[i][j]：對齊到 a[i]、b[j] 為止的最小總差距；len[i][j]：那條路徑的長度
    let prevCost = new Float64Array(m + 1).fill(INF), prevLen = new Float64Array(m + 1);
    prevCost[0] = 0;
    for (let i = 1; i <= n; i++) {
        const cost = new Float64Array(m + 1).fill(INF), len = new Float64Array(m + 1);
        const lo = Math.max(1, i - w), hi = Math.min(m, i + w);
        for (let j = lo; j <= hi; j++) {
            const d = Math.abs(a[i - 1] - b[j - 1]);
            // 三個方向取總差距最小的（同樣小時取路徑短的）
            let best = prevCost[j - 1], bl = prevLen[j - 1];
            if (prevCost[j] < best) { best = prevCost[j]; bl = prevLen[j]; }
            if (cost[j - 1] < best) { best = cost[j - 1]; bl = len[j - 1]; }
            cost[j] = best + d;
            len[j] = bl + 1;
        }
        prevCost = cost;
        prevLen = len;
    }
    return prevCost[m] / prevLen[m];
}

export function score(meanDiff) {
    if (meanDiff === null || !Number.isFinite(meanDiff)) return null;
    return Math.max(0, Math.min(100, Math.round(100 - meanDiff * SIMILARITY.perDegree)));
}

// ---------- 標準曲線（示範動畫的一下：往下 → 停一下 → 往上） ----------
const ease = t => t * t * (3 - 2 * t);
function standardRep(angleOf) {
    const out = [];
    const DOWN = 13, HOLD = 4, UP = 13;   // 和示範動畫的節奏比例相同（往下 1.3 秒、停 0.4 秒、往上 1.3 秒）
    for (let i = 0; i <= DOWN; i++) out.push(angleOf(ease(i / DOWN)));
    for (let i = 0; i < HOLD; i++) out.push(angleOf(1));
    for (let i = UP; i >= 0; i--) out.push(angleOf(ease(i / UP)));
    return resample(out.map((v, i) => ({ t: i, v })));
}
const knee = pose => { const [, hip, k, ankle] = pose.lines[0]; return angleAt(hip, k, ankle); };
export const TEMPLATES = {
    squat: standardRep(d => knee(POSES.squat(d))),
    pushup: standardRep(d => { const [sh, el, hand] = POSES.pushup(d).lines[1]; return angleAt(sh, el, hand); }),
    lunge: standardRep(d => {
        const p = POSES.lunge(d);
        const [, hip, kF, f] = p.lines[0], [h2, kB, b] = p.lines[1];
        return Math.max(angleAt(hip, kF, f), angleAt(h2, kB, b));
    })
};

// 一下的相似度（0～100），沒有標準曲線（例如棒式）或點太少時回傳 null
export function repSimilarity(workoutId, samples) {
    const template = TEMPLATES[workoutId];
    if (!template || !samples || samples.length < 5) return null;
    return score(dtw(resample(samples), template));
}
