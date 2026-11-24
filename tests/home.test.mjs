// 首頁「今天要做什麼運動？」、運動完問一次雲端同步、使用說明的實測任務卡（10/19 首頁改版）
// 畫面的部分在瀏覽器測試；這裡測決定要怎麼顯示的規則
import test from 'node:test';
import assert from 'node:assert/strict';
import { PICKS, startLook, FREE_TEXT } from '../js/ui/start-pick.js';
import { pickTexts, choiceLabel } from '../js/ui/model-pick.js';
import { insetFrom } from '../js/ui/model-screen.js';
import { unjudgedRules } from '../js/analysis/form.js';
import { shouldAskCloud, loadAsked, saveAsked } from '../js/ui/cloud-ask.js';
import { cleanDone, progressText } from '../js/ui/task-card.js';
import { WORKOUTS } from '../js/analysis/workouts.js';

test('四個大按鈕：計次、計時的動作都有，自由模式不在裡面', () => {
    assert.deepEqual(PICKS.slice().sort(), Object.keys(WORKOUTS).filter(id => id !== 'free').sort());
});

test('「用目前的動作開鏡頭」的按鈕（#startBtn）：選過動作寫「開始深蹲 · MediaPipe lite」（11/24 起回到首頁直接用上次選的 AI），自由模式是最下面的小字', () => {
    for (const id of PICKS) {
        const look = startLook(id, 'MediaPipe lite');
        assert.equal(look.place, id);
        assert.equal(look.text, '開始' + WORKOUTS[id].name + ' · MediaPipe lite');
        // 沒給 AI 的名字（或不是字串）：只寫「開始深蹲」，不會寫出 undefined
        for (const none of [undefined, '', null, 42]) assert.equal(startLook(id, none).text, '開始' + WORKOUTS[id].name, String(none));
    }
    assert.equal(startLook('squat', 'YOLO26n').text, '開始深蹲 · YOLO26n');
    assert.deepEqual(startLook('free', 'MediaPipe lite'), { place: 'free', text: FREE_TEXT });
    // 認不得的代號（網址、存的資料被改過）：當作自由模式，不會拿去查物件
    for (const bad of ['constructor', 'toString', '', undefined, null, 42]) assert.equal(startLook(bad).place, 'free', String(bad));
});

test('AI 的名字（卡片、首頁的「開始深蹲 · …」同一個）：照進階設定選的大小；自動寫「MediaPipe（自動）」；被改過的值是空字串', () => {
    assert.deepEqual(['lite', 'full', 'auto', 'yolo-n', 'yolo-s'].map(choiceLabel),
        ['MediaPipe lite', 'MediaPipe full', 'MediaPipe（自動）', 'YOLO26n', 'YOLO26s']);
    for (const bad of ['constructor', '__proto__', 'toString', '', null, undefined, 42]) assert.equal(choiceLabel(bad), '', String(bad));
});

test('選 AI 的轉場畫面從按的那顆按鈕展開：剪裁的起點就是按鈕的位置；按鈕超出畫面時夾在畫面裡；量不到時從正中間', () => {
    // 320×640 的手機，按鈕在左上（上 100、左 20、寬 130、高 76）：上、右、下、左各剪掉多少
    assert.equal(insetFrom({ top: 100, left: 20, right: 150, bottom: 176 }, 320, 640), 'inset(100px 170px 464px 20px round 12px)');
    // 往下捲過頭：按鈕上面一段在畫面外，從畫面最上面開始
    assert.equal(insetFrom({ top: -30, left: 20, right: 150, bottom: 46 }, 320, 640), 'inset(0px 170px 594px 20px round 12px)');
    // 整顆在畫面下面（收起前首頁被捲走了）：縮到畫面最下面那一條
    assert.equal(insetFrom({ top: 700, left: 20, right: 150, bottom: 776 }, 320, 640), 'inset(640px 170px 0px 20px round 12px)');
    // 小數點（字型、縮放）：四捨五入成整數像素
    assert.equal(insetFrom({ top: 99.6, left: 20.4, right: 150.5, bottom: 176.2 }, 320, 640), 'inset(100px 170px 464px 20px round 12px)');
    for (const bad of [null, undefined, {}, { top: NaN, left: 0, right: 10, bottom: 10 }, { top: '1', left: 0, right: 10, bottom: 10 }]) {
        assert.equal(insetFrom(bad, 320, 640), 'inset(320px 160px round 12px)', JSON.stringify(bad));
    }
    assert.equal(insetFrom({ top: 0, left: 0, right: 10, bottom: 10 }, 0, 0), 'inset(0px 0px round 12px)', '畫面大小量不到');
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
    // 卡片上一條一行的重點；sub 是接成一句（螢幕閱讀器、瀏覽器測試用）
    assert.deepEqual(mp.points, ['網站一直在用的，比較快', '看得到腳跟、腳尖', '每一種錯誤都判斷']);
    assert.deepEqual(yolo.points, ['畫面裡有好幾個人時，點一下就能換人', '沒有腳跟、腳尖，不判斷「腳跟離地」', '第一次用要下載約 23 MB']);
    assert.equal(yolo.sub, yolo.points.join('；'));
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
