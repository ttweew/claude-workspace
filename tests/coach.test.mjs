// 教練建議（js/analysis/coach.js）、AI 教練（js/cloud/ai-coach.js），10/31
import test from 'node:test';
import assert from 'node:assert/strict';
import { coachFacts, fixedAdvice, COACH } from '../js/analysis/coach.js';
import { coachPrompt, checkReply, replyProblem, cleanReply, failureOf, FAILURE_TEXT, AiCoach, AI_COACH } from '../js/cloud/ai-coach.js';
import { summarize } from '../js/analysis/session.js';
import { repSeries } from '../js/analysis/rep-series.js';

// 一組深蹲：每一下 [最低角度, 秒數, 錯誤, 卡住幾次]
function squat(list, workout = 'squat') {
    const items = list.map(([min, sec, errors = [], stalls = 0], i) => ({
        n: i + 1, min, depth: min <= 90 ? 'good' : min <= 110 ? 'close' : 'shallow', start: i * 4, end: i * 4 + sec, errors, stalls, similarity: 95, sway: 2.3
    }));
    const s = summarize(workout, items, 0, 60000);
    return coachFacts(s, repSeries(workout, items));
}
const good6 = () => squat(Array.from({ length: 6 }, () => [85, 2]));

test('給教練看的數字：只有數字和動作名稱，沒有日期、時間、說出原因的數字；不認得的錯誤不算', () => {
    const f = squat([[85, 2, ['lean']], [85, 2, ['lean', 'constructor']], [85, 2], [85, 2], [85, 2]]);
    assert.deepEqual(Object.keys(f).sort(), ['average', 'clean', 'close', 'count', 'errors', 'fatigue', 'good', 'kind', 'lowest', 'name', 'rhythm', 'shallow', 'similarity', 'stability', 'stalls', 'tempo', 'workout'].sort());
    assert.deepEqual(f.errors, [{ id: 'lean', name: '上身前傾', count: 2 }]);
    assert.equal(f.name, '深蹲');
    assert.equal(coachFacts(summarize('free', [{}], 0, 1), null), null);
    assert.equal(coachFacts(null, null), null);
});

test('固定句子：最常出現的錯誤用畫面上的紅字；只出現 1 下（不到三成）不說', () => {
    const f = squat([[85, 2, ['lean']], [85, 2, ['lean']], [85, 2, ['lean']], [85, 2], [85, 2], [85, 2]]);
    assert.equal(fixedAdvice(f)[0], '「上身前傾」出現 3 下：上身太前傾，胸口挺起來。');
    const once = squat([[85, 2, ['lean']], [85, 2], [85, 2], [85, 2], [85, 2], [85, 2]]);
    assert.ok(!fixedAdvice(once).some(l => l.includes('上身前傾')), fixedAdvice(once).join(''));
});

test('固定句子：沒蹲到位、疲勞、節奏忽快忽慢、中途卡住；最多 3 句', () => {
    const shallow = squat([[120, 2], [118, 2], [85, 2], [119, 2], [121, 2], [117, 2]]);
    assert.match(fixedAdvice(shallow)[0], /^到位 1／6 下：蹲到大腿和地面差不多平行/);
    // 後段又慢又淺（疲勞分析：慢 1.5 倍、淺 15°）
    const tired = squat([[85, 2], [85, 2], [86, 2], [86, 2], [103, 3.2], [104, 3.3]]);
    assert.ok(fixedAdvice(tired).some(l => /^後段變慢 \d+%、變淺 \d+°，可能累了/.test(l)), fixedAdvice(tired).join('｜'));
    const uneven = squat([[85, 1.4], [85, 2.8], [85, 1.3], [85, 2.9], [85, 1.4], [85, 2.7]]);
    assert.ok(fixedAdvice(uneven).some(l => l.startsWith('節奏忽快忽慢')), fixedAdvice(uneven).join('｜'));
    const stall = squat([[85, 2], [85, 2], [85, 2, [], 1], [85, 2], [85, 2], [85, 2]]);
    assert.ok(fixedAdvice(stall).some(l => l.startsWith('第 3 下中途卡了一下')), fixedAdvice(stall).join('｜'));
    const everything = squat([[120, 1.4, ['lean'], 1], [118, 2.8, ['lean'], 1], [119, 1.3, ['lean']], [119, 2.9], [121, 1.4], [117, 2.7]]);
    assert.equal(fixedAdvice(everything).length, COACH.MAX_LINES);
});

test('固定句子：都做得好時說做得好的地方和下一步；棒式', () => {
    assert.deepEqual(fixedAdvice(good6()), ['做得好：每一下都到位、沒有偵測到錯誤、節奏穩、和示範動作很像（相似 95%）。下次可以多做 2 下，或每一下放慢一點。']);
    const plank = coachFacts(summarize('plank', [{ seconds: 32.6, errors: ['sag'] }, { seconds: 20, errors: ['sag'] }], 0, 1), repSeries('plank', [{ seconds: 32.6, errors: ['sag'] }, { seconds: 20, errors: ['sag'] }]));
    assert.deepEqual(fixedAdvice(plank), ['「塌腰」出現 2 次：腰塌下去了，收緊腹部。', '最久撐了 0:32，下次試試多撐 5 秒。']);
    assert.deepEqual(fixedAdvice(null), []);
});

test('給 Gemini 的話：規則、這組的數字（JSON），沒有日期和帳號', () => {
    const f = squat([[85, 2, ['lean']], [85, 2, ['lean']], [85, 2], [85, 2], [85, 2], [85, 2]]);
    const p = coachPrompt(f);
    assert.match(p, /繁體中文/);
    assert.match(p, /兩到三句/);
    const data = JSON.parse(p.slice(p.indexOf('數字：') + 3));
    assert.deepEqual(data.錯誤, { 上身前傾: 2 });
    assert.equal(data.動作, '深蹲');
    assert.equal(data.到位, 6);
    assert.equal(data.節奏, '穩');
    assert.deepEqual(data['重心前後晃動（小腿長的 %）'], { 平均: 2.3, 前段: 2.3, 後段: 2.3 });
    assert.ok(!/date|uid|2026/.test(p));
});

test('檢查 Gemini 的回答：分成最多 3 句；太長、沒有中文、空的不能用', () => {
    assert.deepEqual(checkReply('蹲得很深，很好。\n上身再挺直一點，胸口往前看！'), ['蹲得很深，很好。', '上身再挺直一點，胸口往前看！']);
    assert.deepEqual(checkReply('第一句很好。第二句也好。第三句不錯。第四句多了。'), ['第一句很好。', '第二句也好。', '第三句不錯。']);
    assert.equal(checkReply('Great job! Keep your back straight.'), null);
    assert.equal(checkReply('好'.repeat(AI_COACH.maxChars + 1)), null);
    assert.equal(checkReply('   '), null);
    assert.equal(checkReply(undefined), null);
});

// 假的模型：reply 是回答的字，或丟出的錯誤，或 'hang'（一直不回答）
const fakeModel = reply => async () => ({
    generateContent: () => (reply === 'hang' ? new Promise(() => {}) : reply instanceof Error ? Promise.reject(reply) : Promise.resolve({ response: { text: () => reply } }))
});

test('AI 教練：沒打開不送；網站沒接上 Firebase 打不開；打開時用 Gemini 的回答', async () => {
    const off = new AiCoach({ apiKey: 'x' }, { load: fakeModel('很好。') });
    await assert.rejects(off.advise(good6()), e => e.code === 'off');
    const none = new AiCoach(null, { load: fakeModel('很好。') });
    none.setEnabled(true);
    assert.equal(none.enabled, false);
    const on = new AiCoach({ apiKey: 'x' }, { load: fakeModel('每一下都到位，很穩。下次放慢一點！') });
    on.setEnabled(true);
    assert.deepEqual(await on.advise(good6()), ['每一下都到位，很穩。', '下次放慢一點！']);
});

test('AI 教練失敗：主控台還沒開 AI Logic、逾時、回答不能用、其他錯誤 → 原因（都改用固定句子）', async () => {
    const make = (reply, opts = {}) => {
        const c = new AiCoach({ apiKey: 'x' }, { load: fakeModel(reply), ...opts });
        c.setEnabled(true);
        return c;
    };
    const reason = async c => c.advise(good6()).then(() => 'ok', failureOf);
    assert.equal(await reason(make(Object.assign(new Error('API not enabled'), { code: 'api-not-enabled' }))), 'disabled');
    assert.equal(await reason(make('hang', { timeoutMs: 30 })), 'timeout');
    assert.equal(await reason(make('Great job!')), 'bad-reply');
    assert.equal(await reason(make(Object.assign(new Error('500'), { code: 'fetch-error' }))), 'error');
    for (const k of ['disabled', 'timeout', 'bad-reply', 'error']) assert.match(FAILURE_TEXT[k], /固定的建議$/);
});

test('AI 教練：載入失敗下次再試（不會一直用壞掉的那次）', async () => {
    let calls = 0;
    const c = new AiCoach({ apiKey: 'x' }, { load: async () => { calls++; if (calls === 1) throw new Error('下載失敗'); return (await fakeModel('每一下都很穩。')()); } });
    c.setEnabled(true);
    await assert.rejects(c.advise(good6()));
    assert.deepEqual(await c.advise(good6()), ['每一下都很穩。']);
    assert.equal(calls, 2);
});

// ---------- 10/31 保養：AI 教練的失敗情況 ----------

test('回答怪怪的：英文、網址、簡體字、太短、太長、數字對不起來（模型自己編的）都不能用', () => {
    const f = good6();   // 6 下、到位 6、相似 95、每下 2 秒
    assert.equal(replyProblem('Great job! Keep your back straight and go slower.', f), 'english');
    assert.equal(replyProblem('做得很好，教學影片看 https://example.com 這裡。', f), 'link');
    assert.equal(replyProblem('这个动作做得很好，下次放慢一点。', f), 'simplified');
    assert.equal(replyProblem('好。', f), 'empty');
    assert.equal(replyProblem('很'.repeat(AI_COACH.maxChars + 1), f), 'long');
    assert.equal(replyProblem('你做了 12 下，比上次多。下次再加油。', f), 'number');
    // 這組裡有的數字、5 以下的小數字（「數 1、2」「多做 2 下」）可以
    assert.equal(replyProblem('6 下都到位，和示範動作相似 95%。下次數 1、2 慢慢下去。', f), null);
    assert.equal(replyProblem('每下約 2 秒，節奏很穩。下次多做 2 下。', f), null);
    // 四捨五入（重心晃動 3.6% 說成約 4%、每下 2.6 秒說成約 3 秒）、第幾下（不超過次數）、規則裡的數字也可以；不在裡面的不行
    const eight = squat([[85, 2.1], [87, 2.3], [84, 2.2], [92, 2.6], [95, 2.9], [99, 3.3], [101, 3.1], [97, 2.4]]);
    assert.equal(replyProblem('平均每下約 3 秒，相似 95 分。第 7 下開始變淺，最後 8 下都沒有錯誤。', eight), null);
    // 到位的門檻 90° 沒有給它（規則寫「數字只能用下面有的」），說了也不行；開通後看 Gemini 真的回答，常常被擋再加進給它的數字
    assert.equal(replyProblem('最低蹲到 84 度，很好。下次每一下都蹲到 90 度。', eight), 'number');
    assert.equal(replyProblem('第 9 下開始變淺，下次放慢一點。', eight), 'number');
    // 不給這組的數字（例如只檢查格式）時不比數字
    assert.equal(replyProblem('你做了 12 下，做得很好。'), null);
});

test('回答整理：列點的符號、粗體、標題、表情符號拿掉；重複的句子只留一句', () => {
    assert.equal(cleanReply('## 建議\n- **每一下都到位**，很好 💪\n1. 下次放慢一點'), '建議\n每一下都到位，很好\n下次放慢一點');
    assert.deepEqual(checkReply('- 每一下都到位，很好。\n- 每一下都到位，很好。\n- 下次放慢一點。', good6()), ['每一下都到位，很好。', '下次放慢一點。']);
    // 列點沒有句號：補上（接在一起唸時才會停一下）
    assert.deepEqual(checkReply('- **每一下都到位**，很穩 💪\n- 下次放慢一點', good6()), ['每一下都到位，很穩。', '下次放慢一點。']);
});

test('沒有網路：不送、不等，直接用固定句子', async () => {
    let calls = 0;
    const c = new AiCoach({ apiKey: 'x' }, { load: async () => { calls++; return fakeModel('每一下都很穩。')(); } });
    c.setEnabled(true);
    const had = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
    Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { onLine: false } });
    try {
        await assert.rejects(c.advise(good6()), e => failureOf(e) === 'offline');
        assert.equal(calls, 0, '沒有載入、沒有送');
    } finally {
        if (had) Object.defineProperty(globalThis, 'navigator', had); else delete globalThis.navigator;
    }
});

test('載入 Firebase 的程式卡住：逾時，下次重新載入（不會一直等同一個卡住的）', async () => {
    let calls = 0;
    const c = new AiCoach({ apiKey: 'x' }, { timeoutMs: 30, load: () => { calls++; return calls === 1 ? new Promise(() => {}) : fakeModel('每一下都很穩，很好。')(); } });
    c.setEnabled(true);
    await assert.rejects(c.advise(good6()), e => failureOf(e) === 'timeout');
    assert.deepEqual(await c.advise(good6()), ['每一下都很穩，很好。']);
    assert.equal(calls, 2);
});

test('Google 回的錯誤：429 用量用完、404 模型停用、回答被擋下（response-error）、網路斷掉', () => {
    const err = (code, status) => Object.assign(new Error(code), { code, customErrorData: status ? { status } : undefined });
    assert.equal(failureOf(err('fetch-error', 429)), 'busy');
    assert.equal(failureOf(err('fetch-error', 404)), 'model');
    assert.equal(failureOf(err('response-error')), 'bad-reply');
    assert.equal(failureOf(err('api-not-enabled', 403)), 'disabled');
    assert.equal(failureOf(new TypeError('Failed to fetch')), 'error');
    for (const k of ['offline', 'busy', 'model']) assert.match(FAILURE_TEXT[k], /固定的建議$/);
});
