// 自訂目標（10/25 組員回饋）：每個動作自己決定要做幾下（棒式撐幾秒），做到時提醒；之後繼續計次、計時
// 棒式另外報時：每 10 秒講一次秒數，最後 5 秒倒數「5、4、3、2、1」，到了講「時間到」，之後照樣每 10 秒報一次
// 這個檔案只決定目標和要講什麼；講話、嗶聲在 main.js（照首頁「語音提示」選的模式）

import { WORKOUTS, isWorkout, formatSeconds } from './workouts.js';

const KEY = 'workoutGoals';
// 常用的目標（組員提的棒式 10、20、30、40 秒；計次的動作 5～20 下，實測模式做對的一組是 10 下）
export const GOAL_PRESETS = { reps: [5, 10, 15, 20], hold: [10, 20, 30, 40] };
// 自己填的範圍：計次 1～200 下；棒式 5 秒～10 分鐘（不到 5 秒倒數講不完，超過 10 分鐘多半是打錯字）
export const GOAL_RANGE = { reps: [1, 200], hold: [5, 600] };
export const CALL_EVERY = 10;   // 棒式每幾秒報一次時間
export const COUNTDOWN = 5;     // 最後幾秒倒數

// 這個動作的目標是幾下（幾秒）的單位：'reps' 或 'hold'；自由模式、不認得的動作回傳 null
export function goalKind(workoutId) {
    return isWorkout(workoutId) && WORKOUTS[workoutId].kind ? WORKOUTS[workoutId].kind : null;
}

// 是不是這個動作可以用的目標：範圍內的整數
export function validGoal(workoutId, value) {
    const kind = goalKind(workoutId);
    if (!kind || !Number.isInteger(value)) return false;
    const [min, max] = GOAL_RANGE[kind];
    return value >= min && value <= max;
}

// 使用者填的字 → 目標；不是範圍內的整數（空白、9.5、-1、abc、太大）回傳 null
// 中文輸入法打出來的全形數字（６０）也認得
export function parseGoal(workoutId, text) {
    const t = String(text ?? '').trim().replace(/[０-９]/g, c => String(c.charCodeAt(0) - 0xFF10));
    if (!/^\d{1,4}$/.test(t)) return null;
    const value = Number(t);
    return validGoal(workoutId, value) ? value : null;
}

// 存在這台裝置上的目標：{ squat: 10, plank: 60, … }；沒設目標的動作沒有這一項
// 存的值可能被改過：只留認得的動作、範圍內的整數（動作的名字比對清單，不直接拿來查物件）
export function loadGoals() {
    const out = {};
    try {
        const saved = JSON.parse(localStorage.getItem(KEY) || 'null');
        if (saved && typeof saved === 'object' && !Array.isArray(saved)) {
            for (const id of Object.keys(WORKOUTS)) {
                if (Object.prototype.hasOwnProperty.call(saved, id) && validGoal(id, saved[id])) out[id] = saved[id];
            }
        }
    } catch (err) { /* 壞掉就當沒設 */ }
    return out;
}

// 設定一個動作的目標；value 是 null 時取消（不設目標）；回傳新的整份目標
export function saveGoal(workoutId, value) {
    const goals = loadGoals();
    if (validGoal(workoutId, value)) goals[workoutId] = value;
    else if (isWorkout(workoutId)) delete goals[workoutId];
    try { localStorage.setItem(KEY, JSON.stringify(goals)); } catch (err) { /* 不能存（無痕模式）就這次有效 */ }
    return goals;
}

// 給人看的目標：「10 下」「60 秒」（棒式和報時講的一樣用秒，不換成分鐘）
export function goalText(workoutId, value) {
    return value + (goalKind(workoutId) === 'hold' ? ' 秒' : ' 下');
}

// 大字儀表板次數框上面的小字：「目標 10」「目標 1:00」（數字本身是次數或 0:42，單位一看就知道）
export function goalLabel(workoutId, value) {
    return '目標 ' + (goalKind(workoutId) === 'hold' ? formatSeconds(value) : value);
}

// 運動總結的一行：「目標 10 下：達成」「目標 60 秒：還差 8 秒」
// s：js/analysis/session.js 的總結（計次看 count，棒式看最久的一次 best，秒數無條件捨去，和畫面、提示一樣）
export function goalLine(s) {
    if (!s || !validGoal(s.workout, s.goal)) return null;
    const hold = goalKind(s.workout) === 'hold';
    const done = hold ? Math.floor(s.best) : s.count;
    if (!Number.isFinite(done)) return null;
    const head = '目標 ' + goalText(s.workout, s.goal) + '：';
    return done >= s.goal ? head + '達成' : head + '還差 ' + (s.goal - done) + (hold ? ' 秒' : ' 下');
}

// 計次的動作做到目標的那一下要講的話；不是那一下回傳 null
export function repGoalText(n, goal) {
    return Number.isInteger(goal) && n === goal ? n + ' 下，完成目標' : null;
}

// 棒式報時：每一格給這一次撐了幾秒（js/analysis/reps.js 的 HoldTimer），回傳這一秒要講的
//   { kind: 'tick', text: '20 秒' }：每 10 秒（完整語音才講）
//   { kind: 'countdown', text: '3' }：最後 5 秒倒數
//   { kind: 'done', text: '時間到' }：到了目標
// 沒設目標時不報時（和以前一樣）；秒數無條件捨去，和畫面上的 0:42 一樣
// 一秒只講一次；手機慢、一格跳過好幾秒時只講現在這一秒的（過時的不講），跳過目標那一秒也照樣講「時間到」
export class HoldCaller {
    constructor(goal) {
        this.goal = Number.isInteger(goal) && goal > 0 ? goal : null;
        this.reset();
    }

    reset() {
        this.last = 0;       // 上一次看到的秒數
        this.done = false;   // 這一次講過「時間到」了沒
    }

    update(seconds) {
        if (!this.goal || !Number.isFinite(seconds)) return null;
        const s = Math.floor(seconds);
        // 秒數變小：換下一次撐（起身又趴下），重新開始
        if (s < this.last) this.reset();
        if (s === this.last) return null;
        this.last = s;
        if (!this.done && s >= this.goal) {
            this.done = true;
            return { kind: 'done', text: '時間到' };
        }
        const left = this.goal - s;
        if (left >= 1 && left <= COUNTDOWN) return { kind: 'countdown', text: String(left) };
        if (s % CALL_EVERY === 0) return { kind: 'tick', text: s + ' 秒' };
        return null;
    }
}
