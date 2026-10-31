// 教練建議（10/31，計畫書研究目標 3 的「個人化建議」）：每組做完，從這組的數字挑最要緊的兩三點，寫成兩三句建議
//   coachFacts：這組要給教練看的數字（只有數字和動作名稱，沒有影像、沒有骨架座標、沒有時間日期）
//     AI 教練（js/cloud/ai-coach.js）把這些數字給 Gemini；沒打開、沒網路、出錯時用下面的固定句子（fixedAdvice）
//   fixedAdvice：固定句子，照順序挑：最常出現的錯誤 → 沒蹲到位 → 疲勞 → 節奏 → 中途卡住；都沒有就說做得好的地方和下一步
//     錯誤的說法用畫面上的紅字（form.js 的 text），和運動中看到、聽到的一樣
import { WORKOUTS, isWorkout, formatSeconds } from './workouts.js';
import { errorRule, errorShort } from './form.js';
import { fatigueOf } from './fatigue.js';
import { fluencyOf, repList } from './fluency.js';
import { stabilityOf } from './stability.js';

export const COACH = {
    MAX_LINES: 3,
    ERROR_REPS: 2,       // 同一種錯誤至少 2 下（或三成以上的下數）才說：只出現一下可能是偵測跳動
    ERROR_SHARE: 0.3,
    GOOD_SHARE: 0.6      // 到位不到六成才說「再低一點」
};

// 每個動作「到位」怎麼做（說得出來、照著做就好）
const DEPTH_CUE = {
    squat: '蹲到大腿和地面差不多平行（膝蓋 90° 以下），想像往後坐到椅子上',
    pushup: '胸口再靠近地面一點（手肘 95° 以下），身體保持一直線',
    lunge: '後膝往地面放，前後腳的膝蓋都彎到約 90°'
};

const isNum = v => typeof v === 'number' && Number.isFinite(v);

// s：這組的總結（session.js 的 summarize）；series：每一下的數字（rep-series.js）
// 回傳 null（不是計次、計時的動作）或給教練看的數字
export function coachFacts(s, series) {
    if (!s || !isWorkout(s.workout) || !WORKOUTS[s.workout].kind) return null;
    const w = WORKOUTS[s.workout];
    const errors = Object.entries(s.errors && typeof s.errors === 'object' ? s.errors : {})
        .filter(([id, n]) => errorRule(s.workout, id) && Number.isInteger(n) && n > 0)
        .map(([id, n]) => ({ id, name: errorShort(id), count: n }))
        .sort((a, b) => b.count - a.count);
    const f = { workout: s.workout, name: w.name, kind: w.kind, count: s.count, clean: s.clean, errors };
    if (w.kind === 'hold') {
        Object.assign(f, { best: s.best, total: s.total });
    } else {
        Object.assign(f, { good: s.good, close: s.close, shallow: s.shallow, lowest: s.best, average: s.average, tempo: s.tempo, similarity: isNum(s.similarity) ? s.similarity : null });
    }
    const fatigue = fatigueOf(series);
    f.fatigue = fatigue && fatigue.enough && fatigue.signs.length ? fatigue.signs.map(x => x.text) : null;
    const fluency = fluencyOf(series);
    f.rhythm = fluency && fluency.rhythm ? (fluency.rhythm.steady ? 'steady' : 'uneven') : null;
    f.stalls = fluency && fluency.stalls && fluency.stalls.list.length ? fluency.stalls.list : null;
    const st = stabilityOf(series, s.workout);
    f.stability = st ? (st.kind === 'hold'
        ? { hipSway: st.sway, front: st.front, back: st.back }
        : { sway: st.average, front: st.front ? st.front.sway : null, back: st.back ? st.back.sway : null }) : null;
    return f;
}

// 兩三句固定的建議（f：coachFacts 的結果）；一定至少一句
export function fixedAdvice(f) {
    if (!f) return [];
    const lines = [];
    const total = f.count || 0;
    // 1. 最常出現的錯誤：用畫面上的紅字（例如「上身太前傾，胸口挺起來」）
    const top = f.errors[0];
    if (top && (top.count >= COACH.ERROR_REPS || (total && top.count / total >= COACH.ERROR_SHARE))) {
        const rule = errorRule(f.workout, top.id);
        lines.push('「' + top.name + '」出現 ' + top.count + (f.kind === 'hold' ? ' 次' : ' 下') + '：' + rule.text + '。');
    }
    if (f.kind === 'reps') {
        // 2. 到位的不到六成
        if (total && f.good / total < COACH.GOOD_SHARE && DEPTH_CUE[f.workout]) {
            lines.push('到位 ' + f.good + '／' + total + ' 下：' + DEPTH_CUE[f.workout] + '。');
        }
        // 3. 疲勞分析看到的跡象
        if (f.fatigue) lines.push('後段' + f.fatigue.join('、') + '，可能累了：下一組前多休息一下，或少做幾下。');
        // 4. 節奏忽快忽慢
        if (f.rhythm === 'uneven') lines.push('節奏忽快忽慢：試著每一下一樣快，例如下去數 1、2，起來數 1、2。');
        // 5. 中途卡住
        if (f.stalls) lines.push(repList(f.stalls) + '中途卡了一下：下去、起來都一口氣做完，不要停在半路。');
    }
    // 做得好的地方（要改的少於兩點時補上，讓人知道哪裡可以保持）
    if (lines.length < 2) lines.push(praise(f));
    return lines.slice(0, COACH.MAX_LINES);
}

function praise(f) {
    const good = [];
    if (f.kind === 'hold') {
        if (f.count && f.clean === f.count) good.push('每一次都沒有偵測到錯誤');
        return (good.length ? '做得好：' + good.join('、') + '。' : '') + '最久撐了 ' + formatSeconds(f.best) + '，下次試試多撐 5 秒。';
    }
    if (f.count && f.good === f.count) good.push('每一下都到位');
    if (f.count && f.clean === f.count) good.push('沒有偵測到錯誤');
    if (f.rhythm === 'steady') good.push('節奏穩');
    if (isNum(f.similarity) && f.similarity >= 90) good.push('和示範動作很像（相似 ' + f.similarity + '%）');
    return (good.length ? '做得好：' + good.join('、') + '。' : '') + '下次可以多做 2 下，或每一下放慢一點。';
}
