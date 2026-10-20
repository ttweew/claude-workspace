// 實測模式（js/data/test-mode.js，10/20）：受測者代號、每一組可以選的、錄製檔裡的實測資訊、檔名
// 鏡頭畫面上的按鈕、倒數、自動下載在瀏覽器測試
import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanSubject, conditionsFor, conditionOf, loadTestMode, saveTestMode, testInfo, testMeta, testFileName, SUBJECT_MAX } from '../js/data/test-mode.js';
import { FORM_RULES } from '../js/analysis/form.js';
import { WORKOUTS } from '../js/analysis/workouts.js';
import { PoseRecorder, recordingName } from '../js/data/recorder.js';
import { parseRecording } from '../js/data/replay-core.js';
import { demoFrames } from './helpers.mjs';

const BAD_IDS = ['constructor', 'toString', '__proto__', 'hasOwnProperty', '', null, undefined, 42, {}];

test('受測者代號：只留英文字母和數字（全形也認得）、英文大寫、最多 8 個字；整理完是空的就用 A', () => {
    assert.equal(cleanSubject('a'), 'A');
    assert.equal(cleanSubject(' b 2 '), 'B2');
    assert.equal(cleanSubject('Ａ３'), 'A3');
    assert.equal(cleanSubject('../x'), 'X', '檔名裡不會出現路徑');
    assert.equal(cleanSubject('ABCDEFGHIJKL').length, SUBJECT_MAX);
    // 名字（中文）不會被寫進檔名：整理完是空的，用 A
    for (const bad of ['王小明', '', '  ', '<>', null, undefined, {}]) assert.equal(cleanSubject(bad), 'A', String(bad));
    assert.equal(cleanSubject(42), '42');
});

test('每一組可以選的：做對 10 下、每種錯誤故意做 5 下；棒式做對撐 30 秒、錯誤各 10 秒（和受測者卡一樣）', () => {
    assert.deepEqual(conditionsFor('squat'), [
        { id: 'good', name: '做對', amount: 10, unit: '下' },
        { id: 'lean', name: '故意上身前傾', amount: 5, unit: '下' },
        { id: 'heel', name: '故意腳跟離地', amount: 5, unit: '下' }
    ]);
    assert.deepEqual(conditionsFor('plank').map(c => [c.id, c.amount, c.unit]), [['good', 30, '秒'], ['sag', 10, '秒'], ['pike', 10, '秒']]);
    assert.equal(conditionOf('lunge', 'knee').name, '故意前膝超過腳尖');
    // 每個動作的每一種錯誤都選得到（之後加了新的錯誤規則，這裡自動多一組）
    for (const [id, w] of Object.entries(WORKOUTS)) {
        if (!w.kind) continue;
        assert.deepEqual(conditionsFor(id).map(c => c.id), ['good', ...FORM_RULES[id].map(r => r.id)], id);
    }
    // 自由模式、認不得的動作沒有可以選的組
    assert.deepEqual(conditionsFor('free'), []);
    for (const bad of BAD_IDS) assert.deepEqual(conditionsFor(bad), [], String(bad));
    for (const bad of BAD_IDS) assert.equal(conditionOf('squat', bad), null, String(bad));
    assert.equal(conditionOf('pushup', 'heel'), null, '伏地挺身沒有腳跟離地');
});

test('開關和代號存在這台裝置上；存的值被改壞、存不了時用預設（關、A），不會出錯', () => {
    const store = new Map();
    globalThis.localStorage = { getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)) };
    assert.deepEqual(loadTestMode(), { on: false, subject: 'A' });
    saveTestMode({ on: true, subject: 'b' });
    assert.deepEqual(loadTestMode(), { on: true, subject: 'B' });
    for (const [bad, want] of [
        ['{壞掉', { on: false, subject: 'A' }],
        ['"A"', { on: false, subject: 'A' }],
        ['[]', { on: false, subject: 'A' }],
        ['{"on":"yes","subject":{}}', { on: false, subject: 'A' }],
        ['{"on":true,"subject":"<img src=x onerror=1>"}', { on: true, subject: 'IMGSRCXO' }]
    ]) {
        store.set('testMode', bad);
        assert.deepEqual(loadTestMode(), want, bad);
    }
    globalThis.localStorage = { getItem: () => { throw new Error('SecurityError'); }, setItem: () => { throw new Error('QuotaExceeded'); } };
    assert.deepEqual(loadTestMode(), { on: false, subject: 'A' });
    assert.doesNotThrow(() => saveTestMode({ on: true, subject: 'C' }));
    delete globalThis.localStorage;
});

test('錄製檔裡的實測資訊：開始錄時寫進 meta.test；被改過、對不上的當成一般錄製檔', () => {
    assert.deepEqual(testMeta('a', 'heel', 'squat'), { subject: 'A', condition: 'heel', reps: 5 });
    assert.deepEqual(testMeta('B', 'good', 'plank'), { subject: 'B', condition: 'good', seconds: 30 });
    assert.equal(testMeta('A', 'heel', 'pushup'), null);
    const meta = { workout: 'squat', startedAt: '2026-10-21T07:30:12.000Z', test: { subject: 'A', condition: 'heel', reps: 5 } };
    assert.deepEqual(testInfo(meta), { subject: 'A', workout: 'squat', condition: 'heel', name: '故意腳跟離地', amount: 5, unit: '下' });
    const forged = [
        null, undefined, 'x', {}, { workout: 'squat' },
        { ...meta, test: 'A' },
        { ...meta, test: { subject: 'a', condition: 'heel' } },          // 網站寫的一定是整理過的代號
        { ...meta, test: { subject: '', condition: 'heel' } },
        { ...meta, test: { subject: '../A', condition: 'heel' } },
        { ...meta, test: { subject: 42, condition: 'heel' } },
        { ...meta, test: { subject: 'A', condition: 'constructor' } },
        { ...meta, workout: 'pushup' },                                    // 伏地挺身沒有腳跟離地
        { ...meta, workout: 'constructor' },
        { ...meta, workout: 'free' }
    ];
    for (const bad of forged) {
        assert.equal(testInfo(bad), null, JSON.stringify(bad));
        assert.equal(testFileName(bad), null, JSON.stringify(bad));
    }
});

test('檔名：test_代號_動作_這組要做的_日期_時間，只有英文、數字和底線；時間和一般錄製檔一樣', () => {
    const meta = { workout: 'lunge', startedAt: '2026-10-21T07:30:12.000Z', test: { subject: 'B2', condition: 'knee', reps: 5 } };
    const name = testFileName(meta);
    assert.match(name, /^test_B2_lunge_knee_\d{8}_\d{6}$/);
    assert.equal(name, recordingName(meta).replace('pose_', 'test_B2_lunge_knee_'));
    for (const id of Object.keys(WORKOUTS)) {
        for (const c of conditionsFor(id)) {
            assert.match(testFileName({ workout: id, startedAt: meta.startedAt, test: testMeta('A', c.id, id) }), /^[A-Za-z0-9_]+$/, id + ' ' + c.id);
        }
    }
});

test('實測資訊跟著錄製檔走：匯出 JSON 再讀回來（重播分析）還認得是哪位受測者、哪一組', () => {
    const recorder = new PoseRecorder();
    recorder.start({ videoWidth: 640, videoHeight: 480, workout: 'squat', test: testMeta('C', 'lean', 'squat') });
    for (const f of demoFrames({ yaw: 5 }).slice(0, 30)) recorder.add(f.t, f.raw, f.world, f.raw, f.world);
    recorder.stop();
    const parsed = parseRecording(recorder.toJSON());
    assert.deepEqual(testInfo(parsed.meta), { subject: 'C', workout: 'squat', condition: 'lean', name: '故意上身前傾', amount: 5, unit: '下' });
    assert.equal(testFileName(parsed.meta), testFileName(recorder.meta));
    // 一般錄製檔（沒有 meta.test）照舊是 pose_…，JSON 裡也不會多一個空的 test
    const plain = new PoseRecorder();
    plain.start({ workout: 'squat' });
    assert.equal(testFileName(plain.meta), null);
    assert.ok(!plain.toJSON().includes('"test"'));
});
