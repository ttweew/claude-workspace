// 總體檢（11/10）：AI 教練用「真的 Firebase AI 程式」跑一次（平常的測試用假的 firebase-ai.js）
//   Firebase 的程式從 npm 套件給（這個環境連不到 gstatic）；Google 的伺服器換成假的：記下網站送了什麼，回固定的答案或各種錯誤
//   看：送出去的網址（模型名稱）、設定（generationConfig）、只送數字；回答讀不讀得到；每種錯誤網站說的原因對不對
// 用法：node ai_sdk_check.mjs <firebase 套件資料夾> [網站資料夾]
import { readFileSync, existsSync } from 'node:fs';
const W = process.argv[3] || '/home/user/claude-workspace';
process.env.SITE_ROOT = W;
const H = await import('/home/user/claude-workspace/tests/browser/harness.mjs');
const FB = process.argv[2];
const ver = JSON.parse(readFileSync(FB + '/package.json', 'utf8')).version;
const site = await H.serve(W), browser = await H.launch();
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': '*' };
const OK_TEXT = '每一下都蹲到位，節奏很穩。下次可以試著放慢一點。';
const REPLIES = {
    ok: { status: 200, body: { candidates: [{ content: { role: 'model', parts: [{ text: OK_TEXT }] }, finishReason: 'STOP', index: 0 }], usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 20, totalTokenCount: 120 } } },
    notfound: { status: 404, body: { error: { code: 404, message: 'models/x is not found for API version v1beta, or is not supported for generateContent.', status: 'NOT_FOUND' } } },
    busy: { status: 429, body: { error: { code: 429, message: 'Resource has been exhausted (e.g. check quota).', status: 'RESOURCE_EXHAUSTED' } } },
    disabled: { status: 403, body: { error: { code: 403, message: 'Firebase AI Logic API has not been used in project 1 before or it is disabled.', status: 'PERMISSION_DENIED',
        details: [{ '@type': 'type.googleapis.com/google.rpc.ErrorInfo', reason: 'SERVICE_DISABLED', domain: 'googleapis.com', metadata: { service: 'firebasevertexai.googleapis.com' } },
            { '@type': 'type.googleapis.com/google.rpc.Help', links: [{ description: 'Google developers console API activation', url: 'https://console.developers.google.com/apis/api/firebasevertexai.googleapis.com/overview' }] }] } } },
    badarg: { status: 400, body: { error: { code: 400, message: 'Invalid JSON payload received. Unknown name "temperature" at \'generation_config\': Cannot find field.', status: 'INVALID_ARGUMENT' } } },
    blocked: { status: 200, body: { promptFeedback: { blockReason: 'SAFETY', safetyRatings: [{ category: 'HARM_CATEGORY_DANGEROUS_CONTENT', probability: 'HIGH', blocked: true }] }, usageMetadata: { promptTokenCount: 100, totalTokenCount: 100 } } },
    blocked2: { status: 200, body: { promptFeedback: { blockReason: 'OTHER' }, usageMetadata: { promptTokenCount: 100, totalTokenCount: 100 } } },
    empty: { status: 200, body: { candidates: [{ content: { role: 'model', parts: [{ text: '' }] }, finishReason: 'MAX_TOKENS', index: 0 }] } },
    english: { status: 200, body: { candidates: [{ content: { role: 'model', parts: [{ text: 'Great job! Keep your chest up and go slower next time.' }] }, finishReason: 'STOP', index: 0 }] } }
};
// blocked2：Google 擋下但沒有附 safetyRatings（12.19.0 的 Firebase 程式自己會出錯）：只要改用固定句子就好，原因寫哪一種都可以
const EXPECT = { ok: null, notfound: 'model', busy: 'busy', disabled: 'disabled', badarg: 'error', blocked: 'bad-reply', blocked2: ['bad-reply', 'error'], empty: 'bad-reply', english: 'bad-reply' };
let pass = true;
const check = (ok, msg) => { console.log((ok ? 'PASS ' : 'FAIL ') + msg); pass = pass && ok; };
console.log('Firebase 程式版本 ' + ver);
for (const [mode, reply] of Object.entries(REPLIES)) {
    const context = await browser.newContext();
    const sent = [], other = [];
    await context.route('https://www.gstatic.com/firebasejs/**', route => {
        const file = new URL(route.request().url()).pathname.split('/').pop();
        return existsSync(FB + '/' + file) ? route.fulfill({ body: readFileSync(FB + '/' + file), contentType: 'text/javascript', headers: CORS }) : route.fulfill({ status: 404, headers: CORS });
    });
    await context.route(/^https:\/\/[^/]*googleapis\.com\//, route => {
        const req = route.request();
        if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
        sent.push({ url: req.url(), body: req.postData(), headers: req.headers() });
        return route.fulfill({ status: reply.status, contentType: 'application/json', headers: CORS, body: JSON.stringify(reply.body) });
    });
    const page = await context.newPage();
    page.on('request', r => { const u = r.url(); if (!u.startsWith(site.base) && !/gstatic\.com\/firebasejs|googleapis\.com/.test(u)) other.push(u); });
    await page.goto(site.base + 'results.html');
    const out = await page.evaluate(async () => {
        const { AiCoach, failureOf, FAILURE_TEXT } = await import(new URL('js/cloud/ai-coach.js', location.href).href);
        const facts = { workout: 'squat', name: '深蹲', kind: 'reps', count: 6, clean: 6, good: 6, close: 0, shallow: 0, lowest: 85, average: 86, tempo: 2.3, similarity: 96, errors: [], fatigue: null, rhythm: 'steady', stalls: null, stability: null };
        const c = new AiCoach(); c.setEnabled(true);
        try { return { lines: await c.advise(facts) }; }
        catch (e) { const why = failureOf(e); return { error: String(e.message || e).slice(0, 160), code: e.code, status: e.customErrorData && e.customErrorData.status, why, text: FAILURE_TEXT[why] }; }
    });
    if (mode === 'ok') {
        check(sent.length === 1, '送了 1 次：' + (sent[0] ? sent[0].url.replace(/key=[^&]+/, 'key=…') : '（沒有送）'));
        const body = sent[0] ? JSON.parse(sent[0].body) : {};
        console.log('   送出去的設定 generationConfig：' + JSON.stringify(body.generationConfig) + '；欄位：' + Object.keys(body).join('、'));
        check(sent[0] && /models\/gemini-3\.5-flash-lite:generateContent/.test(sent[0].url), '網址裡的模型名稱是 gemini-3.5-flash-lite');
        const text = body.contents && body.contents[0] && body.contents[0].parts && body.contents[0].parts[0].text || '';
        check(/數字：\{/.test(text) && !/landmarks|"x":|userAgent/.test(sent[0].body), '只送規則和這組的數字（沒有座標、裝置資訊）');
        check(JSON.stringify(out.lines) === JSON.stringify(['每一下都蹲到位，節奏很穩。', '下次可以試著放慢一點。']), '回答讀得到、切成句子：' + JSON.stringify(out.lines || out));
        check(other.length === 0, '沒有連到別的網站 ' + JSON.stringify(other.slice(0, 3)));
    } else {
        check([].concat(EXPECT[mode]).includes(out.why), mode + '（HTTP ' + reply.status + '）→ 網站說「' + out.text + '」（' + out.why + '，code=' + out.code + '）' + ([].concat(EXPECT[mode]).includes(out.why) ? '' : ' 錯誤訊息：' + out.error + ' lines=' + JSON.stringify(out.lines)));
    }
    await context.close();
}
await browser.close(); await site.close();
console.log(pass ? 'ALL PASS' : 'SOME FAIL');
