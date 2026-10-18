// 數據面板：即時顯示主要關節的 x、y、z 與可信度（原始資料，未經平滑）
// 讓老師與組員直接看到 MediaPipe 輸出的數字，也方便做驗證實驗

import { LANDMARKS, isMainJoint, isVisible, getDerivedPoints } from './landmarks.js';

const ROWS = LANDMARKS.map(([, name], id) => ({ id, name })).filter(r => isMainJoint(r.id))
    .concat([{ id: 'SHOULDER_CENTER', name: '肩膀中心' }, { id: 'HIP_CENTER', name: '髖部中心' }]);

const fmt = v => (v >= 0 ? ' ' : '') + v.toFixed(3);  // 正數前面補一個數字寬的空白，正負號對齊

let cells = null;

// 第一次使用時建立表格，之後只更新數字（不重建，比較省電）
function build(tbody) {
    tbody.replaceChildren();
    cells = ROWS.map(row => {
        const tr = document.createElement('tr');
        const th = document.createElement('th');
        th.textContent = (typeof row.id === 'number' ? row.id + ' ' : '') + row.name;
        tr.appendChild(th);
        const tds = [0, 1, 2, 3].map(() => tr.appendChild(document.createElement('td')));
        tbody.appendChild(tr);
        return { tr, tds };
    });
}

// landmarks：原始 33 點；沒有偵測到人時傳 null，數字顯示成「—」
export function updateDataPanel(tbody, landmarks) {
    if (!cells || !tbody.contains(cells[0].tr)) build(tbody);
    const derived = landmarks ? getDerivedPoints(landmarks) : null;
    ROWS.forEach((row, i) => {
        const { tr, tds } = cells[i];
        const p = landmarks ? (typeof row.id === 'number' ? landmarks[row.id] : derived[row.id]) : null;
        const values = p ? [fmt(p.x), fmt(p.y), fmt(p.z), p.visibility.toFixed(2)] : ['—', '—', '—', '—'];
        tds.forEach((td, k) => { td.textContent = values[k]; });
        // 看不到的點（模型猜的）顯示成淡色，提醒這筆數字不可靠
        tr.classList.toggle('unseen', !p || !isVisible(p));
    });
}
