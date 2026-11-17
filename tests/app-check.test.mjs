// App Check（11/17）：AI 教練問 Gemini 前先拿「從我們的網站送的」通行證（Google 從 2026/11/2 起規定一定要有）
// 瀏覽器裡真的載入、設定、開鏡頭先準備：tests/browser/coach.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { APP_CHECK_SITE_KEY } from '../js/cloud/config.js';
import { AiCoach, failureOf, FAILURE_TEXT } from '../js/cloud/ai-coach.js';
import { coachFacts } from '../js/analysis/coach.js';
import { summarize } from '../js/analysis/session.js';
import { repSeries } from '../js/analysis/rep-series.js';

test('網站金鑰：reCAPTCHA 的格式（6L 開頭、40 個字），不是 Firebase 的 API 金鑰', () => {
    assert.match(APP_CHECK_SITE_KEY, /^6L[A-Za-z0-9_-]{38}$/);
    assert.doesNotMatch(APP_CHECK_SITE_KEY, /^AIza/);
});

test('沒有通過 App Check（401、403、訊息寫 App Check）→ 寫出原因；其他的照舊', () => {
    assert.equal(failureOf({ code: 'fetch-error', customErrorData: { status: 403 } }), 'appcheck');
    assert.equal(failureOf({ code: 'fetch-error', customErrorData: { status: 401 } }), 'appcheck');
    assert.equal(failureOf({ code: 'fetch-error', message: 'Firebase App Check token is invalid.' }), 'appcheck');
    assert.equal(failureOf({ code: 'api-not-enabled', customErrorData: { status: 403 } }), 'disabled', 'AI Logic 還沒開：照舊寫「還沒開通」');
    assert.equal(failureOf({ code: 'fetch-error', customErrorData: { status: 429 } }), 'busy');
    assert.equal(failureOf({ code: 'fetch-error', customErrorData: { status: 500 } }), 'error');
    assert.match(FAILURE_TEXT.appcheck, /App Check/);
});

test('開鏡頭先準備（warm）：打開、有網路、還沒載入過才載入一次；只載入、不問 Gemini', async () => {
    const calls = [];
    const fakeModel = { generateContent: async () => { calls.push('ask'); return { response: { text: () => '' } }; } };
    const coach = new AiCoach({ projectId: 'x' }, { load: async () => { calls.push('load'); return fakeModel; } });
    coach.enabled = false;
    coach.warm();
    assert.deepEqual(calls, [], '關著：不載入');
    coach.enabled = true;
    coach.warm();
    coach.warm();
    await coach.model;
    assert.deepEqual(calls, ['load'], '打開：只載入一次、不問 Gemini');
});

test('準備時載入失敗：之後問的時候重新載入，不會一直用失敗的那一次', async () => {
    let n = 0;
    const coach = new AiCoach({ projectId: 'x' }, { load: async () => { n++; if (n === 1) throw new Error('載不到'); return { generateContent: async () => ({ response: { text: () => '每一下都到位。' } }) }; } });
    coach.enabled = true;
    coach.warm();
    await new Promise(resolve => setTimeout(resolve, 10));
    assert.equal(coach.model, null, '失敗了清掉');
    await coach.advise({ workout: 'squat', count: 6 }).catch(() => {});
    assert.equal(n, 2, '問的時候重新載入');
});

test('問 Gemini 前先確認通行證：拿到了才問；一直拿不到（reCAPTCHA 被擋）等到上限就放棄、不問；被拒絕馬上放棄', async () => {
    const asked = [];
    const model = token => ({
        appCheckToken: token,
        generateContent: async () => { asked.push(1); return { response: { text: () => '每一下都到位，很穩。' } }; }
    });
    // 一組真的總結（深蹲 6 下，每下 85°、2.4 秒）
    const items = Array.from({ length: 6 }, (_, i) => ({ min: 85, depth: 'good', errors: [], start: i * 3, end: i * 3 + 2.4, similarity: 90 }));
    const facts = coachFacts(summarize('squat', items, 0, 60000), repSeries('squat', items));
    // 拿到了：照常問
    const ok = new AiCoach({ projectId: 'x' }, { load: async () => model(async () => ({ token: 't' })), appCheckMs: 200 });
    ok.enabled = true;
    assert.deepEqual(await ok.advise(facts), ['每一下都到位，很穩。']);
    assert.equal(asked.length, 1);
    // 一直等：200 毫秒（測試用的上限）後放棄，原因是 appcheck，不是 timeout
    const hang = new AiCoach({ projectId: 'x' }, { load: async () => model(() => new Promise(() => {})), appCheckMs: 200 });
    hang.enabled = true;
    const t0 = Date.now();
    const e1 = await hang.advise(facts).catch(err => err);
    assert.equal(failureOf(e1), 'appcheck');
    assert.ok(Date.now() - t0 < 2000, '不用等滿 10 秒');
    // 被拒絕：馬上放棄
    const no = new AiCoach({ projectId: 'x' }, { load: async () => model(async () => { throw new Error('403'); }), appCheckMs: 5000 });
    no.enabled = true;
    const t1 = Date.now();
    const e2 = await no.advise(facts).catch(err => err);
    assert.equal(failureOf(e2), 'appcheck');
    assert.ok(Date.now() - t1 < 1000);
    assert.equal(asked.length, 1, '沒有通行證的兩次都沒有問');
});
