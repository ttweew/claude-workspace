// 每一頁的 id 不能重複：重複時 getElementById 只拿到第一個，另一個按鈕的功能就接錯地方
// （10/26 示範模式的按鈕一開始叫 demoBtn，撞到鏡頭畫面的「選擇動作」，兩個按鈕按了都會打開選動作的視窗）
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const pages = readdirSync(root).filter(f => f.endsWith('.html'));

test('每一頁的 id 都不重複', () => {
    assert.ok(pages.length >= 4, pages.join());
    for (const page of pages) {
        const html = readFileSync(new URL(page, root), 'utf8').replace(/<!--[\s\S]*?-->/g, '');
        const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map(m => m[1]);
        const dup = [...new Set(ids.filter((id, i) => ids.indexOf(id) !== i))];
        assert.deepEqual(dup, [], page + ' 有重複的 id');
    }
});
