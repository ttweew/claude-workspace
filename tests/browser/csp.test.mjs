// 內容安全政策（CSP，11/17 大翻查）在瀏覽器裡真的跑起來：網站自己的功能一個都不被擋，塞進來的程式被擋
// 頁面上的規則本身（六頁一樣、外部網址、指紋）：tests/csp.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { launch, serve, open, script, rep, workout } from './harness.mjs';

const PAGES = ['index.html', 'replay.html', 'help.html', 'report.html', 'protractor.html', 'results.html'];
// 每一頁被 CSP 擋下的東西都記下來（document 的 securitypolicyviolation 事件）
const WATCH = `document.addEventListener('securitypolicyviolation', e => {
    (window.__csp = window.__csp || []).push(e.violatedDirective + ' ' + (e.blockedURI || '(inline)'));
});`;
const blocked = page => page.evaluate(() => window.__csp || []);

let browser, site;
test.before(async () => {
    site = await serve();
    browser = await launch();
});
test.after(async () => {
    await browser.close();
    await site.close();
});

test('六頁打開（手機寬度）：沒有任何東西被 CSP 擋', async () => {
    const { context, page } = await open(browser, [], { width: 390, height: 844, mobile: true });
    await context.addInitScript(WATCH);
    const found = {};
    for (const name of PAGES) {
        await page.goto(site.base + name);
        await page.waitForLoadState('load');
        await page.waitForTimeout(500);
        const b = await blocked(page);
        if (b.length) found[name] = b;
    }
    assert.deepEqual(found, {});
    assert.deepEqual(page.errors, []);
    await context.close();
});

test('運動一組（AI、雲端同步、AI 教練都打開）、重播分析的示範：沒有東西被擋', async () => {
    const SQUAT = script([{ id: 'squat', depth: 0, frames: 60 }, ...[1, 2, 3].flatMap(() => rep('squat', { rest: 30 }))]);
    const { context, page } = await open(browser, SQUAT);
    await context.addInitScript(WATCH);
    // 雲端同步、AI 教練打開：會從 www.gstatic.com 載入 Firebase 的程式（測試裡是假的，網址一樣）
    await context.addInitScript(() => {
        try { localStorage.setItem('cloudSync', '1'); localStorage.setItem('aiCoach', '1'); } catch (err) { /* 沒關係 */ }
        window.__fakeAI = { reply: '每一下都蹲到位。' };
    });
    await workout(page, site.base, 'squat', () => document.getElementById('hudReps').textContent === '3');
    assert.deepEqual(await blocked(page), []);
    await page.goto(site.base + 'replay.html?demo');
    await page.waitForTimeout(3000);
    assert.deepEqual(await blocked(page), []);
    assert.deepEqual(page.errors, []);
    await context.close();
});

test('塞進頁面的程式不會執行（CSP 有效）', async () => {
    const { context, page } = await open(browser, []);
    await context.addInitScript(WATCH);
    await page.goto(site.base + 'index.html');
    await page.waitForLoadState('load');
    await page.evaluate(() => {
        const s = document.createElement('script');
        s.textContent = 'window.__injected = 1';
        document.body.append(s);
        const img = document.createElement('img');
        img.setAttribute('onerror', 'window.__injected = 2');
        img.src = 'data:,x';
        document.body.append(img);
        const ext = document.createElement('script');
        ext.src = 'https://evil.example.com/x.js';
        document.body.append(ext);
    });
    await page.waitForTimeout(500);
    assert.equal(await page.evaluate(() => window.__injected), undefined);
    const b = await blocked(page);
    assert.ok(b.some(x => /^script-src/.test(x) && /inline/.test(x)), b.join('\n'));
    assert.ok(b.some(x => /evil\.example\.com/.test(x)), b.join('\n'));
    await context.close();
});
