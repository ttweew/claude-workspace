// 使用說明頁：離線功能（打開過的頁面沒有網路也能看）、「檢查這支手機」、驗證實驗 A 的比對表
import { setupOffline } from '../platform/offline.js';
import { checkSupport, unsupportedAdvice } from '../platform/support.js';
import { loadSnapshots, saveSnapshots, clearSnapshots, stats, toCSV, JOINT_NAMES, MEASURE_RANGE, validMeasure } from '../analysis/validate.js';
import { downloadBlob } from '../data/recorder.js';

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

// ---------- 驗證實驗 A：網站角度和量角器比對（js/analysis/validate.js） ----------
function showValidation() {
    const list = loadSnapshots();
    $('valEmpty').hidden = list.length > 0;
    $('valWrap').hidden = $('valActions').hidden = !list.length;
    $('valRows').replaceChildren(...list.map((s, i) => {
        const tr = document.createElement('tr');
        const td = text => { const c = document.createElement('td'); c.textContent = text; return c; };
        const d = new Date(s.time);
        const time = (d.getMonth() + 1) + '/' + d.getDate() + ' ' + d.getHours() + ':' + String(d.getMinutes()).padStart(2, '0') + ':' + String(d.getSeconds()).padStart(2, '0');
        // 比對哪個關節：預設是記下時主要的關節，可以改
        const pick = document.createElement('select');
        pick.setAttribute('aria-label', '第 ' + (i + 1) + ' 筆比對的關節');
        for (const [key, name] of Object.entries(JOINT_NAMES)) {
            const o = document.createElement('option');
            o.value = key;
            o.textContent = name;
            pick.append(o);
        }
        pick.value = s.joint;
        const site = td('');
        const input = document.createElement('input');
        input.type = 'number';
        input.inputMode = 'decimal';
        input.min = String(MEASURE_RANGE[0]);
        input.max = String(MEASURE_RANGE[1]);
        input.step = '1';
        input.placeholder = '量到的';
        input.setAttribute('aria-label', '第 ' + (i + 1) + ' 筆量角器的角度');
        if (validMeasure(s.measured)) input.value = s.measured;
        const diff = td('');
        // 網站角度寫到小數第 1 位（記下時就是這個精度）：寫成整數的話，92.4° 對 90° 會看到「92°」卻差「+2.4°」
        const refresh = () => {
            const a = s.angles[s.joint];
            site.textContent = a === null || a === undefined ? '—' : a.toFixed(1) + '°';
            const ok = validMeasure(s.measured) && a !== null && a !== undefined;
            const d = ok ? Math.round((a - s.measured) * 10) / 10 : null;
            diff.textContent = ok ? (d > 0 ? '+' : '') + d.toFixed(1) + '°' : '';
        };
        pick.addEventListener('change', () => { s.joint = pick.value; saveSnapshots(list); refresh(); showStats(list); });
        input.addEventListener('input', () => {
            const v = parseFloat(input.value);
            // 0～180° 以外（打錯字，例如 900）不算進統計，框變紅提醒
            s.measured = validMeasure(v) ? v : null;
            input.setAttribute('aria-invalid', String(input.value !== '' && s.measured === null));
            saveSnapshots(list);
            refresh();
            showStats(list);
        });
        refresh();
        const jointCell = document.createElement('td');
        jointCell.append(pick);
        const inputCell = document.createElement('td');
        inputCell.append(input);
        tr.append(td(String(i + 1)), td(time), jointCell, site, inputCell, diff);
        return tr;
    }));
    showStats(list);
}
function showStats(list) {
    const r = stats(list);
    $('valStats').hidden = !list.length;
    $('valStats').textContent = r.n
        ? '已填 ' + r.n + ' 筆：平均誤差 ' + r.mae + '°（平均差 ' + (r.bias > 0 ? '+' : '') + r.bias + '°，標準差 ' + r.sd + '°，最大 ' + r.max + '°）；'
            + r.within5 + '% 在 ±5° 以內、' + r.within10 + '% 在 ±10° 以內'
        : '填入量角器的角度後，這裡會算出平均差幾度';
}
$('valCsv').addEventListener('click', () => {
    const d = new Date();
    const name = 'angle_check_' + d.getFullYear() + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0') + '.csv';
    downloadBlob(name, new Blob([toCSV(loadSnapshots())], { type: 'text/csv' }));
});
$('valClear').addEventListener('click', () => {
    if (!confirm('清除全部記下的角度？（清除後無法復原，建議先下載 CSV）')) return;
    clearSnapshots();
    showValidation();
});
showValidation();
