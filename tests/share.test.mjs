// 分享這次的結果（js/analysis/share-text.js，11/14）：把首頁「這次運動」寫的幾行整理成一段文字
import test from 'node:test';
import assert from 'node:assert/strict';
import { shareText, shareDate, SHARE_MAX } from '../js/analysis/share-text.js';

// 這台電腦時區的 2026/11/14 17:05
const WHEN = new Date(2026, 10, 14, 17, 5).getTime();

test('日期時間照這台裝置的時區；壞掉的時間不寫', () => {
    assert.equal(shareDate(WHEN), '11/14 17:05');
    assert.equal(shareDate(new Date(2026, 0, 3, 9, 0).getTime()), '1/3 09:00');
    for (const bad of [NaN, undefined, 'abc', {}]) assert.equal(shareDate(bad), '', String(bad));
});

test('照畫面上的順序：標題和時間、做了哪些動作、總結每一行、AI 評分、教練建議、網址', () => {
    const text = shareText({
        date: WHEN,
        list: '這次做了 2 個動作（智慧課表）：深蹲 11 下 → 伏地挺身 8 下',
        lines: ['伏地挺身 8 下 · 1.2 分鐘', '到位 7 下、再低一點 1 下'],
        ai: ['AI 評分（每一下 0～100 分：AI 覺得做對的把握 × 和示範動作有多像）：平均 78 分；最好第 1 下 94 分、最差第 4 下 12 分。'],
        advice: ['做得好：每一下都沒有偵測到錯誤。', '下次試試多做 2 下。'],
        url: 'https://ttweew.github.io/claude-workspace/'
    });
    assert.deepEqual(text.split('\n'), [
        'AI 智慧運動分析系統｜11/14 17:05',
        '這次做了 2 個動作（智慧課表）：深蹲 11 下 → 伏地挺身 8 下',
        '伏地挺身 8 下 · 1.2 分鐘',
        '到位 7 下、再低一點 1 下',
        'AI 評分（每一下 0～100 分：AI 覺得做對的把握 × 和示範動作有多像）：平均 78 分；最好第 1 下 94 分、最差第 4 下 12 分。',
        '教練建議：做得好：每一下都沒有偵測到錯誤。下次試試多做 2 下。',
        'https://ttweew.github.io/claude-workspace/'
    ]);
});

test('沒有的段落不寫（只做一個動作、這個動作沒有 AI 模型、沒有教練建議）；空白、不是字串的不寫', () => {
    assert.equal(shareText({ date: WHEN, lines: ['棒式 1 次，最久 0:25'] }), 'AI 智慧運動分析系統｜11/14 17:05\n棒式 1 次，最久 0:25');
    assert.equal(shareText({ lines: ['  ', null, 42, { a: 1 }, '深蹲 3 下'], ai: [''], advice: [' ', undefined] }), 'AI 智慧運動分析系統\n深蹲 3 下');
    assert.equal(shareText(), 'AI 智慧運動分析系統');
    assert.equal(shareText({ list: 7, url: 9 }), 'AI 智慧運動分析系統');
});

test('太長：從後面的行開始拿掉，網址一定留著；只有一行很長時切短', () => {
    const lines = Array.from({ length: 60 }, (_, i) => '第 ' + (i + 1) + ' 行：' + '字'.repeat(30));
    const url = 'https://example.com/';
    const text = shareText({ date: WHEN, lines, advice: ['很長的建議'.repeat(50)], url });
    assert.ok(text.length <= SHARE_MAX, '長度 ' + text.length);
    const out = text.split('\n');
    assert.equal(out[0], 'AI 智慧運動分析系統｜11/14 17:05');
    assert.equal(out[1], lines[0], '前面的行留著');
    assert.equal(out[out.length - 1], url);
    assert.ok(!text.includes('教練建議'), '最後面的先拿掉');
    const one = shareText({ list: '很'.repeat(5000), url });
    assert.ok(one.length <= SHARE_MAX);
    assert.ok(one.endsWith('\n' + url));
});
