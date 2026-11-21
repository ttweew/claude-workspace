// 兩個模型對照（11/21，讓使用者自己選模型的第 4 步）：同一段影片的同一批畫面，兩個模型各算一次
// （js/data/replay-core.js 的 analyzeRecording 結果，和重播分析同一套），比次數、每一下最低角度、錯誤、每個關節的角度差多少
// 不碰畫面，node 直接測（tests/model-compare.test.mjs）；畫面在 js/pages/compare.js
//
// 為什麼要對照：YOLO 對被身體擋住的那一側也很有把握（11/21 側拍伏地挺身：YOLO 約 0.9、MediaPipe 約 0.6），
// 兩個模型的角度可能差 10° 以上；同一段影片並排看，才知道差在哪、門檻要不要分模型訂（第 5 階段的校正）

import { ANGLE_KEYS } from '../data/replay-core.js';

// 每個動作主要看哪些關節（計次、判斷錯誤用到的），左右各一；自由模式看全部
export const MAIN_JOINTS = {
    squat: ['KNEE', 'HIP'],
    lunge: ['KNEE', 'HIP'],
    pushup: ['ELBOW', 'HIP'],
    plank: ['HIP', 'KNEE'],
    free: ['KNEE', 'HIP', 'ELBOW']
};
export function jointsFor(workoutId) {
    const parts = Object.prototype.hasOwnProperty.call(MAIN_JOINTS, workoutId) ? MAIN_JOINTS[workoutId] : MAIN_JOINTS.free;
    return parts.flatMap(p => ['LEFT_' + p, 'RIGHT_' + p]);
}

// 由小到大排好的數字的第 q 分位（0～1）
function quantile(sorted, q) {
    if (!sorted.length) return NaN;
    const i = Math.min(sorted.length - 1, Math.max(0, Math.round(q * (sorted.length - 1))));
    return sorted[i];
}
const round1 = v => (Number.isFinite(v) ? Math.round(v * 10) / 10 : null);

// 一個關節的角度差（A − B）：兩個模型這一格都有人、這個角度都算得出來才比
// 回傳 { key, frames（比了幾格）, mean（平均差，正的是 A 比較大）, meanAbs（平均絕對差）, p90（9 成的格子差在幾度以內）, max }
// 數字取到小數 1 位；一格都沒得比時 frames 是 0、其他是 null
export function angleDiff(a, b, key) {
    const j = ANGLE_KEYS.indexOf(key);
    if (j < 0 || !a || !b) return { key, frames: 0, mean: null, meanAbs: null, p90: null, max: null };
    const A = ANGLE_KEYS.length;
    const n = Math.min(a.n, b.n);
    const diffs = [];
    for (let i = 0; i < n; i++) {
        if (!a.present[i] || !b.present[i]) continue;
        const x = a.angles[i * A + j], y = b.angles[i * A + j];
        if (Number.isFinite(x) && Number.isFinite(y)) diffs.push(x - y);
    }
    if (!diffs.length) return { key, frames: 0, mean: null, meanAbs: null, p90: null, max: null };
    const abs = diffs.map(Math.abs).sort((p, q) => p - q);
    return {
        key,
        frames: diffs.length,
        mean: round1(diffs.reduce((s, v) => s + v, 0) / diffs.length),
        meanAbs: round1(abs.reduce((s, v) => s + v, 0) / abs.length),
        p90: round1(quantile(abs, 0.9)),
        max: round1(abs[abs.length - 1])
    };
}

// 一個模型的結果整理成一張卡片要的數字
// 回傳 { frames, seen（偵測到人的格子 %）, reps（幾下；棒式是撐了幾次）, mins（每一下最低角度）, seconds（棒式每次撐幾秒）,
//        errors（每種錯誤幾下，{ lean: 2 }） }
export function resultSummary(r) {
    const n = r ? r.n : 0;
    let present = 0;
    for (let i = 0; i < n; i++) if (r.present[i]) present++;
    const items = r && Array.isArray(r.reps) ? r.reps : [];
    const errors = {};
    for (const item of items) {
        for (const id of Array.isArray(item.errors) ? item.errors : []) {
            if (typeof id !== 'string') continue;
            errors[id] = (Object.prototype.hasOwnProperty.call(errors, id) ? errors[id] : 0) + 1;
        }
    }
    return {
        frames: n,
        seen: n ? Math.round(present / n * 100) : 0,
        reps: items.length,
        mins: items.map(item => (Number.isFinite(item.min) ? Math.round(item.min) : null)),
        seconds: items.map(item => (Number.isFinite(item.seconds) ? Math.floor(item.seconds) : null)),
        errors
    };
}

// 兩個模型的結果並排：{ a, b（resultSummary）, joints（主要關節的角度差）, sameReps（次數一樣）, repDiffs（每一下最低角度差 A − B） }
// 每一下照順序配對（第 1 下對第 1 下）：次數不一樣時只配到少的那邊
export function compareResults(a, b, workoutId) {
    const sa = resultSummary(a), sb = resultSummary(b);
    const pairs = Math.min(sa.mins.length, sb.mins.length);
    const repDiffs = [];
    for (let i = 0; i < pairs; i++) {
        const x = sa.mins[i], y = sb.mins[i];
        repDiffs.push(x !== null && y !== null ? x - y : null);
    }
    return {
        a: sa,
        b: sb,
        joints: jointsFor(workoutId).map(key => angleDiff(a, b, key)),
        sameReps: sa.reps === sb.reps,
        repDiffs
    };
}

// 角度的中文（左膝、右肘…）：ANGLES 的第二欄；不認得的原樣
export function jointName(key, names) {
    return names && Object.prototype.hasOwnProperty.call(names, key) ? names[key] : String(key);
}
