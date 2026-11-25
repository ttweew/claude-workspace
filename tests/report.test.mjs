// 實測報表（10/21）：每一組的比對（js/data/test-report.js）、讀 zip（js/data/unzip.js）、一個檔案的重算（js/data/report-core.js）
// 只用合成資料：受測者的真人錄製檔不放進專案
import test from 'node:test';
import assert from 'node:assert/strict';
import { setResult, markRedos, summarizeReport, ratioText, countedText, verdictText, reportCsv, ruleTables, labelCounts, modelText } from '../js/data/test-report.js';
import { scores, percentText, addCounts, cleanCounts } from '../js/data/metrics.js';
import { readFileSync } from 'node:fs';
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
    // 開頭是 Tab、換行的檔名（10/24 安全複查）
    for (const name of ['\t=1+1.json', '\r=1+1.json']) {
        const row = reportCsv([setResult(info('squat', 'lean'), reps('lean'), 'reps', 0, name)]).split('\r\n').slice(1).join('\r\n');
        assert.ok(row.includes("'" + name), JSON.stringify(row));
    }
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
    // 解出來加起來超過上限（10/24 安全複查：以前只限一個檔案）：放不下的跳過（第一個約 5 KB），放得下的照樣讀
    const capped = await readZip(await makeZip(files, { compress: true }), name => name.endsWith('.json'), 3000);
    assert.deepEqual([capped.files.map(f => f.name), capped.skipped], [['中文.json'], 1]);
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

// ---------- 老師的四個指標（11/18 白板，11/25 放進實測報表；js/data/metrics.js） ----------
const pct = c => { const x = scores(c); return [x.precision, x.recall, x.accuracy, x.f1].map(percentText); };

test('四個指標：10/20 真人實測（抓到 49、漏掉 1、誤報 7、沒事 43）和 11/18 手算的一字不差', () => {
    assert.deepEqual(pct({ tp: 49, fn: 1, fp: 7, tn: 43 }), ['87.5%', '98%', '92%', '92.5%']);
    // F1 和「2 × 精確率 × 召回率 ÷（精確率＋召回率）」一樣
    const x = scores({ tp: 49, fn: 1, fp: 7, tn: 43 });
    assert.ok(Math.abs(x.f1 - 2 * x.precision * x.recall / (x.precision + x.recall)) < 1e-12);
    // 百分比：小數一位、整數不寫 .0
    assert.deepEqual([1, 0, 2 / 3, 0.9995, 0.12345].map(percentText), ['100%', '0%', '66.7%', '100%', '12.3%']);
});

test('四個指標：分母是 0 時寫「—」，不寫 NaN；被改過的數字當作 0', () => {
    // 這批沒有故意做錯的組：沒有召回率、F1；一下都沒報：沒有精確率
    assert.deepEqual(pct({ tp: 0, fn: 0, fp: 0, tn: 10 }), ['—', '—', '100%', '—']);
    // 真的做錯的全部漏掉：精確率算不出來，召回率、F1 是 0（不是「—」）
    assert.deepEqual(pct({ tp: 0, fn: 5, fp: 0, tn: 5 }), ['—', '0%', '50%', '0%']);
    assert.deepEqual(pct({}), ['—', '—', '—', '—']);
    for (const bad of [{ tp: NaN, fn: -3, fp: '5', tn: Infinity }, null, undefined, 'x']) {
        assert.deepEqual(cleanCounts(bad), { tp: 0, fn: 0, fp: 0, tn: 0 }, JSON.stringify(bad));
        assert.ok(!pct(bad).some(t => /NaN|Infinity|undefined/.test(t)), JSON.stringify(bad));
    }
    assert.deepEqual(addCounts({ tp: 1, fn: 2, fp: 3, tn: 4 }, { tp: 10, fn: NaN }), { tp: 11, fn: 2, fp: 3, tn: 4 });
    assert.deepEqual([null, undefined, NaN, '50%', Infinity].map(percentText), ['—', '—', '—', '—', '—']);
});

test('四個指標：每個動作一列＋合計（計次的動作），棒式一組一格；重錄的不算；YOLO 判斷不了的組不算進來、另外列出', () => {
    const rows = markRedos([
        // MediaPipe（檔案沒寫模型的當作 MediaPipe）
        setResult(info('squat', 'good'), reps('', '', 'heel', '', '', '', '', '', '', ''), 'reps', 1, 'a.json', 'lite'),
        setResult(info('squat', 'good'), reps('lean', 'lean', '', '', '', '', '', '', '', ''), 'reps', 0, 'old.json', 'lite'),   // 比較早：重錄，不算
        setResult(info('squat', 'lean'), reps('lean', 'lean', 'lean', '', 'lean'), 'reps', 2, 'b.json', ''),
        setResult(info('squat', 'heel'), reps('heel', 'heel', '', 'heel', 'heel'), 'reps', 3, 'c.json', 'full'),
        setResult(info('lunge', 'good'), reps('', '', '', '', '', '', '', '', '', ''), 'reps', 4, 'd.json', 'full'),
        setResult(info('lunge', 'knee'), reps('knee', 'knee', 'knee', 'knee', 'knee'), 'reps', 5, 'e.json', 'lite'),
        setResult(info('plank', 'good'), [{ seconds: 30, errors: ['pike'] }], 'hold', 6, 'f.json', 'lite'),
        setResult(info('plank', 'sag'), [{ seconds: 10, errors: ['sag'] }], 'hold', 7, 'g.json', 'lite'),
        // YOLO：深蹲故意腳跟離地的組判斷不了（沒有腳跟），不算進來
        setResult(info('squat', 'good', 'B'), reps('', '', '', '', '', '', '', '', '', 'lean'), 'reps', 8, 'h.json', 'yolo-n'),
        setResult(info('squat', 'lean', 'B'), reps('lean', 'lean', 'lean', 'lean', 'lean'), 'reps', 9, 'i.json', 'yolo-s'),
        setResult(info('squat', 'heel', 'B'), reps('', '', '', '', ''), 'reps', 10, 'j.json', 'yolo-n')
    ]);
    const [mp, yolo] = ruleTables(rows);
    assert.equal(mp.family, 'mediapipe');
    assert.deepEqual(mp.lines.map(l => [l.label, l.counts]), [
        ['深蹲', { tp: 8, fn: 2, fp: 1, tn: 9 }],         // 前傾抓到 4／5、腳跟 4／5；做對的 10 下誤報 1 下（重錄的那組不算）
        ['弓箭步', { tp: 5, fn: 0, fp: 0, tn: 10 }],
        ['合計', { tp: 13, fn: 2, fp: 1, tn: 19 }],
        ['棒式（以組計）', { tp: 1, fn: 0, fp: 1, tn: 0 }]
    ]);
    assert.deepEqual(mp.skipped, []);
    assert.deepEqual(pct(mp.lines[2].counts), ['92.9%', '86.7%', '91.4%', '89.7%']);
    assert.equal(mp.lines[2].precision, 13 / 14);
    assert.equal(yolo.family, 'yolo');
    assert.deepEqual(yolo.lines.map(l => [l.label, l.counts]), [['深蹲', { tp: 5, fn: 0, fp: 1, tn: 9 }]]);
    assert.deepEqual(yolo.skipped, [{ workout: 'squat', condition: 'heel', name: '故意腳跟離地', sets: 1 }]);
    // 只有 MediaPipe 的時候只有一張；沒有可以算的（全部是重錄、或全部判斷不了）時列不出來，但判斷不了的照樣寫
    assert.deepEqual(ruleTables(rows.filter(r => r.family === 'mediapipe')).map(g => g.family), ['mediapipe']);
    const onlyBlind = ruleTables([setResult(info('lunge', 'knee'), reps('', ''), 'reps', 0, 'k.json', 'yolo-n')]);
    assert.deepEqual(onlyBlind.map(g => [g.family, g.lines.length, g.skipped.length]), [['yolo', 0, 1]]);
    assert.deepEqual(ruleTables([]), []);
});

test('錄的模型：檔案記的模型名字被改過時當作 MediaPipe；只有要看腳的錯誤在 YOLO 時不算；CSV 多一欄模型', () => {
    for (const bad of ['constructor', '__proto__', 'yolo-x', 'YOLO26n', '', null, undefined, 42]) {
        const r = setResult(info('squat', 'heel'), reps('heel'), 'reps', 0, 'x.json', bad);
        assert.deepEqual([r.model, r.family, r.blind], ['', 'mediapipe', false], String(bad));
    }
    const pick = (workout, condition, model) => setResult(info(workout, condition), reps(''), workout === 'plank' ? 'hold' : 'reps', 0, 'x.json', model).blind;
    assert.deepEqual(['heel', 'lean', 'good'].map(c => pick('squat', c, 'yolo-n')), [true, false, false]);
    assert.deepEqual(['knee', 'lean'].map(c => pick('lunge', c, 'yolo-s')), [true, false]);
    assert.deepEqual(['sag', 'pike'].map(c => pick('pushup', c, 'yolo-n')), [false, false]);
    assert.equal(pick('squat', 'heel', 'full'), false);
    // 「自動」是設定（在 full 和 lite 之間換），錄製檔記的是當時真的在用的那一個，所以不是模型的名字
    assert.deepEqual(['lite', 'full', 'yolo-n', 'yolo-s', 'auto', '', 'constructor'].map(modelText),
        ['MediaPipe lite', 'MediaPipe full', 'YOLO26n', 'YOLO26s', '', '', '']);
    const csv = reportCsv([setResult(info('squat', 'lean'), reps('lean'), 'reps', 0, 'y.json', 'yolo-n')]);
    const [head, line] = csv.split('\r\n');
    assert.ok(head.endsWith('重錄（不算）,模型,檔名,開始錄'), head);
    assert.ok(line.endsWith(',YOLO26n,y.json,'), line);
});

test('AI 模型、規則猜每一下的四格：故意做錯的那一下猜對那一種錯才算抓到', () => {
    const pairs = [
        { truth: 'lean', guess: 'lean' }, { truth: 'lean', guess: 'heel' }, { truth: 'lean', guess: 'good' },
        { truth: 'good', guess: 'good' }, { truth: 'good', guess: 'lean' }, { truth: 'heel', guess: 'heel' }
    ];
    assert.deepEqual(labelCounts(pairs), { tp: 2, fn: 2, fp: 1, tn: 1 });
    assert.deepEqual(labelCounts([]), { tp: 0, fn: 0, fp: 0, tn: 0 });
});

test('研究成果頁的四個指標和四格算出來的一樣（改了數字忘了改另一個會被抓到）', () => {
    const html = readFileSync(new URL('../results.html', import.meta.url), 'utf8');
    const start = html.indexOf('id="metricsTitle"');
    assert.ok(start > 0, '研究成果頁有「老師的四個指標」');
    const part = html.slice(start, html.indexOf('</section>', start)).replace(/<[^>]+>/g, '');
    const num = re => Number(part.match(re)[1]);
    const c = { tp: num(/抓到 (\d+)/), fn: num(/漏掉 (\d+)/), fp: num(/誤報 (\d+)/), tn: num(/沒事 (\d+)/) };
    assert.deepEqual(c, { tp: 49, fn: 1, fp: 7, tn: 43 });
    const shown = [...html.slice(start).matchAll(/<span class="stat-value">([^<]+)<\/span><span class="stat-label">(精確率|召回率|準確率|F1)/g)].slice(0, 4);
    assert.deepEqual(shown.map(m => m[2]), ['精確率', '召回率', '準確率', 'F1']);
    assert.deepEqual(shown.map(m => m[1]), pct(c));
    // 說明裡的分母：網站說「做錯」的（抓到＋誤報）、真的做錯的（抓到＋漏掉）、全部、判對的（抓到＋沒事）
    assert.match(part, new RegExp('網站說「做錯」的 ' + (c.tp + c.fp) + ' 下，真的做錯 ' + c.tp + ' 下'));
    assert.match(part, new RegExp('真的做錯的 ' + (c.tp + c.fn) + ' 下，抓到 ' + c.tp + ' 下'));
    assert.match(part, new RegExp((c.tp + c.fn + c.fp + c.tn) + ' 下裡判對 ' + (c.tp + c.tn) + ' 下'));
    // 和最上面「一眼看完」的 49／50、7／50 是同一批
    assert.ok(html.includes('<span class="stat-value">' + c.tp + '／' + (c.tp + c.fn) + '</span>'));
    assert.ok(html.includes('<span class="stat-value">' + c.fp + '／' + (c.fp + c.tn) + '</span>'));
});
