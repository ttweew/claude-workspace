// 疲勞分析的顯示（10/28）：首頁「這次運動」寫一句＋前段和後段的數字（數字由 js/analysis/fatigue.js 算）
// 每一項：前段 → 後段（差多少）；超過門檻的那一項寫「可能累了」（不只靠顏色）
import { fatigueLine, fatigueNotes } from '../analysis/fatigue.js';

function el(tag, cls, text, parent) {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text !== undefined) node.textContent = text;
    if (parent) parent.append(node);
    return node;
}

// 差多少：一樣時寫「一樣」；more／less 是變多、變少時的字（例如「慢」「快」）
function change(diff, more, less, unit) {
    if (!diff) return '一樣';
    return (diff > 0 ? more : less) + ' ' + Math.abs(diff) + unit;
}

// box：放的框（div）；f：fatigueOf() 的結果（null 就收起來）
export function renderFatigue(box, f) {
    box.replaceChildren();
    box.hidden = !f;
    if (!f) return;
    el('p', 'fatigue-line' + (f.enough && f.signs.length ? ' tired' : ''), fatigueLine(f), box);
    // 中途休息、中途停住的那一下（10/28 保養）：寫出來，才知道為什麼只比其中一段、哪一下沒算秒數
    for (const note of fatigueNotes(f)) el('p', 'fatigue-note', note, box);
    if (!f.enough) return;
    const { front, back } = f;
    const flagged = new Set(f.signs.map(s => s.key));
    const rows = [];
    if (front.seconds !== null && back.seconds !== null) {
        const pct = front.seconds > 0 ? Math.round((back.seconds / front.seconds - 1) * 100) : 0;
        rows.push(['slower', '每下幾秒', front.seconds + ' 秒', back.seconds + ' 秒', change(pct, '慢', '快', '%')]);
    }
    rows.push(['shallower', '最低的角度', front.angle + '°', back.angle + '°', change(back.angle - front.angle, '淺', '深', '°')]);
    rows.push(['errors', '有錯誤的', front.errorReps + '／' + front.count + ' 下', back.errorReps + '／' + back.count + ' 下',
        change(back.errorReps - front.errorReps, '多', '少', ' 下')]);
    if (front.similarity !== null && back.similarity !== null) {
        rows.push(['similarity', '相似度', front.similarity + '%', back.similarity + '%', change(back.similarity - front.similarity, '多', '掉', ' 分')]);
    }
    // 一項一行（「每下幾秒　2.3 → 3.5 秒（慢 52%）」）：320 寬的手機上總結框只有約 210 像素，四欄的表格放不下，
    // 條列的字會自己換行，不用左右捲動
    el('p', 'fatigue-range', '前段（第 ' + front.from + '～' + front.to + ' 下）→ 後段（第 ' + back.from + '～' + back.to + ' 下）', box);
    const list = el('ul', 'fatigue-list', undefined, box);
    for (const [key, name, a, b, diff] of rows) {
        const li = el('li', flagged.has(key) ? 'tired' : '', undefined, list);
        el('span', 'fatigue-name', name, li);
        li.append(a + ' → ' + b + '（' + diff + '）');
        if (flagged.has(key)) el('span', 'tired-tag', '可能累了', li);
    }
}
