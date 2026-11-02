// AI 模型的資料（11/2，計畫書研究目標 3「Random Forest 品質分類」的第一步）：每一下的特徵
// 特徵是「量到的數字」，不是規則的判斷：11/3 要拿 AI 模型（Random Forest）和規則比，模型不能看規則的答案
//
// 錯誤的數字（form.js 的規則量的同一個東西、同樣的單位，和「說出原因」一樣）：
//   上身前傾、腰往下彎、屁股往上翹：度；腳跟離地、前膝超過腳尖：%（小腿長 100%）
// 每一下記「持續 0.4 秒的最大值」：規則是數字超過門檻、持續 0.4 秒（FORM_HOLD.showMs）才算錯，
// 所以「規則說這一下有錯」就等於「這個特徵 > 門檻」（同一個量法；只在規則會檢查的時候量，例如深蹲蹲到 130° 以下才看上身前傾）
// 模型可以自己學門檻、幾個數字一起看；看不到那幾個點、這一下沒有要檢查的時候是 null（CSV 留空）
import { FORM_RULES, FORM_HOLD } from './form.js';
import { WORKOUTS, isWorkout } from './workouts.js';

const round1 = v => Math.round(v * 10) / 10;

// 一串 { t（毫秒）, v（數字或 null） } 裡「持續 holdMs 的最大值」：中間沒有 null、頭尾差 holdMs 以上的一段，取這段最小的值，所有這種段裡最大的
// 每一格當結尾，往回取「剛好跨過 holdMs」的最短一段（更長的段最小值只會更小）；沒有這種段回傳 null
// 一下最多幾百格，兩層迴圈就夠快
export function heldMax(samples, holdMs = FORM_HOLD.showMs) {
    let best = null;
    let start = 0;   // 往回數，這一段最早可以到哪一格（中間有 null 就從 null 的下一格開始）
    for (let b = 0; b < samples.length; b++) {
        if (samples[b].v === null) {
            start = b + 1;
            continue;
        }
        // 最短一段的開頭：最後一個和結尾差 holdMs 以上的格子
        let a = -1;
        for (let i = b; i >= start; i--) {
            if (samples[b].t - samples[i].t >= holdMs) {
                a = i;
                break;
            }
        }
        if (a < 0) continue;
        let low = Infinity;
        for (let i = a; i <= b; i++) low = Math.min(low, samples[i].v);
        if (best === null || low > best) best = low;
    }
    return best;
}

// 每一下量：做這一下的期間每一格記下每條規則的數字（規則不檢查的時候、量不到時記 null），做完算好就清掉
export class FeatureMeter {
    constructor(workoutId) {
        this.rules = isWorkout(workoutId) ? FORM_RULES[workoutId] || [] : [];
        this.clear();
    }

    clear() {
        this.samples = this.rules.map(() => []);
        this.counted = [];
    }

    // m：form.js 的 measure 結果（FormChecker.update 回傳的 m；沒有人時是 null）
    // counted：棒式這一格是不是一直線、正在計時（計次的動作每一格都是 true）
    add(m, timeMs, counted = true) {
        this.counted.push(!!counted);
        this.rules.forEach((rule, i) => {
            const v = m && rule.why && rule.active(m) ? rule.why.value(m) : null;
            this.samples[i].push({ t: timeMs, v: typeof v === 'number' && Number.isFinite(v) ? v : null });
        });
    }

    // 這一下的特徵：{ features: { 規則代號: 持續 0.4 秒的最大值（四捨五入到小數第 1 位）或 null } }
    // 棒式只看第一次到最後一次一直線之間，整次都沒一直線就全部看：和規則記錯誤的方式一樣（tracker.js 的 collectHold：
    // 趴下準備、做完起身那幾秒屁股翹起來不算；10/20 實測受測者 B 故意屁股太高、一直沒一直線的那組才全部算）
    take() {
        let from = this.counted.indexOf(true), to = this.counted.lastIndexOf(true);
        if (from < 0) [from, to] = [0, this.counted.length - 1];
        const features = {};
        this.rules.forEach((rule, i) => {
            const v = heldMax(this.samples[i].slice(from, to + 1));
            features[rule.id] = v === null ? null : round1(v);
        });
        this.clear();
        return { features };
    }
}

// ---------- 資料表的欄位（js/data/dataset.js、實測報表的「下載 AI 模型的資料」） ----------
// 每個動作用哪些特徵：key（程式用的名字）、name（CSV 的欄名，單位寫在括號裡）、of(item)（從 tracker 的每一下拿數字）
// 一般的（每一下都有的）：最低角度、秒數、相似度、晃動、中途卡住；錯誤的：上面的 features
// 伏地挺身沒有晃動（穩定度不看）、弓箭步沒有卡住（流暢度不看）、棒式沒有角度、相似度
// 棒式「撐了幾秒」不放：實測的規則是做對撐 30 秒、故意做錯撐 10 秒，放了模型會學成「撐得久就是做對」（答案從實測的規則漏進來）；
// 計次的「第幾下」也一樣（做對 10 下、故意做錯 5 下），只放在資料表前面當編號，不是特徵
const num = v => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const COMMON = {
    min: { name: '最低角度（°）', of: it => (num(it.min) === null ? null : Math.round(it.min)) },
    seconds: { name: '秒數', of: it => (num(it.start) !== null && num(it.end) !== null ? round1(it.end - it.start) : null) },
    similarity: { name: '和示範動作相似（0～100）', of: it => num(it.similarity) },
    sway: { name: '晃動（%）', of: it => num(it.sway) },
    stalls: { name: '中途卡住（次）', of: it => (Number.isInteger(it.stalls) ? it.stalls : null) },
    holdSway: { name: '髖部晃動（°）', of: it => num(it.sway) }
};
const RULE_NAMES = { lean: '上身前傾（°）', heel: '腳跟離地（%）', sag: '腰往下彎（°）', pike: '屁股往上翹（°）', knee: '前膝超過腳尖（%）' };
const PLAN = {
    squat: ['min', 'seconds', 'similarity', 'sway', 'stalls'],
    pushup: ['min', 'seconds', 'similarity', 'stalls'],
    lunge: ['min', 'seconds', 'similarity', 'sway'],
    plank: ['holdSway']
};
// 這個動作的特徵欄位：[{ key, name, of(item) }]；不認得的動作回傳空陣列
export function featureColumns(workoutId) {
    if (!isWorkout(workoutId) || !WORKOUTS[workoutId].kind || !Object.prototype.hasOwnProperty.call(PLAN, workoutId)) return [];
    const common = PLAN[workoutId].map(key => ({ key, name: COMMON[key].name, of: COMMON[key].of }));
    const rules = FORM_RULES[workoutId].map(r => ({
        key: r.id, name: RULE_NAMES[r.id] || r.short,
        of: it => (it.features && typeof it.features === 'object' ? num(it.features[r.id]) : null)
    }));
    return common.concat(rules);
}
