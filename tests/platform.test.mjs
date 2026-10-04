// 裝置支援（js/platform/support.js）：從瀏覽器識別字串判斷系統與瀏覽器
import test from 'node:test';
import assert from 'node:assert/strict';
import { describeDevice, unsupportedAdvice } from '../js/platform/support.js';

test('iPhone：版本 17.5 不會被讀成 17.05', () => {
    const d = describeDevice('Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1');
    assert.equal(d.os, 'iOS');
    assert.equal(d.osVersion, '17.5');
    assert.equal(d.osMajor, 17);
    assert.equal(d.browser, 'Safari 17');
});

test('Android Chrome、三星瀏覽器', () => {
    const chrome = describeDevice('Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36');
    assert.equal(chrome.os, 'Android');
    assert.equal(chrome.browser, 'Chrome 129');
    const samsung = describeDevice('Mozilla/5.0 (Linux; Android 13; SM-A536E) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/25.0 Chrome/121.0.0.0 Mobile Safari/537.36');
    assert.equal(samsung.browser, '三星瀏覽器 25');
});

test('LINE、Instagram 內建瀏覽器要提醒改用 Chrome、Safari', () => {
    const line = describeDevice('Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Safari Line/13.17.0');
    assert.equal(line.inApp, true);
    const ig = describeDevice('Mozilla/5.0 (Linux; Android 12; Pixel 6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36 Instagram 312.0');
    assert.equal(ig.inApp, true);
});

test('不支援時的建議：iPhone 提示更新到 iOS 15', () => {
    assert.match(unsupportedAdvice({ os: 'iOS' }), /iOS 15/);
    assert.match(unsupportedAdvice({ os: 'Android' }), /Chrome/);
});
