// 「每一下」圖表要畫的數字（10/27）：首頁的運動總結和重播分析用同一套，畫面上的數字才會一樣
// 這裡只算數字，畫圖在 js/ui/rep-chart.js
// 和總結（session.js 的 summarize）一致：角度四捨五入到整數、每下秒數到小數第 1 位、棒式的秒數無條件捨去
import { PUSHUP_CONFIG, LUNGE_CONFIG } from './workouts.js';
import { SQUAT } from './squat.js';
import { errorName, PAUSE_REP } from './session.js';
import { errorRule } from './form.js';

// 每個計次動作「到位」「再低一點」的門檻：和計次時判斷深度用的一樣（js/analysis/reps.js 的 depthOf）
// joint：圖表標題寫「最低的膝蓋角度」還是「手肘」
export const DEPTH_LINES = {
    squat: { good: SQUAT.GOOD, close: SQUAT.CLOSE, joint: '膝蓋' },
    pushup: { good: PUSHUP_CONFIG.good, close: PUSHUP_CONFIG.close, joint: '手肘' },
    lunge: { good: LUNGE_CONFIG.good, close: LUNGE_CONFIG.close, joint: '膝蓋' }
};
const DEPTHS = ['good', 'close', 'shallow'];
const isNum = v => typeof v === 'number' && Number.isFinite(v);
// 動作穩定度（stability.js）的數字：在範圍裡才用（被改壞的是 null）；重心前後晃動是 %（小腿長 100%），棒式是度
const within = (v, lo, hi) => (isNum(v) && v >= lo && v <= hi ? v : null);

// 錯誤：只留這個動作認得的（重播分析讀的是檔案，可能被改過；constructor 這種名字不能拿去查）
function errorNames(workoutId, list) {
    return Array.isArray(list) ? list.filter(id => typeof id === 'string' && errorRule(workoutId, id)).map(errorName) : [];
}

// workoutId：動作代號；items：計次的動作是每一下 { min, depth, start, end, errors }（秒），棒式是每一次 { seconds, errors }
// 回傳 null（不是計次或棒式、沒有可以畫的）或
//   計次：{ kind: 'reps', joint, good, close, reps: [{ n, angle, depth, seconds, errors, similarity }], tempo }
//   similarity：和示範動作相似幾分（0～100 的整數；沒有算、或被改壞的是 null），疲勞分析（fatigue.js）用
//   start、end：這一下開始、結束是第幾秒（壞掉的是 null），疲勞分析找中途休息用
//   stalls：中途卡住幾次（fluency.js；這個動作不看、或被改壞的是 null），動作流暢度用
//   sway：重心前後晃動（%，stability.js；這個動作不看、格數不夠、或被改壞的是 null），動作穩定度用
//   棒式：{ kind: 'hold', holds: [{ n, seconds, errors, sway, swayFront, swayBack, levelFront, levelBack }] }（髖部晃動、位置，度，見 stability.js）
// n 是第幾下（照原本的順序；數字壞掉的那一下不畫，但後面的編號不變，和重播分析的表格對得起來）
// tempo：平均每下幾秒，和總結的「每下約 2.3 秒」同一個算法（先平均再四捨五入；中途停住超過 10 秒的不算，見 session.js 的 PAUSE_REP）
export function repSeries(workoutId, items) {
    if (!Array.isArray(items) || !items.length) return null;
    if (workoutId === 'plank') {
        const holds = [];
        items.forEach((h, i) => {
            if (h && isNum(h.seconds) && h.seconds >= 0) {
                holds.push({ n: i + 1, seconds: Math.floor(h.seconds), errors: errorNames(workoutId, h.errors),
                    sway: within(h.sway, 0, 90), swayFront: within(h.swayFront, 0, 90), swayBack: within(h.swayBack, 0, 90),
                    levelFront: within(h.levelFront, -90, 90), levelBack: within(h.levelBack, -90, 90) });
            }
        });
        return holds.length ? { kind: 'hold', holds } : null;
    }
    const lines = Object.prototype.hasOwnProperty.call(DEPTH_LINES, workoutId) ? DEPTH_LINES[workoutId] : null;
    if (!lines) return null;
    const reps = [];
    const raw = [];
    items.forEach((r, i) => {
        if (!r || !isNum(r.min) || r.min < 0 || r.min > 180) return;
        const angle = Math.round(r.min);
        const depth = DEPTHS.includes(r.depth) ? r.depth : angle <= lines.good ? 'good' : angle <= lines.close ? 'close' : 'shallow';
        const ok = isNum(r.start) && isNum(r.end) && r.end >= r.start;
        if (ok) raw.push(r.end - r.start);
        const similarity = isNum(r.similarity) && r.similarity >= 0 && r.similarity <= 100 ? Math.round(r.similarity) : null;
        reps.push({ n: i + 1, angle, depth, seconds: ok ? Math.round((r.end - r.start) * 10) / 10 : null, errors: errorNames(workoutId, r.errors), similarity,
            start: ok ? r.start : null, end: ok ? r.end : null,
            stalls: Number.isInteger(r.stalls) && r.stalls >= 0 && r.stalls <= 99 ? r.stalls : null,
            sway: within(r.sway, 0, 100) });
    });
    if (!reps.length) return null;
    const normal = raw.filter(d => Math.round(d * 10) / 10 <= PAUSE_REP);
    const use = normal.length ? normal : raw;
    const tempo = use.length ? Math.round(use.reduce((a, b) => a + b, 0) / use.length * 10) / 10 : null;
    return { kind: 'reps', joint: lines.joint, good: lines.good, close: lines.close, reps, tempo };
}
