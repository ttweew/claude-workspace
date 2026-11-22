// 授權（11/22 組員決定整個專案用 GNU AGPL-3.0）：全文在根目錄、package.json 寫清楚，
// AGPL-3.0 要求用網站提供服務時讓使用的人拿得到原始碼：首頁、使用說明、研究成果的頁尾都要有原始碼連結（不能被不小心刪掉）
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const SOURCE = 'https://github.com/ttweew/claude-workspace';

test('根目錄的 LICENSE 是 GNU AGPL-3.0 全文，和 YOLO 模型資料夾的一模一樣；package.json 寫 AGPL-3.0-only', () => {
    const text = read('LICENSE');
    assert.match(text, /^\s*GNU AFFERO GENERAL PUBLIC LICENSE\s+Version 3, 19 November 2007/);
    assert.equal(text, read('models/yolo/LICENSE'));
    assert.equal(JSON.parse(read('package.json')).license, 'AGPL-3.0-only');
});

test('首頁、使用說明、研究成果的頁尾都有原始碼的連結（AGPL-3.0）', () => {
    for (const page of ['index.html', 'help.html', 'results.html']) {
        const footer = read(page).match(/<footer>[\s\S]*?<\/footer>/);
        assert.ok(footer, page + ' 沒有頁尾');
        assert.ok(footer[0].includes('<a href="' + SOURCE + '" target="_blank" rel="noopener">原始碼（AGPL-3.0）</a>'), page);
    }
});
