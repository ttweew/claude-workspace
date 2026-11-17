// 內容安全政策（CSP，11/17 大翻查）：六頁的 <meta http-equiv="Content-Security-Policy"> 一模一樣、放在最前面、
// 網站真的會用到的外部網址都有列、nomodule 那段文字改了要一起改指紋
// 瀏覽器實際跑起來有沒有被擋：tests/browser/csp.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';

const ROOT = new URL('../', import.meta.url);
const PAGES = readdirSync(ROOT).filter(f => f.endsWith('.html')).sort();
const read = f => readFileSync(new URL(f, ROOT), 'utf8');

function policy(html) {
    const all = [...html.matchAll(/<meta http-equiv="Content-Security-Policy" content="([^"]+)">/g)];
    assert.equal(all.length, 1, '每一頁剛好一個');
    const map = {};
    for (const part of all[0][1].split(';')) {
        const [name, ...values] = part.trim().split(/\s+/);
        map[name] = values;
    }
    return { text: all[0][1], at: all[0].index, map };
}

test('六頁都有、內容一模一樣，放在任何程式和樣式之前', () => {
    assert.equal(PAGES.length, 6);
    const texts = new Set();
    for (const f of PAGES) {
        const html = read(f);
        const p = policy(html);
        texts.add(p.text);
        const first = Math.min(...['<script', '<link', '<style'].map(t => html.indexOf(t)).filter(i => i >= 0));
        assert.ok(p.at < first, f + '：CSP 要在第一個 <script>、<link> 之前，不然前面的不受管');
    }
    assert.equal(texts.size, 1, '六頁要一模一樣（改一頁要全部一起改）');
});

test('基本的關門：不准 <object>、不准改 <base>、表單只能送回自己；沒有 unsafe-inline 的程式', () => {
    const { map } = policy(read('index.html'));
    assert.deepEqual(map['object-src'], ["'none'"]);
    assert.deepEqual(map['base-uri'], ["'self'"]);
    assert.deepEqual(map['form-action'], ["'self'"]);
    assert.deepEqual(map['default-src'], ["'self'"]);
    assert.ok(!map['script-src'].includes("'unsafe-inline'"), '程式不能開 unsafe-inline（不然被塞進來的 <script> 會執行）');
});

test('頁面裡直接寫的程式（nomodule 的提示）每一段的指紋都在名單上；沒有 onclick= 這種寫在標籤上的程式', () => {
    const { map } = policy(read('index.html'));
    for (const f of PAGES) {
        const html = read(f);
        for (const m of html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)) {
            const hash = "'sha256-" + createHash('sha256').update(m[1], 'utf8').digest('base64') + "'";
            assert.ok(map['script-src'].includes(hash), f + ' 的 nomodule 文字改過了：CSP 的指紋要換成 ' + hash);
        }
        assert.doesNotMatch(html, /\son[a-z]+\s*=\s*["']/i, f + '：不要用 onclick= 這種寫法（CSP 會擋）');
        assert.doesNotMatch(html, /href\s*=\s*["']javascript:/i, f);
    }
});

test('網站用到的外部網址都有列：AI 檔案、骨架模型、Firebase、雲端、Gemini', () => {
    const { map } = policy(read('index.html'));
    const config = read('js/config.js') + read('js/cloud/config.js');
    // 程式（import、importScripts、<script>）：MediaPipe 兩個下載來源、Firebase 的程式
    for (const origin of [...config.matchAll(/'(https:\/\/[a-z0-9.-]+)\//g)].map(m => m[1])) {
        assert.ok(map['connect-src'].includes(origin), origin + ' 要在 connect-src');
    }
    for (const origin of ['https://cdn.jsdelivr.net', 'https://unpkg.com', 'https://www.gstatic.com']) {
        assert.ok(map['script-src'].includes(origin), origin + ' 要在 script-src');
    }
    // 雲端同步、登入、Gemini（Firebase 的程式連的地方，11/17 從 firebase 12.19.0 的程式裡找出來的）
    for (const host of ['firestore.googleapis.com', 'identitytoolkit.googleapis.com', 'securetoken.googleapis.com', 'firebasevertexai.googleapis.com']) {
        assert.ok(map['connect-src'].includes('https://' + host), host);
    }
    // Firebase 登入在手機上會先開一個看不見的框（authDomain）
    const authDomain = read('js/cloud/config.js').match(/authDomain: '([^']+)'/)[1];
    assert.ok(map['frame-src'].includes('https://' + authDomain));
    // App Check（11/17）：reCAPTCHA 的程式和背景的小框、換通行證的地方
    assert.ok(map['script-src'].includes('https://www.google.com/recaptcha/'));
    assert.ok(map['frame-src'].includes('https://www.google.com/recaptcha/') && map['frame-src'].includes('https://recaptcha.google.com/recaptcha/'));
    assert.ok(map['connect-src'].includes('https://content-firebaseappcheck.googleapis.com'));
    // 只開 reCAPTCHA 那一個資料夾，不是整個 www.google.com
    assert.ok(!map['script-src'].includes('https://www.google.com') && !map['connect-src'].includes('https://www.google.com'));
    // AI 引擎要編譯 WebAssembly；分頁、背景執行緒都是自己網站的檔案
    assert.ok(map['script-src'].includes("'wasm-unsafe-eval'"));
    assert.deepEqual(map['worker-src'], ["'self'"]);
});
