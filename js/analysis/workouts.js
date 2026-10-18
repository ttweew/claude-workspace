// 運動模式：使用者選要做哪個動作，網站就顯示那個動作需要的角度，並計算次數（棒式計時）
//   自由：只顯示膝、髖角度，不計次數（和以前一樣）
//   深蹲：膝蓋角度，蹲到 90° 以下算到位
//   弓箭步：兩腳膝蓋角度（取彎得比較少的那一腳：前後腳都要彎到約 90°）
//   伏地挺身：手肘角度，彎到約 90° 算到位；身體要趴著才計算
//   棒式：肩、髖、膝一直線、身體趴著時計時
// 都要從側面拍：這些都是「前後彎」的動作，正面拍的角度不準（js/analysis/view.js）
// 門檻是依示範動畫（js/ui/demo.js）和一般健身教學訂的，要請組員實際做做看再調整（docs/roadmap.md）

import { RepCounter, HoldTimer, REP_DEFAULTS, bodyTilt, clearerAngle } from './reps.js';
import { SquatCounter, SQUAT, DEPTH_TEXT as SQUAT_DEPTH } from './squat.js';
import { clearerSide } from '../skeleton/landmarks.js';

// 趴著：身體和地面的夾角在這個以內（伏地挺身最高點約 25°，棒式約 10°；站著約 90°）
const LYING = 45;
const lying = pose => {
    const tilt = bodyTilt(pose.landmarks, pose.width, pose.height);
    return tilt !== null && tilt <= LYING;
};

// 弓箭步看兩腳的膝蓋，取彎得比較少（角度比較大）的那一腳：
//   站起來時前腳伸直、後腳常常還彎著（示範動畫 160° 和 122°），取大的才看得出「站起來了」；
//   蹲到底時兩腳都要彎到約 90°，取大的才不會只彎一腳就算到位
// 只看得到一腳時用那一腳
function lungeKnee(pose) {
    const a = pose.angles.LEFT_KNEE, b = pose.angles.RIGHT_KNEE;
    if (a === null || a === undefined) return b ?? null;
    if (b === null || b === undefined) return a;
    return Math.max(a, b);
}

export const LUNGE_CONFIG = {
    up: 150, down: 130, good: 100, close: 115,
    metric: pose => lungeKnee(pose),
    frontPrompt: '請側身對著鏡頭，正面拍膝蓋角度不準'
};

export const PUSHUP_CONFIG = {
    up: 150, down: 120, good: 95, close: 110,
    metric: (pose, counter) => clearerAngle(pose, counter, 'ELBOW'),
    position: pose => (lying(pose) ? null : '伏地挺身：趴下撐好、側面對著鏡頭就開始計算'),
    frontPrompt: '請側身對著鏡頭，正面拍手肘角度不準'
};

// 棒式：趴著，而且肩、髖、膝一直線（髖部角度 ≥ 160°）、腳伸直（膝蓋 ≥ 150°）
export const PLANK = { HIP: 160, KNEE: 150 };
export const PLANK_CONFIG = {
    position: pose => (lying(pose) ? null : '棒式：趴下撐好、側面對著鏡頭就開始計時'),
    good: pose => {
        const side = clearerSide(pose.landmarks);
        const hip = pose.angles[side + '_HIP'], knee = pose.angles[side + '_KNEE'];
        return hip !== null && hip !== undefined && hip >= PLANK.HIP && (knee === null || knee === undefined || knee >= PLANK.KNEE);
    },
    frontPrompt: '請側身對著鏡頭，正面拍看不出身體有沒有一直線'
};

const DEPTH = { good: '到位', close: '再低一點', shallow: '太淺' };

// 每個模式：
//   name：名稱；hud：大字儀表板每一側顯示的兩個關節；labels：骨架旁一直顯示角度的關節
//   kind：'reps' 計次、'hold' 計時、null 不計；create()：建立計算的物件
//   toast(rep)：完成一下時的短提示
export const WORKOUTS = {
    free: {
        id: 'free', name: '自由', kind: null, hud: ['KNEE', 'HIP'], labels: ['KNEE', 'HIP'],
        hint: '只顯示膝、髖角度，不計次數'
    },
    squat: {
        id: 'squat', name: '深蹲', kind: 'reps', hud: ['KNEE', 'HIP'], labels: ['KNEE', 'HIP'],
        hint: '膝蓋彎到 ' + SQUAT.GOOD + '° 以下算蹲到位',
        create: () => new SquatCounter(),
        toast: rep => '第 ' + rep.n + ' 下 · ' + Math.round(rep.min) + '° ' + SQUAT_DEPTH[rep.depth]
    },
    pushup: {
        id: 'pushup', name: '伏地挺身', kind: 'reps', hud: ['ELBOW', 'HIP'], labels: ['ELBOW', 'HIP'],
        hint: '手肘彎到 ' + PUSHUP_CONFIG.good + '° 以下算到位',
        create: () => new RepCounter(PUSHUP_CONFIG),
        toast: rep => '第 ' + rep.n + ' 下 · 手肘 ' + Math.round(rep.min) + '° ' + DEPTH[rep.depth]
    },
    plank: {
        id: 'plank', name: '棒式', kind: 'hold', hud: ['HIP', 'KNEE'], labels: ['HIP', 'KNEE'],
        hint: '肩、髖、膝一直線時計時',
        create: () => new HoldTimer(PLANK_CONFIG),
        toast: hold => '第 ' + hold.n + ' 次 · 撐了 ' + formatSeconds(hold.seconds)
    },
    lunge: {
        id: 'lunge', name: '弓箭步', kind: 'reps', hud: ['KNEE', 'HIP'], labels: ['KNEE', 'HIP'],
        hint: '前後腳膝蓋都彎到 ' + LUNGE_CONFIG.good + '° 以下算到位',
        create: () => new RepCounter(LUNGE_CONFIG),
        toast: rep => '第 ' + rep.n + ' 下 · 膝蓋 ' + Math.round(rep.min) + '° ' + DEPTH[rep.depth]
    }
};
export const WORKOUT_IDS = Object.keys(WORKOUTS);
// 是不是認得的動作代號：網址、錄製檔、這台裝置存的資料都可能被改過，
// 不能直接拿去查 WORKOUTS（例如 'constructor'、'toString' 這種 JavaScript 內建的名字查得到東西，網頁會壞掉）
export const isWorkout = id => WORKOUT_IDS.includes(id);

// 秒數 → 「0:23」
export function formatSeconds(seconds) {
    const s = Math.floor(seconds);
    return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
}

// 共同的預設值也匯出，測試和說明文件用
export { REP_DEFAULTS };

// ---------- 使用者選的模式（網站會記住；網址 ?workout= 優先但不記住；以前的 ?lab=squat 當作深蹲） ----------
const KEY = 'workout';
let current = null;
const listeners = new Set();

function initial() {
    const params = new URLSearchParams(typeof location !== 'undefined' ? location.search : '');
    const fromUrl = params.get('workout') || (params.get('lab') === 'squat' ? 'squat' : '');
    if (isWorkout(fromUrl)) return fromUrl;
    try {
        const saved = localStorage.getItem(KEY);
        if (isWorkout(saved)) return saved;
    } catch (err) { /* 不能讀就用預設 */ }
    return 'free';
}

export function getWorkout() {
    if (current === null) current = initial();
    return WORKOUTS[current];
}
// 錄製中不能換動作：錄製檔記的是開始錄的時候選的動作（meta.workout），重播分析用它算整段，中途換了會用錯的動作算
let locked = false;
const lockListeners = new Set();
export function setWorkoutLocked(on) {
    locked = on;
    lockListeners.forEach(fn => fn(on));
}
export function onWorkoutLock(fn) {
    lockListeners.add(fn);
}

export function setWorkout(id) {
    if (!isWorkout(id) || locked) return;
    current = id;
    try { localStorage.setItem(KEY, id); } catch (err) { /* 不能存就不記 */ }
    listeners.forEach(fn => fn(WORKOUTS[id]));
}
// 模式改變時通知（首頁卡片、鏡頭畫面的選單、main.js 都會換）
export function onWorkoutChange(fn) {
    listeners.add(fn);
}
