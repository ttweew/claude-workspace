// 智慧課表（11/14 使用者要求：再加一些 AI 的功能和方便性）：照這台裝置上的運動紀錄排一套，
// 做完一項自動換下一項，全程用講的帶；人站在 2～3 公尺外，從頭到尾不用碰手機
//   怎麼排是固定的規則（不是模型）：看每個動作上一次做了幾下、做得好不好，決定這次多做一點、一樣多，還是先少做把動作做好；
//     沒有紀錄的動作用起步的下數；首頁「目標」卡片設了目標的動作照使用者設的
//   弱點提醒：最近幾次同一種錯誤出現 2 下以上，開始那一項時多講一句（「記得胸口挺起來」）
//   運動中每一下的 AI 判斷、AI 評分照舊（js/analysis/ai-judge.js），做完一項講這一項的 AI 評分平均
// 這個檔案只決定排什麼、進行到第幾項、卡片和語音要說什麼；換動作、講話在 js/pages/main.js，首頁的卡片在 js/ui/plan-card.js

import { WORKOUTS } from './workouts.js';
import { goalKind, goalText, validGoal } from './goal.js';
import { errorRule, errorShort } from './form.js';

// 順序：站著的（深蹲）→ 趴著的（伏地挺身、棒式連著做，不用起來又趴下）→ 站著的（弓箭步）
export const PLAN_ORDER = ['squat', 'pushup', 'plank', 'lunge'];
// 沒有紀錄時的起步：實測模式做對的一組是 10 下（10/20 受測者 A、B 都做得完）；伏地挺身比較吃力少 2 下；
// 棒式用組員 10/25 提的目標（10、20、30、40 秒）裡第二個
export const PLAN_START = { squat: 10, pushup: 8, plank: 20, lunge: 10 };
// 課表每一項的範圍：四項連著做，單項不排太多（紀錄裡做過 50 下的人，課表也只排到 30 下）；
// 棒式最少 10 秒：最後 5 秒要倒數，太短倒數講不完
export const PLAN_RANGE = { reps: [3, 30], hold: [10, 120] };
// 換下一項後先準備幾秒才開始數：換姿勢（站著 → 趴下）要幾秒，這段時間的動作不算；
// 「深蹲做完 10 下，AI 評分平均 85 分；下一個：伏地挺身 8 下」這一句也要講 5、6 秒
export const PLAN_PREP_MS = 6000;
// 做得好：八成以上到位、八成以上沒有錯誤（和教練建議「做得好」的說法一致）；一半以上有錯誤算要先把動作做好
const GOOD = 0.8;
const POOR = 0.5;
// 弱點提醒看最近幾次、同一種錯誤加起來幾下才提醒（和教練建議一樣：只出現一下可能是偵測跳一下）
const FOCUS_SESSIONS = 3;
const FOCUS_MIN = 2;
const PICKS_KEY = 'planPicks';

const has = (obj, key) => !!obj && Object.prototype.hasOwnProperty.call(obj, key);
const clamp = (v, [lo, hi]) => Math.min(hi, Math.max(lo, v));
const unitOf = id => (goalKind(id) === 'hold' ? ' 秒' : ' 下');

// 這個動作最近的紀錄（新的在前面）；history 是 js/analysis/session.js 的 loadHistory()（舊的在前面、已經檢查過格式）
function recent(workoutId, history) {
    return (Array.isArray(history) ? history : []).filter(s => s && s.workout === workoutId).reverse();
}

// 弱點：最近 3 次這個動作裡加起來最多的那種錯誤（2 下以上才算）；沒有回傳 null
// 紀錄可能被改過：錯誤的代號要是這個動作真的有的規則（errorRule），不認得的不算
export function focusOf(workoutId, history) {
    const list = recent(workoutId, history).slice(0, FOCUS_SESSIONS);
    const sum = new Map();
    for (const s of list) {
        for (const id of Object.keys(s.errors || {})) {
            const n = s.errors[id];
            if (!errorRule(workoutId, id) || !Number.isInteger(n) || n <= 0) continue;
            sum.set(id, (sum.get(id) || 0) + n);
        }
    }
    let best = null;
    for (const [id, count] of sum) if (count >= FOCUS_MIN && (!best || count > best.count)) best = { id, count };
    return best ? { ...best, sessions: list.length } : null;
}

// 一項：{ workout, goal（幾下或幾秒）, why（給人看的理由）, focus（弱點，沒有是 null） }；不是課表裡的動作回傳 null
export function suggestStep(workoutId, history = [], goals = {}) {
    if (!PLAN_ORDER.includes(workoutId)) return null;
    const hold = goalKind(workoutId) === 'hold';
    const unit = unitOf(workoutId);
    const range = PLAN_RANGE[hold ? 'hold' : 'reps'];
    const focus = focusOf(workoutId, history);
    // 使用者自己設了目標：照設的（他比規則清楚自己要做多少）
    if (has(goals, workoutId) && validGoal(workoutId, goals[workoutId])) {
        return { workout: workoutId, goal: goals[workoutId], why: '照你設的目標', focus };
    }
    const last = recent(workoutId, history)[0];
    if (!last) return { workout: workoutId, goal: PLAN_START[workoutId], why: '還沒有紀錄，先從 ' + PLAN_START[workoutId] + unit + '開始', focus };
    if (hold) {
        // 棒式看最久的一次（秒數無條件捨去，和畫面、總結一樣）；以 5 秒為一格，數字好記、倒數也整齊
        const best = Math.floor(last.best);
        const steady = last.clean === last.count;
        const step = Math.floor(best / 5) * 5;
        const goal = clamp(steady ? step + 5 : step, range);
        const head = '上次最久 ' + best + ' 秒';
        if (goal > best) return { workout: workoutId, goal, why: head + (steady && best >= range[0] ? '、撐得穩，這次 ' : '，這次試試 ') + goal + ' 秒', focus };
        if (best >= range[1]) return { workout: workoutId, goal, why: head + (steady ? '、撐得穩' : '') + '；課表每一項最多 ' + range[1] + ' 秒', focus };
        return { workout: workoutId, goal, why: head + '、姿勢有跑掉，這次 ' + goal + ' 秒、撐穩一點', focus };
    }
    const done = last.count;
    const bad = done - last.clean;
    const good = last.clean / done >= GOOD && last.good / done >= GOOD;
    const poor = last.clean / done < POOR;
    const more = Math.max(1, Math.round(done * 0.1));
    const goal = clamp(good ? done + more : poor ? Math.round(done * 0.8) : done, range);
    const head = '上次 ' + done + ' 下';
    let why;
    if (done > range[1]) why = head + '；課表每一項最多 ' + range[1] + ' 下';
    else if (goal > done) why = good ? head + '、做得不錯，多 ' + (goal - done) + ' 下' : head + '，這次試試 ' + goal + ' 下';
    else if (goal < done) why = head + '有 ' + bad + ' 下要注意，先少做幾下、把動作做好';
    else if (good) why = head + '、做得不錯；課表每一項最多 ' + range[1] + ' 下';
    else if (poor) why = head + '有 ' + bad + ' 下要注意，這次做一樣多、把動作做好';
    else why = head + '，這次做一樣多、做得更好';
    return { workout: workoutId, goal, why, focus };
}

// 整套課表：照固定的順序，只排勾選的動作（picks 裡不認得的不理）
export function suggestPlan(history = [], goals = {}, picks = PLAN_ORDER) {
    const list = Array.isArray(picks) ? picks : PLAN_ORDER;
    return PLAN_ORDER.filter(id => list.includes(id)).map(id => suggestStep(id, history, goals));
}

// 「深蹲 11 下」
export const stepText = step => WORKOUTS[step.workout].name + ' ' + goalText(step.workout, step.goal);
// 「深蹲 11 下 → 伏地挺身 8 下 → 棒式 25 秒 → 弓箭步 10 下」
export const planLine = steps => steps.map(stepText).join(' → ');
// 弱點那一句（卡片上）：「最近 3 次有 5 下上身前傾」；沒有回傳 ''
export function focusText(step) {
    const f = step.focus;
    if (!f) return '';
    const unit = goalKind(step.workout) === 'hold' ? ' 次' : ' 下';
    return (f.sessions > 1 ? '最近 ' + f.sessions + ' 次' : '上次') + '有 ' + f.count + unit + errorShort(f.id);
}
// 開始這一項時講的：「課表開始：深蹲 11 下」「下一個：伏地挺身 8 下」，有弱點時加「，記得胸口挺起來」
export function stepSpeech(step, first) {
    const rule = step.focus ? errorRule(step.workout, step.focus.id) : null;
    return (first ? '課表開始：' : '下一個：') + stepText(step) + (rule && rule.speech ? '，記得' + rule.speech : '');
}

// 勾選要做哪幾項（存在這台裝置上）：存的值可能被改過，只留課表裡有的動作；一項都沒有（或沒存過）就是四項都做
export function loadPlanPicks() {
    try {
        const saved = JSON.parse(localStorage.getItem(PICKS_KEY) || 'null');
        if (Array.isArray(saved)) {
            const picks = PLAN_ORDER.filter(id => saved.includes(id));
            if (picks.length) return picks;
        }
    } catch (err) { /* 壞掉就當沒存過 */ }
    return [...PLAN_ORDER];
}
export function savePlanPicks(picks) {
    const list = PLAN_ORDER.filter(id => Array.isArray(picks) && picks.includes(id));
    try { localStorage.setItem(PICKS_KEY, JSON.stringify(list)); } catch (err) { /* 不能存（無痕模式）就這次有效 */ }
    return list;
}

// 進行中的課表：現在第幾項、是不是在準備、做完了沒
export class PlanRun {
    constructor(steps) {
        this.steps = (Array.isArray(steps) ? steps : []).filter(Boolean);
        this.index = 0;
        this.prepUntil = 0;      // 換到這一項之後準備到什麼時候（毫秒）；第一項不用準備（和平常選好動作開鏡頭一樣）
        this.finished = !this.steps.length;
        this.waiting = false;    // 這一項做到了，但現在不能換動作（錄製中），等可以換的時候再換
        this.introduced = false; // 第一項講過「課表開始：…」了沒
    }

    // 現在這一項；全部做完是 null
    get step() {
        return this.finished ? null : this.steps[this.index];
    }

    // 下一項；現在是最後一項（或已經做完）是 null
    get next() {
        return this.finished ? null : this.steps[this.index + 1] || null;
    }

    // 這一項做到了沒：value 是現在的下數（棒式是這一次撐的秒數）
    reached(workoutId, value) {
        const s = this.step;
        return !!s && !this.waiting && s.workout === workoutId && Number.isFinite(value) && value >= s.goal;
    }

    // 換下一項：回傳換過去的那一項（最後一項做完回傳 null，課表結束）
    advance(now) {
        this.waiting = false;
        if (this.finished) return null;
        this.index++;
        if (this.index >= this.steps.length) {
            this.finished = true;
            this.prepUntil = 0;
            return null;
        }
        this.prepUntil = now + PLAN_PREP_MS;
        return this.steps[this.index];
    }

    // 還在準備（換姿勢）：這段時間不數
    preparing(now) {
        return !this.finished && now < this.prepUntil;
    }

    // 準備剛結束的那一格回傳 true（只一次）：提醒「開始」
    began(now) {
        if (this.finished || !this.prepUntil || now < this.prepUntil) return false;
        this.prepUntil = 0;
        return true;
    }

    // 鏡頭畫面上方卡片的字
    cardText(now, locked = false) {
        const all = planLine(this.steps);
        if (this.finished) return '課表完成：' + all + '；按「結束」看總結';
        const s = this.step;
        const head = '第 ' + (this.index + 1) + '／' + this.steps.length + ' 項：';
        if (this.waiting) return head + stepText(s) + '做到了；' + (locked ? '錄製中不能換下一項（先停止錄製）' : '馬上換下一項');
        if (this.preparing(now)) return head + stepText(s) + '，' + Math.max(1, Math.ceil((this.prepUntil - now) / 1000)) + ' 秒後開始數';
        const focus = focusText(s);
        return head + stepText(s) + (focus ? '；' + focus : '') + (this.next ? '；做到了自動換' + WORKOUTS[this.next.workout].name : '；最後一項');
    }
}
