// 首頁「今天要做什麼運動？」、運動完問一次雲端同步、使用說明的實測任務卡（10/19 首頁改版）
// 畫面的部分在瀏覽器測試；這裡測決定要怎麼顯示的規則
import test from 'node:test';
import assert from 'node:assert/strict';
import { PICKS, startLook, FREE_TEXT } from '../js/ui/start-pick.js';
import { pickTexts } from '../js/ui/model-pick.js';
import { unjudgedRules } from '../js/analysis/form.js';
import { shouldAskCloud, loadAsked, saveAsked } from '../js/ui/cloud-ask.js';
import { cleanDone, progressText } from '../js/ui/task-card.js';
import { WORKOUTS } from '../js/analysis/workouts.js';

test('四個大按鈕：計次、計時的動作都有，自由模式不在裡面', () => {
    assert.deepEqual(PICKS.slice().sort(), Object.keys(WORKOUTS).filter(id => id !== 'free').sort());
});

test('「用目前的動作開鏡頭」的按鈕（#startBtn）：選了動作寫「開始深蹲」（11/24 起放在「用哪一個 AI」下面），自由模式是最下面的小字', () => {
    for (const id of PICKS) {
        const look = startLook(id);
        assert.equal(look.place, id);
        assert.equal(look.text, '開始' + WORKOUTS[id].name);
    }
    assert.deepEqual(startLook('free'), { place: 'free', text: FREE_TEXT });
    // 認不得的代號（網址、存的資料被改過）：當作自由模式，不會拿去查物件
    for (const bad of ['constructor', 'toString', '', undefined, null, 42]) assert.equal(startLook(bad).place, 'free', String(bad));
});

test('運動完問雲端同步：只有接上 Firebase、還沒打開、這次有總結、沒問過才問', () => {
    const base = { available: true, enabled: false, hasSummary: true, asked: false };
    assert.equal(shouldAskCloud(base), true);
    assert.equal(shouldAskCloud({ ...base, available: false }), false, '網站還沒接上 Firebase');
    assert.equal(shouldAskCloud({ ...base, enabled: true }), false, '已經打開了');
    assert.equal(shouldAskCloud({ ...base, hasSummary: false }), false, '自由模式沒有總結');
    assert.equal(shouldAskCloud({ ...base, asked: true }), false, '問過了（打開過、或按了不用了）');
});

test('問過了要記住；這台裝置存不了資料時當作問過，不會每做完一組就問一次', () => {
    const store = new Map();
    globalThis.localStorage = { getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)) };
    assert.equal(loadAsked(), false);
    saveAsked();
    assert.equal(loadAsked(), true);
    globalThis.localStorage = { getItem: () => { throw new Error('SecurityError'); }, setItem: () => { throw new Error('QuotaExceeded'); } };
    assert.equal(loadAsked(), true);
    assert.doesNotThrow(saveAsked);
    delete globalThis.localStorage;
});

test('實測任務卡：存的勾選被改壞、有不認得的項目時，只留卡片上有的', () => {
    const known = ['prep-check', 'reps-squat', 'angle'];
    assert.deepEqual([...cleanDone('["reps-squat","angle"]', known)], ['reps-squat', 'angle']);
    assert.deepEqual([...cleanDone('["reps-squat","hacked","constructor",1,null]', known)], ['reps-squat']);
    for (const bad of [null, '', '{壞掉', '{"a":1}', '"angle"', '123']) assert.equal(cleanDone(bad, known).size, 0, String(bad));
});

test('實測任務卡：進度的說明', () => {
    assert.equal(progressText(0, 20), '還沒開始：共 20 項');
    assert.equal(progressText(7, 20), '做完 7／20 項');
    assert.match(progressText(20, 20), /全部做完/);
});

// 11/24：選好動作之後「用哪一個 AI 看你做深蹲？」兩張卡片（js/ui/model-pick.js）
const FAST = { mediapipe: 'lite', yolo: 'yolo-n' };

test('用哪一個 AI：深蹲用 YOLO 不判斷「腳跟離地」，弓箭步不判斷「膝超過腳尖」；MediaPipe 每一種都判斷', () => {
    const t = pickTexts('squat', 'lite', FAST, 23.1);
    assert.equal(t.title, '用哪一個 AI 看你做深蹲？');
    const [mp, yolo] = t.options;
    assert.deepEqual([mp.family, mp.label, mp.tag, mp.checked], ['mediapipe', 'MediaPipe lite', '推薦', true]);
    assert.deepEqual([yolo.family, yolo.label, yolo.tag, yolo.checked], ['yolo', 'YOLO26n', '實驗', false]);
    assert.match(mp.sub, /每一種錯誤都判斷/);
    assert.match(yolo.sub, /點一下就能換人/);
    assert.match(yolo.sub, /不判斷「腳跟離地」/);
    assert.match(yolo.sub, /第一次用要下載約 23 MB/);
    assert.match(pickTexts('lunge', 'lite', FAST, 23).options[1].sub, /不判斷「膝超過腳尖」/);
});

test('用哪一個 AI：YOLO 不判斷的錯誤和鏡頭畫面上寫的是同一份（form.js 的 unjudgedRules）；伏地挺身、棒式每一種都判斷', () => {
    for (const id of PICKS) {
        const yolo = pickTexts(id, 'yolo-n', FAST, 23).options[1];
        const blind = unjudgedRules(id, false);
        for (const rule of blind) assert.ok(yolo.sub.includes('「' + rule + '」'), id + '：' + rule);
        if (!blind.length) assert.match(yolo.sub, new RegExp('做' + WORKOUTS[id].name + '時每一種錯誤都判斷'), id);
        assert.equal(yolo.checked, true);
    }
});

test('用哪一個 AI：卡片的名字照「進階設定」選的大小；現在選的是哪一家就勾哪一張', () => {
    let t = pickTexts('pushup', 'yolo-s', { mediapipe: 'full', yolo: 'yolo-s' }, 22);
    assert.deepEqual(t.options.map(o => [o.label, o.checked]), [['MediaPipe full', false], ['YOLO26s', true]]);
    t = pickTexts('pushup', 'auto', { mediapipe: 'auto', yolo: 'yolo-n' }, 23);
    assert.deepEqual(t.options.map(o => [o.label, o.checked]), [['MediaPipe（自動）', true], ['YOLO26n', false]]);
});

test('用哪一個 AI：被改過的值（動作、模型、下載大小）不會拿去查物件，也不會寫出怪字', () => {
    for (const bad of ['constructor', '__proto__', 'free', '', null, undefined, 42]) {
        const t = pickTexts(bad, 'lite', FAST, 23);
        assert.equal(t.title, '用哪一個 AI？', String(bad));
        assert.doesNotMatch(t.options[1].sub, /undefined|null|NaN|不判斷/, String(bad));
    }
    const t = pickTexts('squat', 'constructor', { mediapipe: 'yolo-n', yolo: '__proto__' }, NaN);
    assert.deepEqual(t.options.map(o => [o.label, o.checked]), [['MediaPipe lite', false], ['YOLO26n', false]]);
    assert.doesNotMatch(t.options[1].sub, /MB|NaN/);
    assert.deepEqual(pickTexts('squat', 'lite', null, 23).options.map(o => o.label), ['MediaPipe lite', 'YOLO26n']);
});
