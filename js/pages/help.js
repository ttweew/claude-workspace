// 使用說明頁：離線功能（打開過的頁面沒有網路也能看），以及「檢查這支手機」
import { setupOffline } from '../platform/offline.js';
import { checkSupport, unsupportedAdvice } from '../platform/support.js';

setupOffline();

const $ = id => document.getElementById(id);
const MARK = { true: '✓', false: '✕' };
let report = '';

$('checkBtn').addEventListener('click', () => {
    const r = checkSupport();
    $('checkResult').hidden = false;
    $('checkVerdict').textContent = r.verdict;
    $('checkVerdict').dataset.level = r.level;
    $('checkList').replaceChildren(...r.items.map(item => {
        const div = document.createElement('div');
        const dt = document.createElement('dt');
        const dd = document.createElement('dd');
        dt.textContent = item.name;
        dd.textContent = (item.ok === undefined ? '' : MARK[item.ok] + ' ') + item.value;
        if (item.ok === false) dd.className = item.soft ? 'soft' : 'bad';
        div.append(dt, dd);
        return div;
    }));
    $('checkAdvice').hidden = r.level !== 'no' || r.device.inApp;
    $('checkAdvice').textContent = r.level === 'no' ? unsupportedAdvice(r.device) : '';
    // 複製用的文字：貼給開發團隊，就知道這支手機的情況
    report = ['【手機檢查結果】' + r.verdict]
        .concat(r.items.map(i => i.name + '：' + (i.ok === undefined ? '' : MARK[i.ok] + ' ') + i.value))
        .concat(['螢幕：' + screen.width + '×' + screen.height + '（像素密度 ' + (window.devicePixelRatio || 1) + '）', '識別字串：' + navigator.userAgent])
        .join('\n');
    $('copyStatus').textContent = '';
});

$('copyBtn').addEventListener('click', async () => {
    try {
        await navigator.clipboard.writeText(report);
        $('copyStatus').textContent = '已複製，可以貼到 LINE 或訊息裡';
    } catch (err) {
        // 有些瀏覽器不允許直接複製：改成選取文字，讓使用者自己長按複製
        const old = document.querySelector('.copy-fallback');
        if (old) old.remove();
        const area = document.createElement('textarea');
        area.value = report;
        area.rows = 6;
        area.className = 'copy-fallback';
        area.readOnly = true;
        $('copyBtn').after(area);
        area.select();
        $('copyStatus').textContent = '請長按上面的文字，選「全選」再「拷貝」';
    }
});
