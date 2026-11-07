// AI 判斷（11/4，計畫書研究目標 3）：網站裡的 AI 模型（ai-model.js，tools/train.mjs 訓練的 Random Forest）猜每一下是做對、
// 還是哪一種錯，和規則的判斷並排（重播分析的「動作分析」、實測報表的「AI 模型的資料」；11/7 起運動中每一下的提示、運動總結也有）
// 現在的模型是用合成資料（示範動畫的火柴人）訓練的示範：真人的實測檔來了，用 tools/train.mjs --cv --module 重新訓練、換掉 ai-model.js
// 規則的判斷也用一樣的說法（做對，或一種錯），兩邊才比得起來；tools/evaluate.mjs（訓練時比較）也用這裡的 ruleJudge
import MODELS from './ai-model.js';
import { predictModel } from './forest.js';
import { itemFeatures } from './features.js';
import { errorRule, errorShort } from './form.js';
import { isWorkout, WORKOUTS } from './workouts.js';

// 模型檔被改壞（不是這個格式）的不用：那個動作就沒有 AI 判斷
const valid = m => !!m && m.type === 'random-forest' && m.version === 1 && Array.isArray(m.trees) && m.trees.length > 0
    && Array.isArray(m.features) && Array.isArray(m.classes) && m.classes[0] === 'good' && isWorkout(m.workout);
const BY_WORKOUT = new Map((MODELS && Array.isArray(MODELS.models) ? MODELS.models : []).filter(valid).map(m => [m.workout, m]));

// 模型的來歷（畫面上寫出來）：synthetic（用合成資料訓練的）、subjects（訓練用的受測者代號）
export const AI_MODEL = {
    synthetic: !!MODELS && MODELS.synthetic === true,
    subjects: MODELS && Array.isArray(MODELS.subjects) ? MODELS.subjects.filter(s => typeof s === 'string') : []
};

export function hasAiModel(workoutId) {
    return isWorkout(workoutId) && BY_WORKOUT.has(workoutId);
}

// 這一下的特徵（itemFeatures 或資料表的 features）→ { label（'good' 或錯誤代號）, confidence（投這一種的比例 0～1）,
// good（投「做對」的比例 0～1，AI 動作評分用，11/10） }；沒有這個動作的模型回傳 null
export function aiJudgeFeatures(workoutId, features) {
    if (!hasAiModel(workoutId)) return null;
    const { label, probs } = predictModel(BY_WORKOUT.get(workoutId), features);
    return { label, confidence: Math.max(...probs), good: probs[0] };
}

// 一下（tracker 的 item：重播分析、實測報表算的）→ AI 判斷
export function aiJudge(workoutId, item) {
    return aiJudgeFeatures(workoutId, itemFeatures(workoutId, item));
}

// 規則的判斷，換成和 AI 判斷一樣的說法：沒報錯是 'good'；報了好幾種，取超過門檻最多的那種
// （特徵 ÷ 門檻，和規則量的是同一個數字、同一個單位，見 features.js；看不到數字的排後面）；不認得的錯誤代號不算
export function ruleJudge(workoutId, errors, features) {
    const list = (Array.isArray(errors) ? errors : []).filter(id => errorRule(workoutId, id));
    if (!list.length) return 'good';
    const f = features && typeof features === 'object' ? features : {};
    const ratio = id => {
        const rule = errorRule(workoutId, id);
        const v = Object.prototype.hasOwnProperty.call(f, id) ? f[id] : null;
        return typeof v === 'number' && Number.isFinite(v) && rule.why && rule.why.limit > 0 ? v / rule.why.limit : 0;
    };
    return list.reduce((best, id) => (ratio(id) > ratio(best) ? id : best));
}

// 判斷的中文：「做對」或錯誤的簡稱（「上身前傾」）
export const judgeText = label => (label === 'good' ? '做對' : errorShort(label));

// 這位受測者的資料訓練時看過（同一個代號、真人或合成也一樣）：拿來算 AI 模型準不準不公平（先看過考題，見 tools/split.mjs）
export function seenInTraining(subject, synthetic) {
    return AI_MODEL.synthetic === !!synthetic && AI_MODEL.subjects.includes(subject);
}

// 一下（tracker 的 item）：AI 模型和規則各判成什麼（做對，或哪一種錯）→ { ai: { label, confidence }, rule }；這個動作沒有模型時 null
// 首頁運動中每一下的提示（11/7）用；特徵只算一次，兩邊看的是同一組數字
export function judgeRep(workoutId, rep) {
    if (!hasAiModel(workoutId)) return null;
    const features = itemFeatures(workoutId, rep);
    return { ai: aiJudgeFeatures(workoutId, features), rule: ruleJudge(workoutId, rep && rep.errors, features) };
}

// 一組的每一下：重播分析的「動作分析」、首頁的運動總結（11/7）共用，和運動中的提示也是同一個 judgeRep，數字才會一樣
export function judgeReps(workoutId, reps) {
    if (!hasAiModel(workoutId) || !Array.isArray(reps)) return null;
    return reps.map(r => judgeRep(workoutId, r));
}

// 一下的 AI 判斷寫成「腳跟離地（93%）」：重播分析的表格、運動中的提示（11/7）同一個寫法
export const judgeCell = ai => judgeText(ai.label) + '（' + Math.round(ai.confidence * 100) + '%）';

// 一組的 AI 判斷那一句（不含句號）：AI 判成哪幾種各幾下、和規則一樣幾下、不一樣的是第幾下
// 例：「AI 判斷（示範：模型是用合成資料訓練的，不是真人）：做對 3 下、屁股太高 2 下；和規則一樣 3 下、不一樣 2 下（第 2、5 下）」
// 重播分析和首頁的運動總結共用（11/7），同一個錄製檔兩邊一字不差；沒有判斷時回傳 ''
export function aiLine(workoutId, reps, judged) {
    if (!hasAiModel(workoutId) || !Array.isArray(judged) || !judged.length || !Array.isArray(reps) || reps.length !== judged.length) return '';
    const unit = WORKOUTS[workoutId].kind === 'hold' ? '次' : '下';
    // 各判成幾下：照模型的標記順序（做對在前面）
    const model = BY_WORKOUT.get(workoutId);
    const counts = model.classes.map(label => [label, judged.filter(j => j.ai.label === label).length]).filter(([, n]) => n > 0)
        .map(([label, n]) => judgeText(label) + ' ' + n + ' ' + unit).join('、');
    const differ = judged.map((j, i) => (j.ai.label !== j.rule ? reps[i].n : null)).filter(n => n !== null);
    return 'AI 判斷（' + (AI_MODEL.synthetic ? '示範：模型是用合成資料訓練的，不是真人' : '模型用 ' + AI_MODEL.subjects.length + ' 位受測者的實測資料訓練')
        + '）：' + counts + '；和規則一樣 ' + (judged.length - differ.length) + ' ' + unit
        + (differ.length ? '、不一樣 ' + differ.length + ' ' + unit + '（第 ' + differ.join('、') + ' ' + unit + '）' : '');
}

// ---------- AI 動作評分（11/10）：每一下 0～100 分，總結寫最好、最差的一下 ----------
// 分數 = AI 覺得這一下做對的把握（投「做對」的比例）× 和示範動作有多像（相似度，DTW，0～100）
//   為什麼用乘的：做錯的那一下（AI 覺得做對的把握很低）就算蹲得很像也不該高分；做對的那幾下 AI 的把握都接近 100%，
//   靠相似度分出高低（蹲得淺、節奏怪的分數低一點）。例：做對（把握 98%）、相似 96% → 94 分；故意上身前傾（做對的把握 3%）→ 3 分
//   棒式沒有相似度（不是一下一下的角度曲線）：只看 AI 覺得做對的把握；某一下算不出相似度（太短）也一樣
// 只在畫面上（運動中的提示、總結、重播分析），不存進紀錄、不上傳；同一下在首頁和重播分析是同一個數字（同一個 AI 判斷、同一個相似度）
export function repScore(rep, ai) {
    if (!ai || typeof ai.good !== 'number' || !Number.isFinite(ai.good)) return null;
    const good = Math.min(1, Math.max(0, ai.good));
    const sim = rep && typeof rep.similarity === 'number' && Number.isFinite(rep.similarity) ? Math.min(100, Math.max(0, rep.similarity)) : null;
    return Math.round(good * (sim === null ? 100 : sim));
}

// 一組的評分那一句（不含句號）：平均幾分、最好、最差的是第幾下；一樣高（低）時寫最前面那一下
// 例：「AI 評分（每一下 0～100 分：AI 覺得做對的把握 × 和示範動作有多像）：平均 72 分；最好第 2 下 96 分、最差第 5 下 3 分」
// 重播分析和首頁的運動總結共用，同一個錄製檔兩邊一字不差；沒有判斷時回傳 ''
// 一組每一下的分數 { v（0～100）, n（第幾下）}，算不出來的不算（scoreLine、scoreAverage 共用）
// 第幾下：每一下自己的編號（和表格、提示一樣）；沒有編號（實測報表的資料）時照順序
function repScores(workoutId, reps, judged) {
    if (!hasAiModel(workoutId) || !Array.isArray(judged) || !judged.length || !Array.isArray(reps) || reps.length !== judged.length) return [];
    return judged.map((j, i) => ({ v: repScore(reps[i], j && j.ai), n: reps[i] && Number.isInteger(reps[i].n) ? reps[i].n : i + 1 })).filter(x => x.v !== null);
}
const average = scores => Math.round(scores.reduce((a, x) => a + x.v, 0) / scores.length);
// 一組的平均分數（11/8 追加 2：AI 全自動換動作時講出上一個動作的結果）；沒有模型、對不上、算不出來時 null
export function scoreAverage(workoutId, reps, judged) {
    const scores = repScores(workoutId, reps, judged);
    return scores.length ? average(scores) : null;
}

export function scoreLine(workoutId, reps, judged) {
    const scores = repScores(workoutId, reps, judged);
    if (!scores.length) return '';
    const hold = WORKOUTS[workoutId].kind === 'hold';
    const unit = hold ? '次' : '下';
    const avg = average(scores);
    const best = scores.reduce((a, x) => (x.v > a.v ? x : a)), worst = scores.reduce((a, x) => (x.v < a.v ? x : a));
    const head = 'AI 評分（每一' + unit + ' 0～100 分：' + (hold ? 'AI 覺得做對的把握' : 'AI 覺得做對的把握 × 和示範動作有多像') + '）：';
    if (scores.length === 1) return head + best.v + ' 分';
    if (best.v === worst.v) return head + '每一' + unit + '都是 ' + best.v + ' 分';
    return head + '平均 ' + avg + ' 分；最好第 ' + best.n + ' ' + unit + ' ' + best.v + ' 分、最差第 ' + worst.n + ' ' + unit + ' ' + worst.v + ' 分';
}

// ---------- AI 解釋（11/11）：AI 為什麼這樣判 ----------
// AI 的界線：這一下其他的數字不動，只把一種錯誤的數字從 0 每次加 0.1，加到多少 AI 改判成那種錯（和規則的門檻同一個單位：
// 上身前傾幾度、腳跟比站直時高幾 %…，form.js 的 why）；加到規則門檻的 3 倍還不改回傳 null
// 和 11/3 訓練時算「AI 學到的門檻」同一個做法（那時用做對的那幾下的中位數當起點，這裡用這一下自己）
// 伏地挺身、棒式的腰往下彎和屁股往上翹是同一個數字的正負（features.js），一起動，不然會試到真人做不出來的姿勢
// 不用真的試 0.1、0.2、0.3…：森林只在分岔的門檻改變判斷，只要試每個門檻旁邊的那一格（結果和一格一格試一樣，快很多）
const MIRROR = { sag: 'pike', pike: 'sag' };
export function aiLimit(workoutId, features, error) {
    if (!hasAiModel(workoutId)) return null;
    const rule = errorRule(workoutId, error);
    if (!rule || !rule.why || !(rule.why.limit > 0)) return null;
    const model = BY_WORKOUT.get(workoutId);
    const fi = model.features.indexOf(error), mi = MIRROR[error] ? model.features.indexOf(MIRROR[error]) : -1;
    if (fi < 0) return null;
    const top = Math.round(rule.why.limit * 30);   // 0.1 一格：規則門檻的 3 倍
    const grid = new Set([0]);
    const near = b => {
        const g = Math.floor(b * 10 + 1e-9);
        for (const k of [g, g + 1]) if (k >= 0 && k <= top) grid.add(k);
    };
    const walk = node => {
        if (node.p) return;
        if (node.f === fi) near(node.t);
        if (node.f === mi) near(-node.t);
        walk(node.l);
        walk(node.r);
    };
    model.trees.forEach(walk);
    const base = features && typeof features === 'object' ? features : {};
    for (const k of [...grid].sort((a, b) => a - b)) {
        const f = { ...base, [error]: k / 10 };
        if (mi >= 0) f[MIRROR[error]] = -k / 10;
        if (predictModel(model, f).label === error) return k / 10;
    }
    return null;
}

// 這一下 AI 為什麼這樣判（一句，不含句號）；這個動作沒有模型、這一下沒有判斷時 ''
//   判成某種錯：「腳跟比站直時高 21%，AI 覺得超過約 12% 就算腳跟離地（規則是 14%）」
//   判成做對：每一種錯誤的數字和 AI 的界線：「上身前傾 32°（AI 覺得超過約 41° 才算上身前傾）、腳跟比站直時高 3%（約 9%）」
// 數字是 AI 看的（每一下持續 0.4 秒的最大值，features.js），和錯誤那一欄最嚴重的那一瞬間可能差一點；寫法和紅字的原因一樣四捨五入到整數
export function explainRep(workoutId, rep, ai) {
    if (!hasAiModel(workoutId) || !ai) return '';
    const features = itemFeatures(workoutId, rep);
    const rules = BY_WORKOUT.get(workoutId).classes.slice(1).map(id => errorRule(workoutId, id)).filter(r => r && r.why);
    const n = (v, rule) => Math.round(v) + rule.why.unit;
    const value = rule => (typeof features[rule.id] === 'number' && Number.isFinite(features[rule.id]) ? features[rule.id] : null);
    if (ai.label !== 'good') {
        const rule = rules.find(r => r.id === ai.label);
        if (!rule) return '';
        const v = value(rule), limit = aiLimit(workoutId, features, rule.id);
        if (v === null) return '看不到' + rule.why.label + '，AI 是看其他數字判成' + rule.short + '的';
        return rule.why.label + ' ' + n(v, rule) + (limit === null ? '，AI 判成' + rule.short
            : '，AI 覺得超過約 ' + n(limit, rule) + ' 就算' + rule.short) + '（規則是 ' + n(rule.why.limit, rule) + '）';
    }
    return rules.map((rule, i) => {
        const v = value(rule), limit = aiLimit(workoutId, features, rule.id);
        if (v === null) return rule.why.label + '看不到';
        const tail = limit === null ? '' : i === 0 ? '（AI 覺得超過約 ' + n(limit, rule) + ' 才算' + rule.short + '）' : '（約 ' + n(limit, rule) + '）';
        return rule.why.label + ' ' + n(v, rule) + tail;
    }).join('、');
}

// AI 評分最差的那一下是第幾個（0 開始；一樣低時最前面那一下）；沒有分數時 -1
// AI 解釋（11/11）、你這一下 vs 標準動作（11/12）都畫這一下
export function worstIndex(reps, judged) {
    if (!Array.isArray(reps) || !Array.isArray(judged) || reps.length !== judged.length) return -1;
    let worst = -1, low = Infinity;
    judged.forEach((j, i) => {
        const v = repScore(reps[i], j && j.ai);
        if (v !== null && v < low) { low = v; worst = i; }
    });
    return worst;
}

// 一組的 AI 解釋那一句（不含句號）：AI 評分最差的那一下（一樣低時最前面那一下；只有一下就是那一下）為什麼這樣判
// 例：「AI 解釋（最差的第 5 下，判成腳跟離地）：腳跟比站直時高 21%，AI 覺得超過約 12% 就算腳跟離地（規則是 14%）」
// 重播分析和首頁的運動總結共用，同一個錄製檔兩邊一字不差；沒有判斷時 ''
export function explainLine(workoutId, reps, judged) {
    if (!hasAiModel(workoutId) || !Array.isArray(judged) || !judged.length || !Array.isArray(reps) || reps.length !== judged.length) return '';
    const unit = WORKOUTS[workoutId].kind === 'hold' ? '次' : '下';
    const k = worstIndex(reps, judged);
    if (k < 0) return '';
    const j = judged[k], rep = reps[k];
    const text = explainRep(workoutId, rep, j.ai);
    if (!text) return '';
    const n = rep && Number.isInteger(rep.n) ? rep.n : k + 1;
    return 'AI 解釋（' + (reps.length === 1 ? '第 ' + n + ' ' + unit : '最差的第 ' + n + ' ' + unit) + '，判成' + judgeText(j.ai.label) + '）：' + text;
}
