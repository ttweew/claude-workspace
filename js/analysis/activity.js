// AI 自動辨識動作（11/8）：看最近 3 秒的骨架，AI 模型猜你在做哪一個動作（站著、深蹲、伏地挺身、棒式、弓箭步）
// 首頁自由模式寫出猜的動作、一鍵切換過去；重播分析寫出這段錄影 AI 猜是什麼動作
// 模型和 ai-judge.js 同一套 Random Forest（forest.js），模型檔 activity-model.js 是 tools/train-activity.mjs 用合成的火柴人
// （示範動畫）訓練的示範；真人的錄製檔來了用同一個指令重新訓練
//
// 為什麼看「一段時間」：一格看不出深蹲和站著（深蹲站直的那一格和站著一樣），要看膝蓋有沒有一直彎下去又起來
// 為什麼是 3 秒：合成資料一下（下去、停、起來、站直休息）是 2.5～4 秒，3 秒裡一定看得到一部分的動作。
// 11/7 試過（A～H 訓練、沒看過的合成受測者 I、J、K 測試）：1 秒 1734／1814 段（96%：兩下之間站直休息的那段，
// 深蹲、弓箭步被猜成站著 67 段，伏地挺身撐著的那段被猜成棒式 13 段）、2 秒 1616／1617、3 秒 1492／1492。
// 真人一下可能更慢，用 3 秒；代價是換動作之後約 1.5～3 秒才跟著換
import { P, isVisible } from '../skeleton/landmarks.js';
import { predictModel } from './forest.js';
import MODEL from './activity-model.js';

// 猜的種類（模型檔的 classes 也是這個順序）和中文
export const ACTIVITIES = ['stand', 'squat', 'pushup', 'plank', 'lunge'];
export const ACTIVITY_NAMES = { stand: '站著', squat: '深蹲', pushup: '伏地挺身', plank: '棒式', lunge: '弓箭步' };
export const WINDOW_MS = 3000;   // 看最近 3 秒
export const STEP_MS = 500;      // 每 0.5 秒猜一次（每一格都猜沒有必要：3 秒裡只多了一格，猜的結果幾乎一樣）
const MIN_SPAN = 0.9;            // 這一段至少有 2.7 秒的資料（剛開鏡頭的前 2.7 秒不猜）
const MIN_PRESENT = 0.7;         // 這一段至少 7 成的格子看得到人

// 模型用的特徵（順序就是模型檔的 features）
//   tilt：身體（肩膀中間 → 髖部中間）和垂直線差幾度：站著約 0°、趴著約 70～90°；tiltRange：這段時間變了多少
//   knee、hip、elbow：膝、髖、手肘角度（左右平均）的平均、最小、這段時間變了多少（最大 − 最小）
//   kneeDiff、hipDiff：左右差幾度（弓箭步前腳、後腳的髖差很多）
//   hipMove、shoulderMove：髖部、肩膀上下移動多少（除以身體長度：離鏡頭遠近不影響）
//   spread：兩腳踝前後（畫面左右）分開多遠（除以身體長度；弓箭步約 1 倍以上，深蹲、伏地挺身、棒式兩腳併在一起）
export const ACTIVITY_FEATURES = ['tilt', 'tiltRange', 'knee', 'kneeMin', 'kneeRange', 'hip', 'hipMin', 'hipRange',
    'elbow', 'elbowMin', 'elbowRange', 'kneeDiff', 'hipDiff', 'hipMove', 'shoulderMove', 'spread'];

const round1 = v => Math.round(v * 10) / 10;
const round3 = v => Math.round(v * 1000) / 1000;
const finite = v => typeof v === 'number' && Number.isFinite(v);

// 左右兩邊的平均（只有一邊看得到就用那一邊）、左右差（兩邊都看得到才算）
function pair(angles, joint) {
    const l = angles['LEFT_' + joint], r = angles['RIGHT_' + joint];
    const ok = [l, r].filter(finite);
    return { mean: ok.length ? ok.reduce((a, b) => a + b, 0) / ok.length : null, diff: ok.length === 2 ? Math.abs(l - r) : null };
}
// 兩個點的中間（像素）；有一個看不到就用另一個，都看不到是 null
function middle(lm, a, b, w, h) {
    const pts = [lm[a], lm[b]].filter(q => q && isVisible(q)).map(q => ({ x: q.x * w, y: q.y * h }));
    if (!pts.length) return null;
    return { x: pts.reduce((s, q) => s + q.x, 0) / pts.length, y: pts.reduce((s, q) => s + q.y, 0) / pts.length };
}

// 一格的數字：p 是 js/skeleton/pipeline.js 的結果 { landmarks, angles, width, height }；看不到身體（肩膀、髖部）時 null
export function frameValues(p) {
    if (!p || !Array.isArray(p.landmarks) || p.landmarks.length < 33 || !p.angles) return null;
    const w = p.width > 0 ? p.width : 1, h = p.height > 0 ? p.height : 1;
    const lm = p.landmarks;
    const shoulder = middle(lm, P.LEFT_SHOULDER, P.RIGHT_SHOULDER, w, h);
    const hip = middle(lm, P.LEFT_HIP, P.RIGHT_HIP, w, h);
    if (!shoulder || !hip) return null;
    const body = Math.hypot(shoulder.x - hip.x, shoulder.y - hip.y);
    if (!(body > 0)) return null;
    const knee = pair(p.angles, 'KNEE'), hipAngle = pair(p.angles, 'HIP'), elbow = pair(p.angles, 'ELBOW');
    const la = lm[P.LEFT_ANKLE], ra = lm[P.RIGHT_ANKLE];
    const spread = la && ra && isVisible(la) && isVisible(ra) ? Math.abs(la.x - ra.x) * w / body : null;
    return {
        // 畫面的 y 往下：肩膀在髖部上面時 shoulder.y − hip.y 是負的
        tilt: Math.atan2(Math.abs(shoulder.x - hip.x), hip.y - shoulder.y) * 180 / Math.PI,
        knee: knee.mean, hip: hipAngle.mean, elbow: elbow.mean,
        kneeDiff: knee.diff, hipDiff: hipAngle.diff,
        hipY: hip.y, shoulderY: shoulder.y, body, spread
    };
}

// 一段時間的特徵：samples 是 [{ t（毫秒）, v（frameValues 的結果或 null） }]，照時間排好
// 資料不夠（不到 2.7 秒、看得到人的格子不到 7 成）回傳 null；看不到的數字（例如整段都看不到手肘）是 null
export function windowFeatures(samples) {
    if (!Array.isArray(samples) || samples.length < 2) return null;
    const span = samples[samples.length - 1].t - samples[0].t;
    if (!(span >= WINDOW_MS * MIN_SPAN)) return null;
    const seen = samples.filter(s => s && s.v);
    if (seen.length < samples.length * MIN_PRESENT) return null;
    const list = key => seen.map(s => s.v[key]).filter(finite);
    const mean = a => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
    const min = a => (a.length ? Math.min(...a) : null);
    const range = a => (a.length ? Math.max(...a) - Math.min(...a) : null);
    const body = mean(list('body'));
    const move = key => { const r = range(list(key)); return r === null || !(body > 0) ? null : round3(r / body); };
    const out = {};
    const r1 = v => (v === null ? null : round1(v));
    for (const key of ['tilt', 'knee', 'hip', 'elbow']) {
        const a = list(key);
        out[key] = r1(mean(a));
        if (key !== 'tilt') out[key + 'Min'] = r1(min(a));
        out[key + 'Range'] = r1(range(a));
    }
    out.kneeDiff = r1(mean(list('kneeDiff')));
    out.hipDiff = r1(mean(list('hipDiff')));
    out.hipMove = move('hipY');
    out.shoulderMove = move('shoulderY');
    const spread = mean(list('spread'));
    out.spread = spread === null ? null : round3(spread);
    return Object.fromEntries(ACTIVITY_FEATURES.map(k => [k, out[k]]));
}

// 模型檔被改壞（不是這個格式）就不猜
const valid = m => !!m && m.type === 'random-forest' && m.version === 1 && m.task === 'activity' && Array.isArray(m.trees) && m.trees.length > 0
    && Array.isArray(m.features) && m.features.join() === ACTIVITY_FEATURES.join() && Array.isArray(m.classes) && m.classes.join() === ACTIVITIES.join();
export const hasActivityModel = () => valid(MODEL);
// 模型的來歷（畫面上寫出來）：synthetic（用合成資料訓練的）
export const ACTIVITY_MODEL = { synthetic: !!MODEL && MODEL.synthetic === true };

// 一段時間的特徵 → { label, confidence（投這一種的比例 0～1） }；沒有模型、特徵是 null 時回傳 null
export function guessActivity(features, model = MODEL) {
    if (!valid(model) || !features || typeof features !== 'object') return null;
    const { label, probs } = predictModel(model, features);
    return { label, confidence: Math.max(...probs) };
}

// 一格一格餵進來，每 0.5 秒猜一次（首頁、重播分析同一套，同一個錄影猜的一樣）
export class ActivityMeter {
    constructor(model = MODEL) {
        this.model = model;
        this.reset();
    }

    reset() {
        this.samples = [];
        this.next = -Infinity;
    }

    // p：pipeline.process 的結果（沒有人時 null）；timeMs：這一格的時間
    // 回傳 undefined：這一格不猜（還沒到 0.5 秒）；null：資料不夠；不然最近 3 秒的特徵（訓練時也用這個，和網站取的段一樣）
    features(p, timeMs) {
        if (!finite(timeMs)) return undefined;
        // 時間倒退（例如兩份錄製檔接在一起）：重新開始
        if (this.samples.length && timeMs < this.samples[this.samples.length - 1].t) this.reset();
        this.samples.push({ t: timeMs, v: frameValues(p) });
        while (this.samples.length > 1 && timeMs - this.samples[0].t > WINDOW_MS) this.samples.shift();
        if (timeMs < this.next) return undefined;
        this.next = timeMs + STEP_MS;
        return windowFeatures(this.samples);
    }

    // 同上，再猜：undefined 這一格不猜；null 猜不出來（資料不夠、沒有模型）；不然 { label, confidence, features }
    update(p, timeMs) {
        const features = this.features(p, timeMs);
        if (features === undefined) return undefined;
        const guess = features ? guessActivity(features, this.model) : null;
        return guess ? { ...guess, features } : null;
    }
}

// 畫面上的猜測（首頁）：同一個動作連續猜到 2 次（1 秒）才換上去，免得在兩個動作之間跳來跳去；
// 把握不到 6 成時寫「還不確定」。回傳 { label（null：還不確定）, confidence }，看不到人、資料不夠時 null
export const SURE = 0.6;
export class ActivityDisplay {
    constructor() {
        this.reset();
    }

    reset() {
        this.shown = null;
        this.pending = null;
        this.count = 0;
    }

    // guess：ActivityMeter.update 的結果（undefined：這一格沒有猜，畫面不變）
    update(guess) {
        if (guess === undefined) return this.shown;
        if (guess === null) {
            this.reset();
            return null;
        }
        const label = guess.confidence >= SURE ? guess.label : null;
        if (this.shown && label === this.shown.label) {
            this.shown = { label, confidence: guess.confidence };
            this.pending = null;
            this.count = 0;
            return this.shown;
        }
        this.count = this.pending === label ? this.count + 1 : 1;
        this.pending = label;
        if (!this.shown || this.count >= 2) {
            this.shown = { label, confidence: guess.confidence };
            this.pending = null;
            this.count = 0;
        }
        return this.shown;
    }
}

// 一段錄影（重播分析）：每 0.5 秒猜的結果統計成「各猜幾秒」，最多的在前面（站著放最後：沒在做動作）
// guesses：[{ label, confidence } 或 null]；回傳 { total（秒）, list: [{ label, seconds }], top（最多的動作，不算站著；沒有時 null） }
export function activitySummary(guesses) {
    const counts = new Map(ACTIVITIES.map(a => [a, 0]));
    let total = 0;
    for (const g of Array.isArray(guesses) ? guesses : []) {
        if (!g || !counts.has(g.label) || !(g.confidence >= SURE)) continue;
        counts.set(g.label, counts.get(g.label) + 1);
        total++;
    }
    const list = ACTIVITIES.map(label => ({ label, seconds: counts.get(label) * STEP_MS / 1000 })).filter(x => x.seconds > 0)
        .sort((a, b) => (a.label === 'stand') - (b.label === 'stand') || b.seconds - a.seconds);
    const moving = list.filter(x => x.label !== 'stand');
    return { total: total * STEP_MS / 1000, list, top: moving.length ? moving[0].label : null };
}
