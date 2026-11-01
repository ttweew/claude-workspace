// 首頁的「成長曲線」（11/1）：運動紀錄照日期畫成一條線，一天一個點（數字怎麼算在 js/analysis/growth.js）
//   選動作、選數字（一次最多幾下、到位比例…）兩個選單放在圖的上面，同一列
//   這台裝置的紀錄一定有；雲端同步打開時，打開這一塊才去讀雲端上的（js/cloud/cloud.js 的 loadRecords），
//   只在雲端的那幾筆（這台裝置只留最近 50 次、清除過紀錄）也畫進來；讀不到就先畫這台裝置的，寫出原因
// 畫法和「每一下」的圖表一樣（js/ui/rep-chart.js）：一個縱軸、字用文字的顏色、線和點用資訊藍；
// 點上的 <title> 是滑鼠移上去的說明，手機摸不到，所以下面有「每一天的數字」表格
import { cloud } from '../cloud/cloud.js';
import { loadHistory } from '../analysis/session.js';
import { WORKOUTS } from '../analysis/workouts.js';
import { METRICS, mergeRecords, growthWorkouts, growthSeries, growthLine } from '../analysis/growth.js';

const SVG = 'http://www.w3.org/2000/svg';
const H = 160;
const PAD = { left: 40, right: 16, top: 18, bottom: 22 };
// 橫軸的日期（「10/20」12px 的字約 32 像素寬，字和字之間至少空 8 像素）：
//   中間的日期寫在點的正下方（置中），第一天靠左對齊、最後一天靠右對齊（不會超出圖）
//   所以中間的和中間的至少隔 40，和第一天、最後一天至少隔 56（置中的一半 16＋靠邊的整個 32＋空 8）
//   11/1 拍照看到第一天、第二天的日期疊在一起（「10/1510/17」）才分開算
const LABEL_GAP = 40, EDGE_GAP = 56;

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

// 縱軸的最上面：百分比固定 0～100（每個動作、每天比得起來）；下數、秒數取比最大值大一點的整數（5 的倍數，至少 10）
function topOf(g) {
    if (g.metric.unit === '%') return 100;
    const max = Math.max(...g.days.map(d => d.value));
    return Math.max(10, Math.ceil(max * 1.1 / 5) * 5);
}
const valueText = (g, v) => v + (g.metric.unit === '%' ? '%' : ' ' + g.metric.unit);

// 橫軸要寫日期的點：一定寫第一天和最後一天，中間的照上面的間隔挑
function labeled(xs) {
    const out = [0];
    const last = xs.length - 1;
    for (let i = 1; i < last; i++) {
        const prev = out[out.length - 1];
        if (xs[i] - xs[prev] >= (prev === 0 ? EDGE_GAP : LABEL_GAP) && xs[last] - xs[i] >= EDGE_GAP) out.push(i);
    }
    if (last > 0) out.push(last);
    return out;
}

// 畫一條曲線＋表格；g 是 growthSeries() 的結果
function draw(box, g) {
    box.replaceChildren();
    const width = Math.max(200, Math.round(box.clientWidth) || 320);
    const fig = html('figure', 'rep-fig', undefined, box);
    const title = WORKOUTS[g.workout].name + ' ' + g.metric.name;
    html('span', 'rep-title', title, html('figcaption', '', undefined, fig));
    const line = growthLine(g);
    const svg = el('svg', { class: 'rep-svg growth-svg', width, height: H, viewBox: '0 0 ' + width + ' ' + H, role: 'img', 'aria-label': line }, fig);
    const plotW = width - PAD.left - PAD.right, plotH = H - PAD.top - PAD.bottom;
    const base = PAD.top + plotH;
    const top = topOf(g);
    const y = v => base - Math.min(1, v / top) * plotH;
    const n = g.days.length;
    // 一天的話放中間；兩天以上平均排開（照「第幾個有紀錄的天」，沒運動的天不留空：手機上 30 天才排得下）
    const xs = g.days.map((d, i) => (n === 1 ? PAD.left + plotW / 2 : PAD.left + plotW * i / (n - 1)));
    el('line', { class: 'rep-axis', x1: PAD.left, x2: width - PAD.right, y1: base + 0.5, y2: base + 0.5 }, svg);
    el('text', { class: 'rep-tick', x: PAD.left - 6, y: base + 4, 'text-anchor': 'end' }, svg, '0');
    el('text', { class: 'rep-tick', x: PAD.left - 6, y: y(top) + 4, 'text-anchor': 'end' }, svg, valueText(g, top).replace(' ', ''));
    el('line', { class: 'growth-grid', x1: PAD.left, x2: width - PAD.right, y1: Math.round(y(top)) + 0.5, y2: Math.round(y(top)) + 0.5 }, svg);
    if (n > 1) el('path', { class: 'growth-line', d: g.days.map((d, i) => (i ? 'L' : 'M') + xs[i].toFixed(1) + ',' + y(d.value).toFixed(1)).join('') }, svg);
    // 每一天：摸得到的範圍是那一天的整個欄位（比點大很多），點是直徑 9 的圓、外面一圈底色（線穿過去時點看得清楚）
    const band = n === 1 ? plotW : plotW / (n - 1);
    g.days.forEach((d, i) => {
        const grp = el('g', { class: 'growth-day' }, svg);
        el('title', {}, grp, d.label + '：' + valueText(g, d.value) + (d.sessions > 1 ? '（' + d.sessions + ' 組）' : ''));
        el('rect', { class: 'rep-hit', x: Math.max(PAD.left - 8, xs[i] - band / 2), y: PAD.top, width: Math.min(band, plotW + 16), height: plotH }, grp);
        el('circle', { class: 'growth-dot', cx: xs[i].toFixed(1), cy: y(d.value).toFixed(1), r: 4.5 }, grp);
    });
    // 只寫最後一天的數字（最新的）；最多的那天不是最後一天時也寫（每一點都寫會擠成一團，其他的看表格）
    const marks = [n - 1];
    const bestIdx = g.days.indexOf(g.best);
    if (bestIdx !== n - 1) marks.push(bestIdx);
    for (const i of marks) {
        const d = g.days[i];
        const anchor = n === 1 ? 'middle' : i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle';
        el('text', { class: 'rep-peak', x: xs[i].toFixed(1), y: Math.max(11, y(d.value) - 9).toFixed(1), 'text-anchor': anchor }, svg, valueText(g, d.value));
    }
    for (const i of labeled(xs)) {
        const anchor = n === 1 ? 'middle' : i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle';
        el('text', { class: 'rep-tick', x: xs[i].toFixed(1), y: H - 6, 'text-anchor': anchor }, svg, g.days[i].label);
    }
    html('p', 'growth-line-text', line, box);
    if (g.earlier) html('p', 'growth-note', '更早的 ' + g.earlier + ' 天沒有畫（最多畫最近 30 天），在下面的表格和「運動紀錄」的 CSV', box);
    // 表格：新的在上面（和「運動紀錄」一樣）；可以用鍵盤選到、左右捲動（和每一下的表格一樣）
    const details = html('details', 'rep-table', undefined, box);
    html('summary', '', '每一天的數字', details);
    const wrap = html('div', 'table-wrap', undefined, details);
    wrap.tabIndex = 0;
    wrap.setAttribute('role', 'region');
    wrap.setAttribute('aria-label', '每一天的數字（表格，可以左右捲動）');
    const t = html('table', '', undefined, wrap);
    const tr = html('tr', '', undefined, html('thead', '', undefined, t));
    for (const h of ['日期', g.metric.name, '幾組']) html('th', '', h, tr).setAttribute('scope', 'col');
    const body = html('tbody', '', undefined, t);
    for (const d of [...g.days].reverse()) {
        const r = html('tr', '', undefined, body);
        [d.label, valueText(g, d.value), String(d.sessions)].forEach(cell => html('td', '', cell, r));
    }
}

// 回傳 { refresh() }：運動紀錄改變時（運動完、清除紀錄）呼叫
export function setupGrowth() {
    const box = document.getElementById('growthBox');
    const sub = document.getElementById('growthSub');
    const workoutPick = document.getElementById('growthWorkout');
    const metricPick = document.getElementById('growthMetric');
    const chart = document.getElementById('growthChart');
    const note = document.getElementById('growthNote');
    // 雲端讀回來的（這一頁打開期間記著）：state 是 off（沒打開雲端同步）、loading、ok、failed
    let cloudRecords = [];
    let cloudState = 'off';
    let cloudOnly = 0;

    function option(select, value, text) {
        const o = document.createElement('option');
        o.value = value;
        o.textContent = text;
        select.append(o);
    }

    function render() {
        const local = loadHistory();
        const merged = mergeRecords(local, cloudState === 'ok' ? cloudRecords : []);
        cloudOnly = merged.cloudOnly;
        const records = merged.records;
        const workouts = growthWorkouts(records);
        // 雲端同步打開時，這台裝置沒有紀錄也出現（雲端上可能有）
        box.hidden = !records.length && !cloud.enabled;
        sub.textContent = records.length ? workouts.map(id => WORKOUTS[id].name).join('、') + '，' + records.length + ' 次' : '還沒有紀錄';
        // 選單：有紀錄的動作；原本選的還在就留著
        const keepWorkout = workoutPick.value;
        workoutPick.replaceChildren();
        workouts.forEach(id => option(workoutPick, id, WORKOUTS[id].name));
        if (workouts.includes(keepWorkout)) workoutPick.value = keepWorkout;
        const id = workoutPick.value;
        const keepMetric = metricPick.value;
        metricPick.replaceChildren();
        const metrics = id ? METRICS[WORKOUTS[id].kind] : [];
        metrics.forEach(m => option(metricPick, m.id, m.name));
        if (metrics.some(m => m.id === keepMetric)) metricPick.value = keepMetric;
        workoutPick.disabled = metricPick.disabled = !workouts.length;
        // 框打開了才畫（要量框的寬度）
        const g = id && box.open ? growthSeries(records, id, metricPick.value) : null;
        if (g) draw(chart, g);
        else chart.replaceChildren();
        chart.hidden = !g;
        note.textContent = sourceText(local.length, records.length);
    }

    // 資料從哪裡來（一行小字）
    function sourceText(localCount, total) {
        if (!cloud.available) return '這台裝置上的 ' + localCount + ' 次紀錄';
        if (cloudState === 'off') return '只有這台裝置上的 ' + localCount + ' 次紀錄；打開「雲端同步」後，清除過、超過 50 次的舊紀錄也會畫進來';
        if (cloudState === 'loading') return '正在讀雲端上的紀錄…（先畫這台裝置上的 ' + localCount + ' 次）';
        if (cloudState === 'failed') return '雲端暫時讀不到：先畫這台裝置上的 ' + localCount + ' 次紀錄，下次打開再試';
        return cloudOnly ? '這台裝置上的 ' + localCount + ' 次＋只在雲端的 ' + cloudOnly + ' 次，共 ' + total + ' 次'
            : '這台裝置上的 ' + localCount + ' 次（雲端上的都在這台裝置上）';
    }

    // 打開時讀一次雲端（讀過了、讀到一半就不再讀；失敗了下次打開再試）
    async function loadCloud() {
        if (!cloud.enabled) {
            cloudState = 'off';
            return;
        }
        if (cloudState === 'ok' || cloudState === 'loading') return;
        cloudState = 'loading';
        render();
        try {
            const list = await cloud.loadRecords();
            cloudRecords = list || [];
            cloudState = list ? 'ok' : 'off';
        } catch (err) {
            console.warn('成長曲線：雲端的紀錄讀不到', err);
            cloudState = 'failed';
        }
        render();
    }

    box.addEventListener('toggle', () => {
        if (!box.open) return;
        render();
        loadCloud();
    });
    workoutPick.addEventListener('change', render);
    metricPick.addEventListener('change', render);
    render();
    return {
        refresh() {
            // 剛打開或關掉雲端同步：關掉的話不再用雲端讀過的
            if (!cloud.enabled) cloudState = 'off';
            render();
            if (box.open && cloud.enabled && cloudState === 'off') loadCloud();
        }
    };
}
