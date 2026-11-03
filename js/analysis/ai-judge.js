// AI 判斷（11/4，計畫書研究目標 3）：網站裡的 AI 模型（ai-model.js，tools/train.mjs 訓練的 Random Forest）猜每一下是做對、
// 還是哪一種錯，和規則的判斷並排（重播分析的「動作分析」、實測報表的「AI 模型的資料」）
// 現在的模型是用合成資料（示範動畫的火柴人）訓練的示範：真人的實測檔來了，用 tools/train.mjs --cv --module 重新訓練、換掉 ai-model.js
// 規則的判斷也用一樣的說法（做對，或一種錯），兩邊才比得起來；tools/evaluate.mjs（訓練時比較）也用這裡的 ruleJudge
import MODELS from './ai-model.js';
import { predictModel } from './forest.js';
import { itemFeatures } from './features.js';
import { errorRule, errorShort } from './form.js';
import { isWorkout } from './workouts.js';

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
