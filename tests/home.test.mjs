// 首頁「今天要做什麼運動？」、運動完問一次雲端同步、使用說明的實測任務卡（10/19 首頁改版）
// 畫面的部分在瀏覽器測試；這裡測決定要怎麼顯示的規則
import test from 'node:test';
import assert from 'node:assert/strict';
import { PICKS, startLook, FREE_TEXT } from '../js/ui/start-pick.js';
import { shouldAskCloud, loadAsked, saveAsked } from '../js/ui/cloud-ask.js';
import { cleanDone, progressText } from '../js/ui/task-card.js';
import { WORKOUTS } from '../js/analysis/workouts.js';

test('四個大按鈕：計次、計時的動作都有，自由模式不在裡面', () => {
    assert.deepEqual(PICKS.slice().sort(), Object.keys(WORKOUTS).filter(id => id !== 'free').sort());
});

test('「用目前的動作開鏡頭」的按鈕：選了動作就放在那個動作的位置，自由模式是最下面的小字', () => {
    for (const id of PICKS) {
        const look = startLook(id);
        assert.equal(look.place, id);
        assert.equal(look.name, WORKOUTS[id].name);
        assert.ok(look.sub.length > 0);
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
