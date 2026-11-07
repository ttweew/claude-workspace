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

// 這一下的特徵（itemFeatures 或資料表的 features）→ { label（'good' 或錯誤代號）, confidence（投這一種的比例 0～1） }；
// 沒有這個動作的模型回傳 null
export function aiJudgeFeatures(workoutId, features) {
    if (!hasAiModel(workoutId)) return null;
    const { label, probs } = predictModel(BY_WORKOUT.get(workoutId), features);
    return { label, confidence: Math.max(...probs) };
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
