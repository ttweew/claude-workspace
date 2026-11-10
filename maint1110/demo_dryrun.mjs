// 11/10 保養（彩排準備）：照進度地圖「現場示範」的腳本，在手機寬度（390×844）跑一遍目前的網站（合成的火柴人，不是真人）
//   第一段：首頁打開 AI 全自動（手勢控制錄影預設開著）、自由模式開鏡頭 → 走到位置 → 站著 → 深蹲 5 下（第 4 下上身前傾）→ 走回手機按「結束」
//     記下：卡片每次變的字、講了什麼（和第一下開始差幾秒）、每一下提示的第二行、總結（AI 判斷、AI 評分、AI 解釋、兩個火柴人、教練建議）
//   第二段（時間夠的話）：深蹲 4 下 → 趴下做伏地挺身 4 下：換動作時講的話、總結最上面那一句
// 用法：node demo_dryrun.mjs
const W = '/home/user/claude-workspace';
const H = await import(W + '/tests/browser/harness.mjs');
const D = await import('./demo_frames.mjs');
const site = await H.serve(), browser = await H.launch();
const pause = ms => new Promise(r => setTimeout(r, ms));
const MOBILE = { width: 390, height: 844, mobile: true };

// 講話記下時間（epoch 毫秒）；harness 的假講話先記在 window.__said，這裡再包一層
const TIMED = `(() => {
  const synth = window.speechSynthesis, speak = synth.speak.bind(synth);
  window.__saidT = [];
  synth.speak = u => { window.__saidT.push([performance.timeOrigin + performance.now(), u.text]); speak(u); };
  try { localStorage.setItem('aiAuto', '1'); } catch (e) {}
})();`;

async function startPage(frames) {
    const { context, page } = await H.open(browser, frames, MOBILE);
    await context.addInitScript(TIMED);
    await page.goto(site.base + 'index.html?workout=free');
    await page.waitForFunction(() => /已就緒|失敗/.test(document.getElementById('poseStatus').textContent), null, { timeout: 60000 });
    await page.locator('#startBtn').tap();
    await page.waitForFunction(() => !document.getElementById('stage').hidden, null, { timeout: 10000 });
    return { context, page };
}
// 每 0.2 秒看一次卡片、次數（只記變了的時候）；直到假 AI 播完所有格子
async function watch(page, total) {
    const states = [];
    let last = '';
    for (;;) {
        const s = await page.evaluate(() => {
            const t = id => { const el = document.getElementById(id); return el ? el.textContent : ''; };
            const box = document.getElementById('activity');
            return { at: performance.timeOrigin + performance.now(), card: box && !box.hidden ? t('activityTitle') + '｜' + t('activityText') : '（沒有卡片）',
                reps: t('hudRepsName') + ' ' + t('hudReps'), scrollW: document.documentElement.scrollWidth };
        });
        const key = s.card + '｜' + s.reps;
        if (key !== last) { states.push(s); last = key; }
        const used = await H.usedFrames(page);
        if (used.length && used[used.length - 1][0] >= total + 15) break;
        await pause(200);
    }
    return states;
}
// 第 0 格的時間（epoch）：假 AI 在主畫面或背景執行緒，用那邊的 timeOrigin 換算
//   背景執行緒（pose-worker.js）拿到的時間是主畫面傳過去的 performance.now()，所以都用主畫面的 timeOrigin
async function frameZero(page) {
    const used = await H.usedFrames(page);
    const origin = await page.evaluate(() => performance.timeOrigin);
    return used.length ? origin + used[0][1] - used[0][0] * 1000 / 30 : null;
}
async function stopAndRead(page) {
    await page.locator('#stopBtn').tap();
    await page.waitForFunction(() => !document.getElementById('summary').hidden, null, { timeout: 10000 });
    await page.waitForFunction(() => !document.getElementById('coachStatus').textContent.includes('想一下'), null, { timeout: 15000 });
    return page.evaluate(() => {
        const text = id => { const el = document.getElementById(id); return el && !el.hidden ? el.textContent : '（沒有）'; };
        const compare = document.getElementById('poseCompareBox');
        return {
            lines: [...document.querySelectorAll('#summaryLines li')].map(li => li.textContent),
            ai: text('aiSummaryBox'), score: text('scoreSummaryBox'), explain: text('explainSummaryBox'),
            fatigue: text('fatigueBox'), fluency: text('fluencyBox'),
            compare: compare && !compare.hidden ? compare.querySelectorAll('canvas, svg').length + ' 張圖：' + compare.textContent.replace(/\s+/g, ' ').slice(0, 120) : '（沒有）',
            coach: [...document.querySelectorAll('#coachLines li')].map(li => li.textContent).join(' ') + ' ' + text('coachSource'),
            scrollW: document.documentElement.scrollWidth
        };
    });
}

// ---- 第一段（幾種故意前傾的排法）----
const PATTERNS = (process.env.PATTERNS || '00010').split(',');
for (const pat of PATTERNS) {
const demo = D.demoScript([...pat].map(Number));
console.log('###### 前傾的排法：' + pat);
const { context: c1, page: p1 } = await startPage(demo.list.map(D.encode));
const states = await watch(p1, demo.list.length);
const zero = await frameZero(p1);
const sec = at => ((at - zero) / 1000).toFixed(1) + ' 秒';
console.log('== 第一段：走到位置 → 站 → 深蹲 5 下（第 4 下前傾）→ 走回手機；第一下在第 ' + (demo.squatStart / 30).toFixed(1) + ' 秒開始');
for (const s of states) console.log('  ' + sec(s.at) + '  ' + s.card + '  ［' + s.reps.trim() + '］' + (s.scrollW > 390 ? '  ！整頁超出 ' + s.scrollW : ''));
const said1 = await p1.evaluate(() => window.__saidT);
for (const [at, text] of said1) console.log('  講（' + sec(at) + '，第一下開始後 ' + ((at - zero) / 1000 - demo.squatStart / 30).toFixed(1) + ' 秒）：' + text);
const toasts1 = await p1.evaluate(() => window.__toasts);
console.log('  每一下提示的第二行：' + toasts1.map(t => t.ai).join('｜'));
await pause(1000);
const sum1 = await stopAndRead(p1);
console.log('  總結：' + JSON.stringify(sum1, null, 1));
console.log('  程式錯誤：' + JSON.stringify(p1.errors));
await c1.close();
}
if (process.env.ONLY1) { await browser.close(); await site.close(); process.exit(0); }

// ---- 第二段：深蹲 4 下 → 伏地挺身 4 下 ----
const part2 = H.script([{ id: 'squat', depth: 0, frames: 120 }, ...[0, 0, 0, 0].flatMap(() => H.rep('squat', { hold: 10, rest: 30 })), { id: 'squat', depth: 0, frames: 60 },
    ...[0, 0, 0, 0].flatMap(() => H.rep('pushup', { hold: 10, rest: 30 })), { id: 'pushup', depth: 0, frames: 120 }]);
const { context: c2, page: p2 } = await startPage(part2);
const states2 = await watch(p2, part2.length);
const zero2 = await frameZero(p2);
console.log('== 第二段：深蹲 4 下 → 伏地挺身 4 下');
for (const s of states2) console.log('  ' + ((s.at - zero2) / 1000).toFixed(1) + ' 秒  ' + s.card + '  ［' + s.reps.trim() + '］' + (s.scrollW > 390 ? '  ！整頁超出 ' + s.scrollW : ''));
for (const [at, text] of await p2.evaluate(() => window.__saidT)) console.log('  講（' + ((at - zero2) / 1000).toFixed(1) + ' 秒）：' + text);
await pause(1000);
const sum2 = await stopAndRead(p2);
console.log('  總結最上面：' + sum2.lines.slice(0, 2).join('｜'));
console.log('  教練建議：' + sum2.coach);
console.log('  程式錯誤：' + JSON.stringify(p2.errors));
await c2.close();
await browser.close(); await site.close();
