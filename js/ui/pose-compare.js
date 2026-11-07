// 你這一下 vs 標準動作（11/12）：AI 評分最差的那一下，最低點的姿勢（你的骨架）和示範動畫最低點的姿勢（標準動作，js/ui/demo.js）並排畫
// 為什麼畫最低點：深蹲、伏地挺身、弓箭步的錯誤（上身前傾、腳跟離地、塌腰、屁股太高、膝超過腳尖）大多在最低點最明顯
// 你的骨架照示範動畫的大小、方向擺，兩邊才比得起來：
//   面向右邊（示範動畫的方向；拍的時候面向左邊就左右翻過來，看鼻子和耳朵、腳尖和腳跟，js/analysis/view.js）
//   大腿一樣長（示範動畫 42）、腳踝放在示範動畫腳踝的位置（弓箭步是前腳）
//   畫面的上下左右比例照鏡頭的像素（不是 0～1 的比例：畫面不是正方形）
// 棒式沒有「最低點」（一次撐很久）：不畫。首頁的運動總結、重播分析共用
import { POSES } from './demo.js';
import { P } from '../skeleton/landmarks.js';

const THIGH = 42;   // 示範動畫的大腿長（demo.js 的 L.thigh）
const ANCHOR = { squat: [104, 158], lunge: [150, 158], pushup: [44, 152] };   // 示範動畫腳踝（弓箭步是前腳）的位置
export const COMPARED = Object.keys(ANCHOR);
const MIN_VIS = 0.5;

// points：33 點 [{ x, y（0～1 的比例）, visibility }]；width、height：鏡頭畫面的像素；facing：1 面向右、-1 面向左、0 看不出來
// 回傳和示範動畫一樣的格式 { lines, joints, head }（座標：寬 240、高 180、面向右邊），點不夠時 null
export function userFigure(workoutId, points, width, height, facing) {
    if (!COMPARED.includes(workoutId) || !Array.isArray(points) || points.length < 33 || !(width > 0) || !(height > 0)) return null;
    const flip = facing === -1 ? -1 : 1;
    const seen = i => points[i] && Number.isFinite(points[i].x) && Number.isFinite(points[i].y) && (points[i].visibility === undefined || points[i].visibility >= MIN_VIS);
    const raw = i => [flip * points[i].x * width, points[i].y * height];
    // 看得比較清楚的那一側（側面拍時另一側常被擋住）
    const sideScore = side => ['SHOULDER', 'HIP', 'KNEE', 'ANKLE', 'ELBOW', 'WRIST'].filter(k => seen(P[side + '_' + k])).length;
    const side = sideScore('LEFT') >= sideScore('RIGHT') ? 'LEFT' : 'RIGHT';
    const other = side === 'LEFT' ? 'RIGHT' : 'LEFT';
    const id = (s, k) => P[s + '_' + k];
    const need = ['SHOULDER', 'HIP', 'KNEE', 'ANKLE'].map(k => id(side, k));
    if (!need.every(seen)) return null;
    const thigh = Math.hypot(raw(id(side, 'HIP'))[0] - raw(id(side, 'KNEE'))[0], raw(id(side, 'HIP'))[1] - raw(id(side, 'KNEE'))[1]);
    if (!(thigh > 1)) return null;
    const scale = THIGH / thigh;
    // 弓箭步：前腳（面向右邊之後 x 比較大的腳踝）放在示範動畫前腳的位置
    let anchorSide = side;
    if (workoutId === 'lunge' && seen(id(other, 'ANKLE')) && raw(id(other, 'ANKLE'))[0] > raw(id(side, 'ANKLE'))[0]) anchorSide = other;
    const a = raw(id(anchorSide, 'ANKLE')), target = ANCHOR[workoutId];
    const map = i => [target[0] + (raw(i)[0] - a[0]) * scale, target[1] + (raw(i)[1] - a[1]) * scale];
    const chain = keys => keys.map(([s, k]) => id(s, k)).filter(seen).map(map);
    const leg = s => chain([[s, 'HIP'], [s, 'KNEE'], [s, 'ANKLE'], [s, 'FOOT_INDEX']]);
    const lines = [chain([[side, 'SHOULDER'], [side, 'HIP']]).concat(leg(side).slice(1)), chain([[side, 'SHOULDER'], [side, 'ELBOW'], [side, 'WRIST']])];
    if (workoutId === 'lunge') lines.push(leg(other));
    const head = seen(P.NOSE) ? map(P.NOSE) : seen(id(side, 'EAR')) ? map(id(side, 'EAR')) : null;
    return { lines: lines.filter(l => l.length >= 2), joints: lines.flat(), head };
}

// 標準動作：示範動畫最低點
export const standardFigure = workoutId => (COMPARED.includes(workoutId) ? POSES[workoutId](1) : null);

const NS = 'http://www.w3.org/2000/svg';
const f = v => v.toFixed(1);
function el(parent, tag, attrs, text) {
    const e = document.createElementNS(NS, tag);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    if (text) e.textContent = text;
    parent.append(e);
    return e;
}
function figure(svg, pose, dx, cls) {
    const g = el(svg, 'g', { transform: 'translate(' + dx + ' 0)', class: cls });
    el(g, 'path', { class: 'demo-floor', d: 'M8 162H232' });
    el(g, 'path', { class: 'demo-bones', d: pose.lines.map(line => 'M' + line.map(p => f(p[0]) + ' ' + f(p[1])).join('L')).join('') });
    if (pose.head) el(g, 'circle', { class: 'demo-head', r: 9, cx: f(pose.head[0]), cy: f(pose.head[1]) });
    const joints = el(g, 'g', { class: 'demo-joints' });
    for (const p of pose.joints) el(joints, 'circle', { r: 3.5, cx: f(p[0]), cy: f(p[1]) });
}

// 畫在 box（<figure> 或 <div>）裡：一張 480×200 的圖（左邊你的、右邊標準的）＋下面一行說明；不能畫（棒式、點不夠）時清空、回傳 false
// label：「你（第 5 下）」；caption：圖下面的說明（例如 AI 解釋那一句）
export function renderCompare(box, workoutId, userPose, label, caption) {
    box.replaceChildren();
    const standard = standardFigure(workoutId);
    if (!userPose || !standard) return false;
    const svg = el(box, 'svg', { viewBox: '0 0 480 200', class: 'pose-compare-art', role: 'img',
        'aria-label': label + '最低點的姿勢（左）和標準動作（右）並排' });
    figure(svg, userPose, 0, 'pose-you');
    figure(svg, standard, 240, 'pose-standard');
    el(svg, 'text', { x: 120, y: 190, class: 'pose-compare-label' }, label);
    el(svg, 'text', { x: 360, y: 190, class: 'pose-compare-label' }, '標準動作');
    if (caption) {
        const p = document.createElement('p');
        p.className = 'pose-compare-note';
        p.textContent = caption;
        box.append(p);
    }
    return true;
}
