// AI 全自動換動作時講了什麼、什麼時候被打斷（假的講話：每個字 180 毫秒才講完，記下開始、講完、被取消）
// 用法：node speech_probe.mjs <網站資料夾> [coach]（coach：打開 AI 教練，Gemini 3 秒後才回答）
const W = process.argv[2];
const COACH = process.argv[3] === 'coach';
process.env.SITE_ROOT = W;
const H = await import(W + '/tests/browser/harness.mjs');
const stand = (id, frames) => ({ id, depth: 0, frames });
const MIXED = H.script([stand('squat', 120), ...[1, 2, 3, 4].flatMap(() => H.rep('squat', { hold: 10, rest: 20 })), stand('squat', 60),
    ...[1, 2, 3, 4, 5, 6].flatMap(() => H.rep('pushup', { hold: 10, rest: 20 })), stand('pushup', 30)]);
const site = await H.serve(), browser = await H.launch();
const { context, page } = await H.open(browser, MIXED);
await context.addInitScript(coach => {
    try { localStorage.setItem('aiAuto', '1'); if (coach) localStorage.setItem('aiCoach', '1'); } catch (e) {}
    window.__fakeAI = { reply: '深蹲每一下都蹲到位，節奏很穩，下次可以試著多做兩下。' };
    const log = window.__log = [], t0 = performance.now();
    const q = [];
    let cur = null, timer = null;
    const next = () => {
        if (cur || !q.length) return;
        cur = q.shift();
        log.push([Math.round(performance.now() - t0), '講', cur.text]);
        const u = cur;
        timer = setTimeout(() => { log.push([Math.round(performance.now() - t0), '講完', u.text.slice(0, 12)]); cur = null; synth.speaking = false; if (u.onend) u.onend({}); next(); }, 180 * u.text.length);
        synth.speaking = true;
    };
    const synth = { speaking: false, pending: false, getVoices: () => [{ lang: 'zh-TW', name: 'fake-zh' }], addEventListener() {},
        speak(u) { q.push(u); next(); },
        cancel() { if (cur || q.length) log.push([Math.round(performance.now() - t0), '取消', cur ? cur.text.slice(0, 12) : '（排隊的）']); clearTimeout(timer); const was = cur; cur = null; q.length = 0; synth.speaking = false; if (was && was.onend) was.onend({}); } };
    Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: synth });
    try { localStorage.setItem('voiceMode', 'full'); } catch (e) {}
}, COACH);
if (COACH) {
    // Gemini 3 秒後才回答（假的）
    await context.route('https://www.gstatic.com/firebasejs/**/firebase-ai.js', route => route.fulfill({ contentType: 'text/javascript', headers: { 'Access-Control-Allow-Origin': '*' }, body: `export class GoogleAIBackend {}
export const getAI = (app, options) => ({ app, options });
export function getGenerativeModel(ai, params) { return { async generateContent(prompt) { (window.__aiPrompts = window.__aiPrompts || []).push(1); await new Promise(r => setTimeout(r, 3000)); return { response: { text: () => window.__fakeAI.reply } }; } }; }` }));
}
await page.goto(site.base + 'index.html?workout=free');
await page.waitForFunction(() => /已就緒|失敗/.test(document.getElementById('poseStatus').textContent), null, { timeout: 60000 });
await page.click('#startBtn');
await page.waitForFunction(() => document.getElementById('hudRepsName').textContent === '伏地挺身', null, { timeout: 90000 });
await page.waitForFunction(() => document.getElementById('hudReps').textContent === '6', null, { timeout: 90000 });
await page.waitForTimeout(6000);
await page.click('#stopBtn');
await page.waitForTimeout(COACH ? 8000 : 4000);
const log = await page.evaluate(() => window.__log);
console.log(COACH ? 'AI 教練打開（Gemini 3 秒）' : 'AI 教練關著（固定建議）', '｜ Gemini 被問了', await page.evaluate(() => (window.__aiPrompts || []).length), '次');
for (const [t, what, text] of log) console.log(String(t).padStart(6), what, text);
await context.close(); await browser.close(); await site.close();
