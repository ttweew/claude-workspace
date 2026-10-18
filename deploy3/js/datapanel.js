// 數據面板：即時顯示主要關節的 x、y、z 與可信度（原始資料，未經平滑）
// 讓老師與組員直接看到 MediaPipe 輸出的數字，也方便做驗證實驗

import { LANDMARKS, isMainJoint, isVisible, getDerivedPoints } from './landmarks.js';
import { ANGLES, signedAngle, shortSegments } from './angles.js';
import { VIEW_NAMES } from './view.js';

const ROWS = LANDMARKS.map(([, name], id) => ({ id, name })).filter(r => isMainJoint(r.id))
    .concat([{ id: 'SHOULDER_CENTER', name: '肩膀中心' }, { id: 'HIP_CENTER', name: '髖部中心' }]);

// 正數前面補一個數字寬的空白，正負號對齊；壞掉或沒有的數字（例如換模型後沒有可信度）顯示「—」，不讓整個面板出錯停住
const fmt = v => (Number.isFinite(v) ? (v >= 0 ? ' ' : '') + v.toFixed(3) : '—');
const fmtVis = v => (Number.isFinite(v) ? v.toFixed(2) : '—');

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
        const values = p ? [fmt(p.x), fmt(p.y), fmt(p.z), fmtVis(p.visibility)] : ['—', '—', '—', '—'];
        tds.forEach((td, k) => { td.textContent = values[k]; });
        // 看不到的點（模型猜的）顯示成淡色，提醒這筆數字不可靠
        tr.classList.toggle('unseen', !p || !isVisible(p));
    });
}

// 動作判斷用的資訊：拍攝方向、面向、有方向的角度、太短不算角度的肢體
// 這些之後做動作判斷（例如深蹲）時會用到，先放在數據面板上，方便實際測試時確認判斷對不對
const VIEW_NOTES = { side: '角度最準', oblique: '角度誤差約 10°', front: '膝、髖角度不準，請側身拍' };
const SEGMENT_NAMES = { thigh: '大腿', shank: '小腿', upperArm: '上臂', forearm: '前臂' };

// el：顯示的元素；pose：main.js 的 lastPose（平滑後的點、角度、拍攝方向），沒有人時為 null
// mirrored：畫面是否鏡像（前鏡頭）。面向是用鏡頭原始畫面判斷的，鏡像時左右要對調，才和使用者看到的一樣
export function updateViewInfo(el, pose, mirrored, width, height) {
    const lines = [];
    const view = pose && pose.view;
    if (!view || !view.view) {
        lines.push('拍攝方向：—（要看得到雙肩和雙髖）');
    } else {
        let text = '拍攝方向：' + VIEW_NAMES[view.view] + '（' + VIEW_NOTES[view.view] + '）· 比值 ' + view.ratio.toFixed(2);
        if (view.facing) text += ' · 面向畫面' + ((view.facing > 0) !== mirrored ? '右' : '左') + '邊';
        lines.push(text);
        if (view.facing) {
            const parts = ANGLES.filter(([key]) => /_(KNEE|HIP)$/.test(key)).map(([key, name]) => {
                const a = signedAngle(key, pose.angles, pose.landmarks, width, height, view.facing);
                return name + ' ' + (a === null ? '—' : Math.round(a) + '°');
            });
            lines.push('有方向的角度：' + parts.join(' · ') + '（超過 180° 是往後反折、後伸）');
        }
    }
    if (pose) {
        const short = [...shortSegments(pose.landmarks, width, height)]
            .map(name => (name.startsWith('LEFT') ? '左' : '右') + SEGMENT_NAMES[name.split('_')[1]]);
        if (short.length) lines.push('朝著鏡頭、太短不算角度：' + short.join('、'));
    }
    const text = lines.join('\n');
    if (el.textContent !== text) el.textContent = text;
}
