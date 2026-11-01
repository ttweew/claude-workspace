// 成長曲線（11/1，計畫書研究目標 5「成長曲線」）：運動紀錄（這台裝置＋雲端上的）照日期排，一天一個點
// 只做計算（不碰畫面、不碰雲端），畫在 js/ui/growth-chart.js；雲端的紀錄由 js/cloud/cloud.js 讀、js/cloud/sync.js 的 fromCloud 檢查
//
// 為什麼一天一個點：一天常常做好幾組（10/20 實測一晚 23 組），每一組一個點會擠在一起、看不出一天一天的變化
// 一天裡好幾組怎麼合起來（每一種數字都寫在 METRICS 裡）：
//   一次最多幾下、最久撐幾秒：那天最好的一組（「我最多能做幾下」）
//   到位比例、沒有錯誤的比例：那天全部的下數加起來再算（和總結的「到位比例 83%」同一個算法：四捨五入到整數 %），
//     只做一組的那天就和那一組總結寫的一樣
//   和示範動作相似：照下數加權平均（做 10 下的組比做 2 下的組算得重）
//   一天總共撐幾秒：加起來

import { WORKOUTS, isWorkout } from './workouts.js';

export const GROWTH = {
    MAX_DAYS: 30   // 最多畫最近 30 天（有紀錄的天）：手機上 30 個點還分得開；更早的看表格、CSV
};

// 每個動作可以看的數字（第一個是預設）；unit 是畫面上數字後面的單位
export const METRICS = {
    reps: [
        { id: 'count', name: '一次最多幾下', unit: '下' },
        { id: 'good', name: '到位比例', unit: '%' },
        { id: 'clean', name: '沒有錯誤的比例', unit: '%' },
        { id: 'similarity', name: '和示範動作相似', unit: '%' }
    ],
    hold: [
        { id: 'best', name: '最久撐幾秒', unit: '秒' },
        { id: 'total', name: '一天總共撐幾秒', unit: '秒' },
        { id: 'clean', name: '沒有錯誤的比例', unit: '%' }
    ]
};

const sessionKey = s => s.workout + '-' + s.date;   // 和 js/cloud/sync.js 的 sessionId 一樣（雲端每一筆的代號）

// 這台裝置的紀錄＋雲端讀回來的：同一筆（同一個動作、同一個開始時間）只算一次，用這台裝置上的
// （兩邊的數字一樣：雲端的就是從這台裝置傳上去的；這台裝置上的還多了計次準確率、目標）
// 回傳 { records（照時間排好）, cloudOnly（只在雲端的有幾筆：這台裝置只留最近 50 次、或清除過紀錄） }
export function mergeRecords(local, cloud = []) {
    const seen = new Map();
    for (const s of local) seen.set(sessionKey(s), s);
    let cloudOnly = 0;
    for (const s of cloud) {
        const key = sessionKey(s);
        if (seen.has(key)) continue;
        seen.set(key, s);
        cloudOnly++;
    }
    return { records: [...seen.values()].sort((a, b) => a.date - b.date), cloudOnly };
}

// 那一天（這支手機的時區）：'2026-11-01'；畫面上寫 '11/1'
export function dayKey(ms) {
    const d = new Date(ms);
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
export const dayLabel = key => Number(key.slice(5, 7)) + '/' + Number(key.slice(8, 10));

const sum = (list, f) => list.reduce((a, s) => a + f(s), 0);
const pct = (part, whole) => Math.round(part / whole * 100);
const isNum = v => typeof v === 'number' && Number.isFinite(v);

// 一天的幾組 → 那天的數字（沒有這個數字的天回傳 null，例如那天每一組都沒有相似度）
function dayValue(list, metric) {
    switch (metric) {
        case 'count': return Math.max(...list.map(s => s.count));
        case 'good': return pct(sum(list, s => s.good), sum(list, s => s.count));
        case 'clean': return pct(sum(list, s => s.clean), sum(list, s => s.count));
        case 'similarity': {
            const sims = list.filter(s => isNum(s.similarity));
            return sims.length ? Math.round(sum(sims, s => s.similarity * s.count) / sum(sims, s => s.count)) : null;
        }
        case 'best': return Math.max(...list.map(s => s.best));
        case 'total': return sum(list, s => s.total);
        default: return null;
    }
}

// 有紀錄的動作（照首頁的順序）
export function growthWorkouts(records) {
    const have = new Set(records.map(s => s.workout));
    return Object.keys(WORKOUTS).filter(id => WORKOUTS[id].kind && have.has(id));
}

// 這個動作、這個數字的曲線：回傳 null（沒有這個動作的紀錄、不認得的數字）或
//   { workout, metric（METRICS 的那一項）, days: [{ day: '2026-11-01', label: '11/1', value, sessions（那天幾組） }],
//     earlier（超過 30 天、沒畫出來的有幾天）, first, last（畫出來的第一天、最後一天）, best（數字最大的那天，一樣大取最近的） }
// 動作、數字都先比對清單（外面來的字，例如 constructor，不能直接拿去查）
export function growthSeries(records, workoutId, metricId) {
    if (!isWorkout(workoutId) || !WORKOUTS[workoutId].kind) return null;
    const metric = METRICS[WORKOUTS[workoutId].kind].find(m => m.id === metricId);
    if (!metric) return null;
    const byDay = new Map();
    for (const s of records) {
        if (s.workout !== workoutId) continue;
        const key = dayKey(s.date);
        if (!byDay.has(key)) byDay.set(key, []);
        byDay.get(key).push(s);
    }
    const all = [...byDay.keys()].sort().map(day => {
        const list = byDay.get(day);
        return { day, label: dayLabel(day), value: dayValue(list, metric.id), sessions: list.length };
    }).filter(d => d.value !== null);
    if (!all.length) return null;
    const days = all.slice(-GROWTH.MAX_DAYS);
    const best = days.reduce((a, d) => (d.value >= a.value ? d : a));
    return { workout: workoutId, metric, days, earlier: all.length - days.length, first: days[0], last: days[days.length - 1], best };
}

// 一句話（圖的標題下面、螢幕閱讀器念的）：例如「深蹲 一次最多幾下：10/20 8 下 → 11/1 15 下（6 天），最多是 11/1 的 15 下」
export function growthLine(g) {
    if (!g) return '';
    const v = d => d.value + (g.metric.unit === '%' ? '%' : ' ' + g.metric.unit);
    const name = WORKOUTS[g.workout].name + ' ' + g.metric.name;
    if (g.days.length === 1) return name + '：只有 ' + g.first.label + ' 一天（' + v(g.first) + '），再做一天就畫得出曲線';
    return name + '：' + g.first.label + ' ' + v(g.first) + ' → ' + g.last.label + ' ' + v(g.last) + '（' + g.days.length + ' 天）'
        + '，最' + (g.metric.unit === '%' ? '高' : g.metric.id === 'best' ? '久' : '多') + '是 ' + g.best.label + ' 的 ' + v(g.best);
}
