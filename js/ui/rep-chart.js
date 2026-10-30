// 「每一下」的圖表（10/27）：首頁的運動總結（js/pages/main.js）和重播分析（js/pages/replay.js）共用
// 數字由 js/analysis/rep-series.js 算好，這裡只畫：
//   計次：每一下蹲多深（最低角度，越高代表彎越多；顏色＝到位／再低一點／太淺，和鏡頭畫面每一下的提示同色）、每一下花幾秒（平均線）
//   棒式：每一次撐幾秒（有目標時畫目標線）
// 兩張分開畫，不共用一個縱軸（角度和秒數單位不同）。字一律用文字的顏色，顏色只在長條上；
// 長條上的 <title> 是滑鼠移上去的說明，手機摸不到，所以下面另外有「每一下的數字」表格，看得到全部
// 字的大小照實際的像素：畫的時候量框的寬度當 viewBox 的寬，字不會跟著放大縮小

import { PAUSE_REP } from '../analysis/session.js';

const SVG = 'http://www.w3.org/2000/svg';
const DEPTH_TEXT = { good: '到位', close: '再低一點', shallow: '太淺' };
const H = 132;                                   // 每張圖的高度（像素）
const PAD = { left: 40, right: 10, top: 16, bottom: 22 };
const BAR_MAX = 24;                              // 長條最寬 24：一兩下時不會變成一大塊
const GAP = 2;                                   // 相鄰長條中間留 2 的空隙

function el(tag, attrs, parent, text) {
    const node = document.createElementNS(SVG, tag);
    for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
    if (text !== undefined) node.textContent = text;
    if (parent) parent.append(node);
    return node;
}
function html(tag, cls, text, parent) {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text !== undefined) node.textContent = text;
    if (parent) parent.append(node);
    return node;
}

// 長條：上面兩個角圓 4、貼著底線的那一端是平的
function barPath(x, w, yTop, yBase) {
    const h = Math.max(1, yBase - yTop);
    const r = Math.min(4, w / 2, h);
    return 'M' + x + ',' + yBase + 'V' + (yBase - h + r) + 'Q' + x + ',' + (yBase - h) + ' ' + (x + r) + ',' + (yBase - h)
        + 'H' + (x + w - r) + 'Q' + (x + w) + ',' + (yBase - h) + ' ' + (x + w) + ',' + (yBase - h + r) + 'V' + yBase + 'Z';
}

// 橫軸的編號：每個至少隔 24 像素；一定標第一下和最後一下
function xTicks(count, band) {
    const steps = [1, 2, 5, 10, 20, 50, 100];
    const step = steps.find(s => s * band >= 24) || 100;
    const out = [];
    for (let n = step; n < count; n += step) out.push(n);
    return [...new Set([1, ...out, count])].filter(n => n === 1 || n === count || (count - n) * band >= 20);
}

// 一張長條圖。items：[{ n, value, cls, title }]；scale：數值 → 高度比例（0～1）
// lines：參考線的數值（到位門檻、平均、目標）：線上不寫字（會和長條擠在一起），說明寫在標題旁的圖例；
// peak：{ n, value } 要在長條上方寫數字的那一個
// 螢幕閱讀器念的（10/30 無障礙）：圖的標題＋這張圖的重點，例如「每一下最低的膝蓋角度：6 下，最深 85°（第 3 下），到位 6 下」
// 以前只念重點，聽不出是哪一張圖；長條上的說明（title）念不到，全部的數字在下面的表格
function columns(box, width, { label, items, count, scale, lines, peak, peakText, axisLabels }) {
    const title = box.querySelector('.rep-title');
    const svg = el('svg', { class: 'rep-svg', width, height: H, viewBox: '0 0 ' + width + ' ' + H, role: 'img', 'aria-label': (title ? title.textContent + '：' : '') + label });
    const plotW = width - PAD.left - PAD.right, plotH = H - PAD.top - PAD.bottom;
    const base = PAD.top + plotH;
    const y = v => base - scale(v) * plotH;
    const band = plotW / count;
    // 下數很多（10/28 保養：100 下在 320 寬的手機上每下不到 2 像素）：留不了空隙時長條佔滿整個欄位、緊貼在一起，
    // 不會互相疊到（以前最窄 2 像素，比欄位寬，一條蓋到下一條）
    const barW = band - GAP >= 2 ? Math.min(BAR_MAX, band - GAP) : band;
    // 底線、參考線（細線，不搶長條）；左邊寫刻度
    el('line', { class: 'rep-axis', x1: PAD.left, x2: width - PAD.right, y1: base + 0.5, y2: base + 0.5 }, svg);
    for (const a of axisLabels) el('text', { class: 'rep-tick', x: PAD.left - 6, y: y(a.value) + 4, 'text-anchor': 'end' }, svg, a.text);
    for (const value of lines) {
        const ly = Math.round(y(value)) + 0.5;
        el('line', { class: 'rep-ref', x1: PAD.left, x2: width - PAD.right, y1: ly, y2: ly }, svg);
    }
    for (const it of items) {
        const cx = PAD.left + (it.n - 0.5) * band;
        const g = el('g', { class: 'rep-bar' }, svg);
        el('title', {}, g, it.title);
        // 摸得到的範圍：整個欄位（比長條大），滑鼠不用剛好對準細細的長條
        el('rect', { class: 'rep-hit', x: cx - band / 2, y: PAD.top, width: band, height: plotH }, g);
        el('path', { class: 'rep-mark ' + it.cls, d: barPath(cx - barW / 2, barW, y(it.value), base) }, g);
    }
    // 只寫一個數字（最深的、最久的）：每一條都寫會擠成一團，其他的看表格
    if (peak) el('text', { class: 'rep-peak', x: PAD.left + (peak.n - 0.5) * band, y: Math.max(11, y(peak.value) - 5), 'text-anchor': 'middle' }, svg, peakText);
    for (const n of xTicks(count, band)) el('text', { class: 'rep-tick', x: PAD.left + (n - 0.5) * band, y: H - 6, 'text-anchor': 'middle' }, svg, String(n));
    box.append(svg);
}

function figure(parent, title, legend) {
    const fig = html('figure', 'rep-fig', undefined, parent);
    const cap = html('figcaption', '', undefined, fig);
    html('span', 'rep-title', title, cap);
    if (legend) {
        const keys = html('span', 'rep-legend', undefined, cap);
        // cls 是 'line' 的是參考線（短短一條線），其他是長條的顏色（小方塊）
        for (const [cls, text] of legend) {
            const key = html('span', 'rep-key', undefined, keys);
            html('i', 'rep-swatch ' + cls, undefined, key).setAttribute('aria-hidden', 'true');
            key.append(text);
        }
    }
    return fig;
}

// name：表格的名字（棒式是「每一次的數字」，10/30 以前也寫「每一下」）
function table(parent, head, rows, name = '每一下的數字') {
    const details = html('details', 'rep-table', undefined, parent);
    html('summary', '', name, details);
    // 窄的手機上表格比框寬，要在框裡左右捲動：框要能用鍵盤選到（Tab 到這裡再按方向鍵），螢幕閱讀器念得出這是什麼（10/30 無障礙）
    const wrap = html('div', 'table-wrap', undefined, details);
    wrap.tabIndex = 0;
    wrap.setAttribute('role', 'region');
    wrap.setAttribute('aria-label', name + '（表格，可以左右捲動）');
    const t = html('table', '', undefined, wrap);
    const tr = html('tr', '', undefined, html('thead', '', undefined, t));
    for (const h of head) html('th', '', h, tr).setAttribute('scope', 'col');
    const body = html('tbody', '', undefined, t);
    for (const row of rows) {
        const r = html('tr', '', undefined, body);
        row.forEach(cell => html('td', '', cell, r));
    }
}

// box：放圖表的框（div）；series：repSeries() 的結果（null 就收起來）；goal：棒式的目標秒數（沒有是 null）
// table：要不要畫下面的「每一下的數字」表格（重播分析本來就有更詳細的表格，不用再畫一次）
export function renderRepChart(box, series, { goal = null, table: withTable = true } = {}) {
    box.replaceChildren();
    box.hidden = !series;
    if (!series) return;
    // 框還看不到（寬度 0）時先用 320；最窄 200（320 寬的手機上約 240）
    const width = Math.max(200, Math.round(box.clientWidth) || 320);
    if (series.kind === 'hold') {
        const holds = series.holds;
        const top = Math.max(10, ...holds.map(h => h.seconds), goal || 0);
        const max = Math.ceil(top / 10) * 10;
        const best = holds.reduce((a, b) => (b.seconds > a.seconds ? b : a));
        const fig = figure(box, '每一次撐幾秒', Number.isInteger(goal) ? [['line', '目標 ' + goal + ' 秒']] : null);
        columns(fig, width, {
            label: holds.length + ' 次，最久 ' + best.seconds + ' 秒（第 ' + best.n + ' 次）',
            items: holds.map(h => ({ n: h.n, value: h.seconds, cls: 'time', title: '第 ' + h.n + ' 次：' + h.seconds + ' 秒' + (h.errors.length ? '，' + h.errors.join('、') : '') })),
            count: holds[holds.length - 1].n, scale: v => v / max,
            lines: Number.isInteger(goal) ? [goal] : [],
            peak: { n: best.n, value: best.seconds }, peakText: best.seconds + ' 秒',
            axisLabels: [{ value: 0, text: '0' }, { value: max, text: max + ' 秒' }]
        });
        // 「晃動」（動作穩定度，10/30，js/analysis/stability.js）：髖部上下晃動幾度；一次都沒算到就整欄不畫
        const swayed = holds.some(h => h.sway !== null && h.sway !== undefined);
        const holdSway = h => (h.sway === null || h.sway === undefined ? '—' : '±' + h.sway + '°');
        if (withTable) table(box, ['第幾次', '秒數', ...(swayed ? ['晃動'] : []), '錯誤'], holds.map(h => [String(h.n), String(h.seconds), ...(swayed ? [holdSway(h)] : []), h.errors.join('、') || '—']), '每一次的數字');
        return;
    }
    const reps = series.reps;
    const count = reps[reps.length - 1].n;
    // 深度：最低角度從 180°（站直）往上長，越高彎越多；縱軸固定 180°～30°，每次運動比得起來
    const LOW = 30, HIGH = 180;
    const depthScale = v => (HIGH - Math.min(HIGH, Math.max(LOW, v))) / (HIGH - LOW);
    const deepest = reps.reduce((a, b) => (b.angle < a.angle ? b : a));
    const good = reps.filter(r => r.depth === 'good').length;
    const fig = figure(box, '每一下最低的' + series.joint + '角度', [['good', '到位 ≤ ' + series.good + '°'], ['close', '再低一點 ≤ ' + series.close + '°'], ['shallow', '太淺']]);
    columns(fig, width, {
        label: reps.length + ' 下，最深 ' + deepest.angle + '°（第 ' + deepest.n + ' 下），到位 ' + good + ' 下',
        items: reps.map(r => ({ n: r.n, value: r.angle, cls: r.depth, title: '第 ' + r.n + ' 下：' + r.angle + '°，' + DEPTH_TEXT[r.depth] + (r.stalls > 0 ? '，中途卡了一下' : '') + (r.errors.length ? '，' + r.errors.join('、') : '') })),
        count, scale: depthScale,
        lines: [series.good],
        peak: { n: deepest.n, value: deepest.angle }, peakText: deepest.angle + '°',
        axisLabels: [{ value: HIGH, text: HIGH + '°' }, { value: series.good, text: series.good + '°' }]
    });
    // 速度：每一下從彎下去到站起來幾秒；縱軸從 0 開始，至少到 3 秒
    const timed = reps.filter(r => r.seconds !== null);
    if (timed.length) {
        // 中途停住的那一下（超過 10 秒，session.js 的 PAUSE_REP）不拿來定縱軸：不然一下停 40 秒，其他的都變得扁扁的看不出差別
        // 那一條畫到最上面（超出的部分不畫），說明和表格寫真的秒數
        const normal = timed.filter(r => r.seconds <= PAUSE_REP);
        const max = Math.max(3, Math.ceil(Math.max(...(normal.length ? normal : timed).map(r => r.seconds))));
        const slowest = timed.reduce((a, b) => (b.seconds > a.seconds ? b : a));
        // 平均不算中途停住的那一下（和總結的「每下約幾秒」一樣），圖例寫出來
        const avgText = '平均 ' + series.tempo + ' 秒' + (normal.length && normal.length < timed.length ? '（不算停住的）' : '');
        const fig2 = figure(box, '每一下花幾秒', series.tempo !== null ? [['line', avgText]] : null);
        columns(fig2, width, {
            label: '平均每下 ' + series.tempo + ' 秒，最慢 ' + slowest.seconds + ' 秒（第 ' + slowest.n + ' 下）',
            items: timed.map(r => ({ n: r.n, value: r.seconds, cls: 'time', title: '第 ' + r.n + ' 下：' + r.seconds + ' 秒' + (r.seconds > max ? '（中途停住，超出圖的範圍）' : '') })),
            count, scale: v => Math.min(1, v / max),
            lines: series.tempo !== null ? [series.tempo] : [],
            peak: { n: slowest.n, value: slowest.seconds }, peakText: slowest.seconds + ' 秒',
            axisLabels: [{ value: 0, text: '0' }, { value: max, text: max + ' 秒' }]
        });
    }
    // 「順不順」（動作流暢度，10/29，js/analysis/fluency.js）：中途卡住幾次；弓箭步不看，整欄不畫
    const fluent = reps.some(r => Number.isInteger(r.stalls));
    const smooth = r => (!Number.isInteger(r.stalls) ? '—' : r.stalls ? '卡了 ' + r.stalls + ' 次' : '順');
    // 「晃動」（動作穩定度，10/30，js/analysis/stability.js）：重心前後晃動幾 %；伏地挺身不看，整欄不畫
    const swayed = reps.some(r => r.sway !== null && r.sway !== undefined);
    const sway = r => (r.sway === null || r.sway === undefined ? '—' : r.sway + '%');
    if (withTable) table(box, ['第幾下', '最低角度', '深度', '秒數', ...(fluent ? ['順不順'] : []), ...(swayed ? ['晃動'] : []), '錯誤'],
        reps.map(r => [String(r.n), r.angle + '°', DEPTH_TEXT[r.depth], r.seconds === null ? '—' : String(r.seconds), ...(fluent ? [smooth(r)] : []), ...(swayed ? [sway(r)] : []), r.errors.join('、') || '—']));
}
