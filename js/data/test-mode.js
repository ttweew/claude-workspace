// 實測模式（10/20）：實測那天主持人用
// 每一組開始前在鏡頭畫面選「這組要做的」（做對，或故意做哪一種錯），選了就倒數、自動錄製；做完按「這組做完」停止並自動下載 JSON。
// 檔名和檔案裡（meta.test）都記下受測者代號、動作、這組要做的，之後算準確率（10/22 的自動報表）不用另外標記
// 受測者只用代號（A、B、C…），不寫名字：檔案會放到雲端硬碟，報告裡也只寫代號

import { FORM_RULES } from '../analysis/form.js';
import { isWorkout, WORKOUTS } from '../analysis/workouts.js';
import { recordingName } from './recorder.js';

const KEY = 'testMode';
export const SUBJECT_MAX = 8;

// 每一組做多少（和使用說明的受測者卡一樣）：做對 10 下（計次準不準，下數多才看得出漏算、多算），
// 每種錯誤故意做 5 下（抓不抓得到）；棒式做對撐 30 秒、錯誤各撐 10 秒
const PLAN = { reps: { good: 10, error: 5, unit: '下' }, hold: { good: 30, error: 10, unit: '秒' } };
// 按鈕上「故意…」的說法：規則的簡稱念起來不順的另外寫（弓箭步的「膝超過腳尖」）
const ACT = new Map([['knee', '前膝超過腳尖']]);

// 受測者代號：只留英文字母和數字（全形也認得），最多 8 個字，英文一律大寫；什麼都沒有時回傳空字串
// 只收文字和數字：存的資料被改成物件時（String 會變成 "[object Object]"）當成沒有
function subjectCode(text) {
    const t = typeof text === 'string' || typeof text === 'number' ? String(text) : '';
    return t.normalize('NFKC').replace(/[^A-Za-z0-9]/g, '').slice(0, SUBJECT_MAX).toUpperCase();
}
// 填的代號整理過後是空的就用 A
export function cleanSubject(text) {
    return subjectCode(text) || 'A';
}

// 這個動作每一組可以選的：做對，或故意做其中一種錯誤；自由模式、不認得的動作沒有
// { id（檔名用的代號：good 或錯誤代號）, name（按鈕上的字）, amount（做幾下或撐幾秒）, unit（下／秒） }
export function conditionsFor(workoutId) {
    if (!isWorkout(workoutId) || !WORKOUTS[workoutId].kind) return [];
    const plan = PLAN[WORKOUTS[workoutId].kind];
    return [{ id: 'good', name: '做對', amount: plan.good, unit: plan.unit }]
        .concat(FORM_RULES[workoutId].map(r => ({ id: r.id, name: '故意' + (ACT.get(r.id) || r.short), amount: plan.error, unit: plan.unit })));
}

export function conditionOf(workoutId, id) {
    return conditionsFor(workoutId).find(c => c.id === id) || null;
}

// 開關和代號存在這台裝置上；存的值被改壞時用預設（關、A）
export function loadTestMode() {
    try {
        const v = JSON.parse(localStorage.getItem(KEY) || 'null');
        if (v && typeof v === 'object') return { on: v.on === true, subject: cleanSubject(v.subject) };
    } catch (err) { /* 壞掉就用預設 */ }
    return { on: false, subject: 'A' };
}

export function saveTestMode(state) {
    try {
        localStorage.setItem(KEY, JSON.stringify({ on: !!state.on, subject: cleanSubject(state.subject) }));
    } catch (err) { /* 不能存（無痕模式）就不記，這次照樣能用 */ }
}

// 錄製檔裡的實測資訊（meta.test）：{ subject, condition, reps 或 seconds }。錄製檔可能被改過，全部比對清單；
// 對不上就當成一般錄製檔（回傳 null），不會把來路不明的檔案標成某個受測者
export function testInfo(meta) {
    const t = meta && typeof meta === 'object' ? meta.test : null;
    if (!t || typeof t !== 'object' || typeof t.subject !== 'string') return null;
    const subject = subjectCode(t.subject);
    const c = conditionOf(meta.workout, t.condition);
    if (!subject || subject !== t.subject || !c) return null;
    return { subject, workout: meta.workout, condition: c.id, name: c.name, amount: c.amount, unit: c.unit };
}

// 開始錄這一組時寫進 meta.test 的內容
export function testMeta(subject, condition, workoutId) {
    const c = conditionOf(workoutId, condition);
    if (!c) return null;
    return { subject: cleanSubject(subject), condition: c.id, [c.unit === '秒' ? 'seconds' : 'reps']: c.amount };
}

// 檔名：test_A_squat_heel_20261021_153012（只有英文、數字和底線，每支手機都存得下來；時間和一般錄製檔 pose_… 一樣）
// 不是實測的錄製檔回傳 null
export function testFileName(meta) {
    const info = testInfo(meta);
    return info ? recordingName(meta).replace(/^pose_/, 'test_' + info.subject + '_' + info.workout + '_' + info.condition + '_') : null;
}
