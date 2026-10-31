// 教練建議、AI 教練（10/31，瀏覽器端到端）：假的 AI 做 6 下深蹲，關鏡頭看總結最上面的「教練建議」
//   AI 教練關著（預設）：固定句子、唸出來、什麼都不送
//   打開：用 Gemini 的回答（假的 Firebase，見 harness.mjs），送出去的只有這組的數字
//   Firebase 主控台還沒開 AI Logic：固定句子＋寫出原因；首頁的開關；320 寬、axe-core
//   失敗的情況（10/31 保養）：沒有網路、超過 10 秒、回答怪怪的（英文、編出來的數字）、太忙（429）都改用固定句子；列點、粗體、表情符號整理掉
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { launch, serve, open, script, rep, workout } from './harness.mjs';
import { FAILURE_TEXT } from '../../js/cloud/ai-coach.js';
import { AI_MODEL } from '../../js/cloud/config.js';

const require = createRequire(import.meta.url);
const SQUAT = script([{ id: 'squat', depth: 0, frames: 60 }, ...[1, 2, 3, 4, 5, 6].flatMap(() => rep('squat', { rest: 30 }))]);
const SIX = () => document.getElementById('hudReps').textContent === '6';

let browser, site;
test.before(async () => {
    site = await serve();
    browser = await launch();
});
test.after(async () => {
    await browser.close();
    await site.close();
});

// 打開網頁前先設好：AI 教練開著沒（這台裝置記住的），假的 Gemini 怎麼回答
//   beforeStop(context)：按「結束」前要做的事（例如斷網）
async function session({ coachOn = false, fakeAI = null, size = {}, beforeStop = null } = {}) {
    const { context, page } = await open(browser, SQUAT, size);
    await context.addInitScript(([on, how]) => {
        try { if (on) localStorage.setItem('aiCoach', '1'); } catch (e) {}
        window.__fakeAI = how;
    }, [coachOn, fakeAI]);
    await workout(page, site.base, 'squat', SIX, { beforeStop: beforeStop && (() => beforeStop(context)) });
    // AI 教練的回答是非同步的：等到不是「想一下」
    await page.waitForFunction(() => !document.getElementById('coachStatus').textContent.includes('想一下'), null, { timeout: 15000 });
    const read = await page.evaluate(() => ({
        hidden: document.getElementById('coachAdvice').hidden,
        source: document.getElementById('coachSource').textContent,
        lines: [...document.querySelectorAll('#coachLines li')].map(li => li.textContent),
        status: document.getElementById('coachStatus').textContent,
        said: window.__said.filter(t => t.startsWith('教練建議：')),
        prompts: window.__aiPrompts || []
    }));
    return { context, page, read };
}

test('AI 教練關著（預設）：總結最上面是固定建議、唸出來，什麼都沒送', async () => {
    const { context, page, read } = await session();
    assert.equal(read.hidden, false);
    assert.equal(read.source, '（固定建議）');
    assert.deepEqual(read.lines, ['做得好：每一下都到位、沒有偵測到錯誤、節奏穩、和示範動作很像（相似 ' + read.lines[0].match(/相似 (\d+)%/)[1] + '%）。下次可以多做 2 下，或每一下放慢一點。']);
    assert.deepEqual(read.said, ['教練建議：' + read.lines.join('')]);
    assert.deepEqual(read.prompts, []);
    assert.equal(read.status, '');
    assert.deepEqual(page.errors, []);
    await context.close();
});

test('AI 教練打開：用 Gemini 的回答、唸出來；送出去的只有這組的數字', async () => {
    const reply = '每一下都蹲到位，很穩。下次每一下放慢一點，控制下去的速度。';
    const { context, page, read } = await session({ coachOn: true, fakeAI: { reply } });
    assert.equal(read.source, '（AI 教練，Gemini）');
    assert.deepEqual(read.lines, ['每一下都蹲到位，很穩。', '下次每一下放慢一點，控制下去的速度。']);
    assert.deepEqual(read.said, ['教練建議：' + reply]);
    assert.equal(read.prompts.length, 1);
    assert.equal(read.prompts[0].model, AI_MODEL);
    const p = read.prompts[0].prompt;
    const data = JSON.parse(p.slice(p.indexOf('數字：') + 3));
    assert.equal(data.動作, '深蹲');
    assert.equal(data.次數, 6);
    assert.ok(!/http|date|uid|landmark|\d{4}-\d{2}-\d{2}/.test(p), '沒有網址、日期、帳號、骨架：' + p);
    assert.equal(await page.isChecked('#coachToggle'), true);
    assert.deepEqual(page.errors, []);
    await context.close();
});

test('Firebase 主控台還沒開 AI Logic：改用固定句子，寫出原因', async () => {
    const { context, page, read } = await session({ coachOn: true, fakeAI: { error: { code: 'api-not-enabled', message: 'SERVICE_DISABLED' } } });
    assert.equal(read.source, '（固定建議）');
    assert.match(read.lines[0], /^做得好：/);
    assert.equal(read.status, FAILURE_TEXT.disabled);
    assert.equal(read.said.length, 1);
    assert.deepEqual(page.errors, []);
    await context.close();
});

test('首頁的開關：預設關閉；打開、關閉會記住；320 寬、axe-core（開關、教練建議）', async () => {
    const { context, page } = await open(browser, SQUAT, { width: 320, height: 640, mobile: true });
    await page.goto(site.base + 'index.html');
    assert.equal(await page.isVisible('#coachBox'), true);
    assert.equal(await page.isChecked('#coachToggle'), false);
    await page.click('#coachToggle');
    assert.equal(await page.evaluate(() => localStorage.getItem('aiCoach')), '1');
    assert.match(await page.textContent('#coachNote'), /^打開了/);
    await page.reload();
    assert.equal(await page.isChecked('#coachToggle'), true);
    await page.click('#coachToggle');
    assert.equal(await page.evaluate(() => localStorage.getItem('aiCoach')), '0');
    await context.close();

    const run = await session({ coachOn: true, fakeAI: { reply: '蹲得很穩。下次放慢一點。' }, size: { width: 320, height: 640, mobile: true } });
    const width = await run.page.evaluate(() => [document.documentElement.scrollWidth, Math.round(document.getElementById('coachAdvice').getBoundingClientRect().right)]);
    assert.ok(Math.max(...width) <= 320, '320 寬不超出：' + width);
    const axe = readFileSync(process.env.AXE_CORE || require.resolve('axe-core/axe.min.js'), 'utf8');
    await run.page.addScriptTag({ content: axe });
    // axe-core 一次只能跑一個：一個一個檢查
    const v = await run.page.evaluate(async () => {
        const out = [];
        for (const sel of ['#summary', '#coachBox']) out.push(...(await window.axe.run(document.querySelector(sel))).violations.map(x => x.id + ':' + x.nodes.length));
        return out;
    });
    assert.deepEqual(v, []);
    assert.deepEqual(run.page.errors, []);
    await run.context.close();
});

// ---------- 失敗的情況（10/31 保養）：都改用固定句子，寫出原因，固定句子照樣唸 ----------
const failed = (read, why) => {
    assert.equal(read.source, '（固定建議）');
    assert.match(read.lines[0], /^做得好：/);
    assert.equal(read.status, why);
    assert.deepEqual(read.said, ['教練建議：' + read.lines.join('')]);
};

test('沒有網路：不送、不等，馬上用固定句子', async () => {
    const { context, page, read } = await session({ coachOn: true, fakeAI: { reply: '每一下都蹲到位，很穩。' }, beforeStop: c => c.setOffline(true) });
    failed(read, FAILURE_TEXT.offline);
    assert.deepEqual(read.prompts, []);
    assert.deepEqual(page.errors, []);
    await context.close();
});

test('超過 10 秒沒回答：改用固定句子', async () => {
    const { context, page, read } = await session({ coachOn: true, fakeAI: { hang: true } });
    failed(read, FAILURE_TEXT.timeout);
    assert.equal(read.prompts.length, 1);
    assert.deepEqual(page.errors, []);
    await context.close();
});

test('回答怪怪的：英文、編出來的數字（只做了 6 下卻說 12 下）→ 固定句子', async () => {
    for (const reply of ['Great job! Keep your back straight and go slower next time.', '你做了 12 下，比上次多。下次再加油。']) {
        const { context, page, read } = await session({ coachOn: true, fakeAI: { reply } });
        failed(read, FAILURE_TEXT['bad-reply']);
        assert.deepEqual(page.errors, []);
        await context.close();
    }
});

test('回答整理：列點、粗體、表情符號拿掉，沒有句號的補上；這組真的有的數字（6 下）可以', async () => {
    const { context, page, read } = await session({ coachOn: true, fakeAI: { reply: '- **6 下都蹲到位**，很穩 💪\n- 下次放慢一點' } });
    assert.equal(read.source, '（AI 教練，Gemini）');
    assert.deepEqual(read.lines, ['6 下都蹲到位，很穩。', '下次放慢一點。']);
    assert.deepEqual(read.said, ['教練建議：6 下都蹲到位，很穩。下次放慢一點。']);
    assert.equal(read.status, '');
    assert.deepEqual(page.errors, []);
    await context.close();
});

test('免費的用量用完了（Google 回 429）：改用固定句子，寫「太忙」', async () => {
    const { context, page, read } = await session({ coachOn: true, fakeAI: { error: { code: 'fetch-error', message: '[429 ] RESOURCE_EXHAUSTED', customErrorData: { status: 429 } } } });
    failed(read, FAILURE_TEXT.busy);
    assert.deepEqual(page.errors, []);
    await context.close();
});
