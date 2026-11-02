// 無障礙（10/30）：axe-core 自動檢查每一頁（320 寬的手機、1280 寬的電腦），和運動完的總結（圖表、打開的表格）
// axe-core 要另外裝（npm install --no-save axe-core），或用 AXE_CORE 指定 axe.min.js 的位置（harness.mjs 的 violations）
import test from 'node:test';
import assert from 'node:assert/strict';
import { launch, serve, open, script, rep, workout, violations } from './harness.mjs';

const PAGES = ['index.html', 'replay.html', 'help.html', 'report.html', 'protractor.html', 'results.html'];
const SIZES = [{ width: 320, height: 640, mobile: true }, { width: 1280, height: 900 }];

let browser, site;
test.before(async () => {
    site = await serve();
    browser = await launch();
});
test.after(async () => {
    await browser.close();
    await site.close();
});

for (const size of SIZES) {
    test('每一頁 ' + size.width + ' 寬：axe-core 0 個問題', async () => {
        const { context, page } = await open(browser, [], size);
        // 全部的頁面看完再一起比，一次看到每一頁的問題
        const found = {};
        for (const name of PAGES) {
            await page.goto(site.base + name);
            await page.waitForLoadState('load');
            await page.waitForTimeout(300);
            const v = await violations(page);
            if (v.length) found[name] = v;
        }
        assert.deepEqual(found, {});
        assert.deepEqual(page.errors, []);
        await context.close();
    });
}

// 運動完的總結：深蹲 6 下（圖表、流暢度、穩定度、打開的「每一下的數字」）
const SQUAT = script([{ id: 'squat', depth: 0, frames: 60 }, ...[1, 2, 3, 4, 5, 6].flatMap(() => rep('squat', { rest: 30 }))]);
for (const size of SIZES) {
    test('運動完的總結 ' + size.width + ' 寬：axe-core 0 個問題', async () => {
        const { context, page } = await open(browser, SQUAT, size);
        await workout(page, site.base, 'squat', () => document.getElementById('hudReps').textContent === '6');
        await page.click('#repChart details.rep-table summary');
        assert.deepEqual(await violations(page, '#summary'), []);
        assert.deepEqual(page.errors, []);
        await context.close();
    });
}
