// 在畫面上標出關鍵點的編號與名稱
// 用網頁文字（不是畫在畫布上），字會跟按鈕一樣清楚；標籤重疊時自動上下錯開

import { LANDMARKS, isMainJoint } from './landmarks.js';

const CENTER_NAMES = { SHOULDER_CENTER: '肩膀中心', HIP_CENTER: '髖部中心' };

// 每個標籤只建立一次，之後每個畫面只更新位置
const pool = new Map();

function getLabel(container, key, number, name, variant) {
    let el = pool.get(key);
    if (!el) {
        el = document.createElement('div');
        el.className = 'joint-label ' + variant;
        if (number !== null) {
            const num = document.createElement('span');
            num.className = 'num';
            num.textContent = number;
            el.appendChild(num);
        }
        el.appendChild(document.createTextNode(name));
        container.appendChild(el);
        el.size = null;
        pool.set(key, el);
    }
    return el;
}

// 影像以 object-fit: contain 顯示時，畫面實際所在的位置與大小
export function videoRect(viewW, viewH, videoW, videoH) {
    const scale = Math.min(viewW / videoW, viewH / videoH);
    const w = videoW * scale;
    const h = videoH * scale;
    return { left: (viewW - w) / 2, top: (viewH - h) / 2, width: w, height: h };
}

// 關鍵點在螢幕上的位置（已考慮鏡像）
export function toScreen(point, rect, mirrored) {
    return {
        x: rect.left + (mirrored ? 1 - point.x : point.x) * rect.width,
        y: rect.top + point.y * rect.height
    };
}

// 更新所有標籤
// showAll：是否顯示主要關節與中心點；pickedId：使用者點選的點（編號或 'SHOULDER_CENTER' 等），沒有則為 null
export function updateLabels(container, landmarks, derived, rect, mirrored, showAll, pickedId) {
    const wanted = [];
    const add = (key, point, number, name, variant, outward) => wanted.push({ key, point, number, name, variant, outward });
    if (showAll) {
        LANDMARKS.forEach(([code, name], id) => {
            if (isMainJoint(id)) add(id, landmarks[id], id, name, 'joint', code.includes('RIGHT') ? -1 : 1);
        });
        add('SHOULDER_CENTER', derived.SHOULDER_CENTER, null, CENTER_NAMES.SHOULDER_CENTER, 'center', 0);
        add('HIP_CENTER', derived.HIP_CENTER, null, CENTER_NAMES.HIP_CENTER, 'center', 0);
    }
    if (pickedId !== null) {
        const center = CENTER_NAMES[pickedId];
        const point = center ? derived[pickedId] : landmarks[pickedId];
        const name = center || LANDMARKS[pickedId][1];
        add('picked', point, center ? null : pickedId, name, 'picked', 0);
    }

    const placed = [];
    const used = new Set();
    for (const item of wanted) {
        const el = getLabel(container, item.key, item.number, item.name, item.variant);
        if (item.key === 'picked') {
            // 點選的標籤內容每次可能不同，重新填入
            el.replaceChildren();
            if (item.number !== null) {
                const num = document.createElement('span');
                num.className = 'num';
                num.textContent = item.number;
                el.appendChild(num);
            }
            el.appendChild(document.createTextNode(item.name));
            el.size = null;
        }
        used.add(item.key);
        el.hidden = false;
        if (!el.size) el.size = { w: el.offsetWidth, h: el.offsetHeight };
        const { w, h } = el.size;
        const p = toScreen(item.point, rect, mirrored);
        // 被拍攝者左側的點標在一側、右側的點標在另一側；中心點與點選的標籤放在點的正下方
        const dir = (mirrored ? -1 : 1) * item.outward;
        let x = dir > 0 ? p.x + 10 : dir < 0 ? p.x - 10 - w : p.x - w / 2;
        // 先把標籤移回畫面內，再檢查有沒有和其他標籤重疊
        x = Math.min(Math.max(x, 4), rect.left * 2 + rect.width - w - 4);
        let y = dir === 0 ? p.y + 10 : p.y - h / 2;
        // 和已放好的標籤重疊時，依序嘗試往上、往下錯開
        const baseY = y;
        for (const shift of [0, -1, 1, -2, 2, -3, 3]) {
            y = baseY + shift * (h + 2);
            if (!placed.some(r => x < r.x + r.w && x + w > r.x && y < r.y + r.h && y + h > r.y)) break;
        }
        placed.push({ x, y, w, h });
        el.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
    }
    pool.forEach((el, key) => {
        if (!used.has(key)) el.hidden = true;
    });
}

export function hideLabels() {
    pool.forEach(el => { el.hidden = true; });
}

// 找出最接近點選位置的關鍵點（33 點與中心點），距離超過 maxDist 則回傳 null
export function nearestPoint(x, y, landmarks, derived, rect, mirrored, maxDist) {
    let best = null;
    let bestDist = maxDist;
    const check = (id, point) => {
        const p = toScreen(point, rect, mirrored);
        const d = Math.hypot(p.x - x, p.y - y);
        if (d < bestDist) {
            bestDist = d;
            best = id;
        }
    };
    landmarks.forEach((point, id) => check(id, point));
    check('SHOULDER_CENTER', derived.SHOULDER_CENTER);
    check('HIP_CENTER', derived.HIP_CENTER);
    return best;
}
