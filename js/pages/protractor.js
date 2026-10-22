// 照片量角器（protractor.html，10/22）：選一張照片 → AI 找關節 → 把三個圈拖到關節中心 → 比對兩個角度 → 記下來（驗證實驗 A）
// 計算在 js/analysis/protractor.js；AI 和鏡頭畫面用同一個（js/ai/pose.js），角度用同一套算法（js/skeleton/pipeline.js），
// 所以「AI 算的」就是鏡頭對著這個姿勢時網站會算出來的角度

import { loadPoseModel } from '../ai/pose.js';
import { PosePipeline } from '../skeleton/pipeline.js';
import { JOINTS, isJoint, jointOf, pointAngle, aiPoints, startPoints, defaultJoint, photoSnapshot } from '../analysis/protractor.js';
import { addSnapshot } from '../analysis/validate.js';
import { setupOffline } from '../platform/offline.js';

const $ = id => document.getElementById(id);
const photoInput = $('photoInput'), drop = $('drop'), photoStatus = $('photoStatus');
const measureCard = $('measureCard'), jointPick = $('jointPick'), stage = $('photoStage'), canvas = $('photo'), lines = $('lines');
const handles = [...stage.querySelectorAll('.handle')];
const mineOut = $('mine'), aiOut = $('ai'), diffOut = $('diff'), saveBtn = $('saveBtn'), resetBtn = $('resetBtn'), saveStatus = $('saveStatus');

const MAX_BYTES = 30 * 1024 * 1024;   // 手機照片一張約 2～8 MB；再大多半不是照片，整張讀進來手機會很慢
const MAX_SIDE = 1280;                // 照片縮到長邊 1280 像素：手機照片 4000 像素，AI 本來就會縮小再看，大的只是慢；縮放不影響角度
const DETECT_TIMES = 3;               // 同一張照片給 AI 看 3 次：AI 是看影片的模式，第一次先找到人，後面幾次關節的位置比較準
const NAMES = { HIP: '髖', KNEE: '膝', ANKLE: '踝', SHOULDER: '肩', ELBOW: '肘', WRIST: '腕' };
const pointName = id => NAMES[id.replace(/^(LEFT|RIGHT)_/, '')] || id;

let detectorPromise = null;
let ts = 0;            // 給 AI 的時間要一直往後（看影片的模式），換照片也一樣；也要比暖機時晚（暖機用的是現在的時間，見 js/ai/pose.js）
let busy = false;
let photo = null;      // { width, height, pose（pipeline 的結果；AI 找不到人或用不了是 null） }
let joint = null;      // 量哪個關節（JOINTS 的 key）
let points = null;     // 三個圈的位置（照片上的像素）

function setStatus(el, text, error = false) {
    el.textContent = text;
    el.classList.toggle('error', error);
}

// ---------- AI（第一次選照片才下載，之後重用） ----------
function getDetector() {
    if (!detectorPromise) {
        detectorPromise = loadPoseModel(p => {
            if (p.stage === 'download') setStatus(photoStatus, '下載 AI 中（第一次用才要下載）… ' + Math.round(p.fraction * 100) + '%');
            else setStatus(photoStatus, 'AI 準備中…');
        });
        // 失敗了（沒網路、下載卡住）：下一張照片再試一次
        detectorPromise.catch(() => { detectorPromise = null; });
    }
    return detectorPromise;
}

// ---------- 選照片 ----------
async function loadPhoto(file) {
    if (busy || !file) return;
    busy = true;
    photoInput.disabled = true;
    setStatus(saveStatus, '');
    try {
        if (!/^image\//.test(file.type) && !/\.(jpe?g|png|webp|gif|bmp)$/i.test(file.name)) throw new Error('這不是照片：請選 JPG 或 PNG');
        if (file.size > MAX_BYTES) throw new Error('照片太大（超過 30 MB），請換一張');
        let bitmap;
        try {
            bitmap = await createImageBitmap(file);
        } catch (err) {
            throw new Error('讀不了這張照片（格式不支援或檔案壞了）；iPhone 的 HEIC 照片請改用截圖，或在相簿分享時選 JPG');
        }
        const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
        const width = Math.max(1, Math.round(bitmap.width * scale)), height = Math.max(1, Math.round(bitmap.height * scale));
        canvas.width = width;
        canvas.height = height;
        canvas.getContext('2d').drawImage(bitmap, 0, 0, width, height);
        if (bitmap.close) bitmap.close();
        photo = { width, height, pose: null };
        lines.setAttribute('viewBox', '0 0 ' + width + ' ' + height);
        // AI 還在找的時候先收起來：圈還沒放好，按「記下」會記到上一張照片的位置（以前會出錯）
        points = null;
        measureCard.hidden = true;
        setStatus(photoStatus, 'AI 找關節中…');
        let message;
        try {
            const detector = await getDetector();
            const pipeline = new PosePipeline();
            let pose = null;
            for (let i = 0; i < DETECT_TIMES; i++) {
                // 以前從 100 開始：在主畫面跑 AI（?worker=0）時比暖機的時間早，AI 直接出錯（背景執行緒會自己調，沒發現）
                ts = Math.max(ts + 100, performance.now());
                const r = await detector.detect(canvas, ts);
                pose = r && r.landmarks ? pipeline.process(r.landmarks, ts, width, height) : null;
            }
            photo.pose = pose;
            message = pose ? 'AI 找到人了：圈先放在 AI 找到的位置，請照你看到的拖到關節中心'
                : 'AI 在這張照片裡找不到人：還是可以自己把三個圈拖到關節上，「AI 算的」會空著';
        } catch (err) {
            message = 'AI 用不了（' + err.message + '）：還是可以自己把三個圈拖到關節上，「AI 算的」會空著';
        }
        pickJoint(defaultJoint(photo.pose ? photo.pose.landmarks : null));
        measureCard.hidden = false;
        setStatus(photoStatus, message, !photo.pose);
    } catch (err) {
        setStatus(photoStatus, err.message, true);
    } finally {
        busy = false;
        photoInput.disabled = false;
    }
}

photoInput.addEventListener('change', () => {
    const file = photoInput.files[0];
    photoInput.value = '';
    loadPhoto(file);
});
drop.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('over'); });
drop.addEventListener('dragleave', () => drop.classList.remove('over'));
drop.addEventListener('drop', e => {
    e.preventDefault();
    drop.classList.remove('over');
    loadPhoto(e.dataTransfer.files[0]);
});

// ---------- 量哪個關節 ----------
for (const j of JOINTS) {
    const label = document.createElement('label');
    const input = document.createElement('input');
    input.type = 'radio';
    input.name = 'joint';
    input.value = j.key;
    input.addEventListener('change', () => { if (input.checked && isJoint(input.value)) pickJoint(input.value); });
    label.append(input, j.name);
    jointPick.append(label);
}

// 換關節：圈放回 AI 找到的這個關節的三個點（找不到就放照片中間）
function pickJoint(key) {
    joint = key;
    for (const input of jointPick.querySelectorAll('input')) input.checked = input.value === key;
    placeAtAi();
}

function placeAtAi() {
    if (!photo) return;
    const ai = photo.pose ? aiPoints(photo.pose.landmarks, joint, photo.width, photo.height) : null;
    points = ai || startPoints(photo.width, photo.height);
    resetBtn.hidden = !ai;
    const names = jointOf(joint).ids.map(pointName);
    handles.forEach((h, i) => h.setAttribute('aria-label', names[i] + '（第 ' + (i + 1) + ' 個點，' + names.join('→') + '）：拖曳或用方向鍵移動'));
    draw();
}
resetBtn.addEventListener('click', placeAtAi);

// ---------- 畫圈、連線、角度 ----------
function draw() {
    const { width, height } = photo;
    handles.forEach((h, i) => {
        h.style.left = (points[i].x / width * 100) + '%';
        h.style.top = (points[i].y / height * 100) + '%';
    });
    const line = (a, b) => '<line x1="' + a.x + '" y1="' + a.y + '" x2="' + b.x + '" y2="' + b.y + '"/>';
    // AI 找到的點畫成虛線小圈，拖走之後還看得到 AI 原本找在哪裡
    const ai = photo.pose ? aiPoints(photo.pose.landmarks, joint, width, height) : null;
    const r = Math.max(width, height) / 120;
    lines.innerHTML = line(points[0], points[1]) + line(points[1], points[2])
        + (ai ? ai.map(p => '<circle cx="' + p.x + '" cy="' + p.y + '" r="' + r + '"/>').join('') : '');
    const mine = pointAngle(...points);
    const site = photo.pose ? photo.pose.angles[joint] : null;
    const has = v => v !== null && v !== undefined && Number.isFinite(v);
    mineOut.textContent = has(mine) ? mine.toFixed(1) + '°' : '—';
    aiOut.textContent = has(site) ? site.toFixed(1) + '°' : '—';
    // 差距和使用說明頁的表格一樣：兩邊都先取到小數第 1 位再相減
    const d = has(mine) && has(site) ? Math.round((Math.round(site * 10) - Math.round(mine * 10))) / 10 : null;
    diffOut.textContent = d === null ? '—' : (d > 0 ? '+' : '') + d.toFixed(1) + '°';
    saveBtn.disabled = !has(mine);
}

// 拖曳：滑鼠、手指都用 pointer 事件；位置換算回照片上的像素，不超出照片
function toPhoto(e) {
    const rect = stage.getBoundingClientRect();
    const clamp = (v, max) => Math.min(max, Math.max(0, v));
    return { x: clamp((e.clientX - rect.left) / rect.width * photo.width, photo.width), y: clamp((e.clientY - rect.top) / rect.height * photo.height, photo.height) };
}
handles.forEach((h, i) => {
    h.addEventListener('pointerdown', e => {
        e.preventDefault();
        h.setPointerCapture(e.pointerId);
        h.focus();
    });
    h.addEventListener('pointermove', e => {
        if (!h.hasPointerCapture(e.pointerId)) return;
        points[i] = toPhoto(e);
        draw();
    });
    // 方向鍵：一次移 1 像素（照片上的），按住 Shift 一次 10 像素
    h.addEventListener('keydown', e => {
        const step = e.shiftKey ? 10 : 1;
        const move = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
        if (!move) return;
        e.preventDefault();
        points[i] = { x: Math.min(photo.width, Math.max(0, points[i].x + move[0])), y: Math.min(photo.height, Math.max(0, points[i].y + move[1])) };
        draw();
    });
});

// ---------- 記下來（驗證實驗 A 的清單，存在這台裝置上） ----------
saveBtn.addEventListener('click', () => {
    const mine = points ? pointAngle(...points) : null;
    if (mine === null) return;
    const pose = photo.pose;
    const n = addSnapshot(photoSnapshot(pose ? pose.angles : null, pose && pose.view ? pose.view.view : null, joint, mine));
    setStatus(saveStatus, '已記下第 ' + n + ' 筆（' + jointOf(joint).name + ' ' + mine.toFixed(1) + '°）。到使用說明「驗證實驗」看全部的統計、下載 CSV');
});

setupOffline();
