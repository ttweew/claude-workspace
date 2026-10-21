// 實測報表（10/21）：每一組的比對（js/data/test-report.js）、讀 zip（js/data/unzip.js）、一個檔案的重算（js/data/report-core.js）
// 只用合成資料：受測者的真人錄製檔不放進專案
import test from 'node:test';
import assert from 'node:assert/strict';
import { setResult, markRedos, summarizeReport, ratioText, countedText, verdictText, reportCsv } from '../js/data/test-report.js';
import { readZip } from '../js/data/unzip.js';
import { makeZip } from '../js/data/zip.js';
import { analyzeOne } from '../js/data/report-core.js';
import { makeDemoRecording } from '../js/data/synth.js';
import { testInfo, testMeta } from '../js/data/test-mode.js';

const info = (workout, condition, subject = 'A') => testInfo({ workout, test: testMeta(subject, condition, workout) });
const reps = (...errors) => errors.map(e => ({ errors: e ? e.split('+') : [] }));

test('每一組：次數對不對、故意做錯抓到幾下、做對的誤報幾下；棒式看有沒有出現那種錯誤', () => {
    let r = setResult(info('squat', 'good'), reps('', '', 'heel', '', '', '', '', '', '', ''), 'reps', 1, 'a.json');
    assert.deepEqual([r.counted, r.countOk, r.caught, r.falseAlarms], [10, true, null, 1]);
    assert.equal(verdictText(r), '誤報 1 下（腳跟離地 1）');
    r = setResult(info('squat', 'lean'), reps('lean', 'lean', 'lean+heel', '', 'lean', 'lean'), 'reps');
    assert.deepEqual([r.expected, r.counted, r.countOk, r.caught, r.otherErrors], [5, 6, false, 5, 1], '多算一下；抓到最多算到 5 下');
    assert.equal(verdictText(r), '抓到 5／5 下（另外報了 腳跟離地 1）');
    assert.equal(countedText(r), '6 下');
    r = setResult(info('squat', 'heel'), reps('', '', '', '', ''), 'reps');
    assert.equal(verdictText(r), '抓到 0／5 下');
    // 棒式：撐了幾秒加起來（無條件捨去）；故意做錯有出現就算抓到；做對的出現任何錯誤算誤報
    r = setResult(info('plank', 'good'), [{ seconds: 20.7, errors: [] }, { seconds: 9.9, errors: ['pike'] }], 'hold');
    assert.deepEqual([r.expected, r.unit, r.falseAlarms], [30, '秒', 1]);
    assert.equal(countedText(r), '撐了 30 秒');
    assert.equal(verdictText(r), '誤報：屁股太高 1');
    r = setResult(info('plank', 'pike'), [], 'hold');
    assert.equal(countedText(r), '沒有開始計時');
    assert.equal(verdictText(r), '沒抓到');
    // 被改壞的每一下（errors 不是陣列）不會出錯
    r = setResult(info('lunge', 'knee'), [{ errors: 'knee' }, {}, { errors: ['knee'] }], 'reps');
    assert.equal(r.caught, 1);
});

test('重錄的組以最後一次為準；整體統計不算重錄的；比例的文字', () => {
    const rows = [
        setResult(info('squat', 'good'), reps('', '', '', '', '', '', '', ''), 'reps', 100, 'first.json'),       // 第一次只算到 8 下：重錄
        setResult(info('squat', 'good'), reps('', '', '', '', '', '', '', '', '', ''), 'reps', 200, 'second.json'),
        setResult(info('squat', 'lean'), reps('lean', 'lean', 'lean', '', 'lean'), 'reps', 300),
        setResult(info('squat', 'lean', 'B'), reps('lean', 'lean', 'lean', 'lean', 'lean'), 'reps', 300),
        setResult(info('pushup', 'good', 'B'), reps('', 'pike', '', '', '', '', '', '', '', ''), 'reps', 400),
        setResult(info('plank', 'good', 'B'), [{ seconds: 31, errors: [] }], 'hold', 500),
        setResult(info('plank', 'sag', 'B'), [{ seconds: 11, errors: ['sag'] }], 'hold', 600)
    ];
    markRedos(rows);
    assert.deepEqual(rows.map(r => r.redo), [true, false, false, false, false, false, false]);
    const s = summarizeReport(rows);
    assert.equal(s.sets, 6);
    assert.equal(s.redos, 1);
    assert.deepEqual(s.people, ['A', 'B']);
    assert.deepEqual(s.count, { ok: 4, total: 4 });
    const lean = s.errors.find(e => e.condition === 'lean');
    assert.deepEqual([lean.caught, lean.total], [9, 10]);
    const sag = s.errors.find(e => e.condition === 'sag');
    assert.deepEqual([sag.caught, sag.total, sag.kind], [1, 1, 'hold']);
    assert.deepEqual(s.falseAlarms, { reps: 1, of: 20, holds: 0, holdSets: 1 });
    assert.equal(ratioText(9, 10), '9／10（90%）');
    assert.equal(ratioText(0, 0), '—');
});

test('報表 CSV：Excel 打得開（BOM）；檔名開頭是 = 時不會被當成公式；有逗號的加引號', () => {
    const r = setResult(info('squat', 'lean'), reps('lean', 'lean,x', '', '', ''), 'reps', Date.UTC(2026, 9, 20, 13, 0), '=HYPERLINK("x"),a.json');
    const csv = reportCsv(markRedos([r]));
    assert.ok(csv.startsWith('﻿受測者,動作,這組,應做'));
    const line = csv.split('\r\n')[1];
    assert.ok(line.startsWith('A,深蹲,故意上身前傾,5,下,5,對,1,,'), line);
    assert.ok(line.includes(`"'=HYPERLINK(""x""),a.json"`), line);
});

test('讀 zip：錄製檔清單壓的 zip（壓縮、不壓縮）、中文檔名、只拿 JSON；壞掉、大小不對的那個跳過，其他照樣讀；不是 zip 會說明', async () => {
    const files = [
        { name: 'test_A_squat_good_20261020_210000.json', blob: new Blob([JSON.stringify({ a: 'x'.repeat(5000) })]), date: new Date() },
        { name: '說明.txt', blob: new Blob(['hello']), date: new Date() },
        { name: '中文.json', blob: new Blob(['{}']), date: new Date() }
    ];
    for (const compress of [true, false]) {
        const z = await readZip(await makeZip(files, { compress }), name => name.endsWith('.json'));
        assert.deepEqual(z.files.map(f => f.name), ['test_A_squat_good_20261020_210000.json', '中文.json']);
        assert.equal(await z.files[0].blob.text(), JSON.stringify({ a: 'x'.repeat(5000) }));
        assert.equal(z.skipped, 0);
    }
    // 第一個檔案的內容被改了一個字：CRC 對不上，跳過；第二個照樣讀
    const buf = new Uint8Array(await (await makeZip(files, { compress: false })).arrayBuffer());
    const at = buf.findIndex((b, i) => b === 0x78 && buf[i + 1] === 0x78);
    buf[at] = 0x79;
    const z = await readZip(new Blob([buf]), name => name.endsWith('.json'));
    assert.deepEqual([z.files.map(f => f.name), z.skipped], [['中文.json'], 1]);
    // 目錄寫的大小被改小（解出來比寫的大）：跳過這個（解到寫的大小就停，見 unzip.js），其他照樣讀
    const packed = new Uint8Array(await (await makeZip(files, { compress: true })).arrayBuffer());
    const dir = new DataView(packed.buffer);
    let p = packed.length - 22;
    while (dir.getUint32(p, true) !== 0x06054B50) p--;
    dir.setUint32(dir.getUint32(p + 16, true) + 24, 100, true);
    const small = await readZip(new Blob([packed]), name => name.endsWith('.json'));
    assert.deepEqual([small.files.map(f => f.name), small.skipped], [['中文.json'], 1]);
    await assert.rejects(readZip(new Blob(['not a zip at all'])), /不是 zip/);
    await assert.rejects(readZip(new Blob([buf.subarray(0, buf.length - 30)])), /zip/);
});

test('一個實測檔重算：和重播分析同一套算法；不是實測模式錄的檔案會說明', async () => {
    const rec = makeDemoRecording({ yaw: 8 });
    rec.meta.workout = 'squat';
    rec.meta.test = testMeta('A', 'good', 'squat');
    const r = await analyzeOne(JSON.stringify(rec));
    assert.deepEqual([r.info.subject, r.info.condition, r.info.amount, r.kind], ['A', 'good', 10, 'reps']);
    assert.equal(r.items.length, 5, '示範資料 5 下');
    assert.ok(r.items.every(i => Array.isArray(i.errors)));
    delete rec.meta.test;
    await assert.rejects(analyzeOne(JSON.stringify(rec)), /不是實測/);
    rec.meta.test = { subject: 'A', condition: 'constructor' };
    await assert.rejects(analyzeOne(JSON.stringify(rec)), /不是實測/);
});
