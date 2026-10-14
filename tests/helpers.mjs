// 測試共用：產生合成深蹲資料（js/data/synth.js），轉成 AI 輸出的格式
import { makeDemoRecording } from '../js/data/synth.js';
import { POSES } from '../js/ui/demo.js';
import { P } from '../js/skeleton/landmarks.js';

export { makeDemoRecording };

// 合成資料的每一格 → { t, raw: 33 點 { x, y, z, visibility } 或 null, world: 33 點 { x, y, z } 或 null }
export function demoFrames(options = {}) {
    return makeDemoRecording(options).frames.map(f => ({
        t: f.t,
        raw: f.landmarks && f.landmarks.map(([x, y, z, visibility]) => ({ x, y, z, visibility })),
        world: f.world && f.world.map(([x, y, z]) => ({ x, y, z }))
    }));
}

// 可重現的亂數（同一個 seed 每次一樣）
export function random(seed) {
    let s = seed;
    return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

// 相鄰兩格平均差多少（抖動大小）
export function meanStep(values) {
    let sum = 0, n = 0;
    for (let i = 1; i < values.length; i++) {
        if (Number.isFinite(values[i]) && Number.isFinite(values[i - 1])) {
            sum += Math.abs(values[i] - values[i - 1]);
            n++;
        }
    }
    return sum / n;
}

// 運動模式的測試用骨架：示範動畫（js/ui/demo.js）的側面火柴人做成 33 點（640×480 畫面的比例座標）
// 示範動畫的座標（寬 240、高 180）放進 640×480 的畫面；人面向右邊，靠鏡頭的是左側
const norm = ([x, y]) => ({ x: 0.1 + x / 240 * 0.8, y: 0.1 + y / 180 * 0.8 });

// 一格骨架：depth 0～1；front（弓箭步）前腳是左腳；rot：整個人轉幾度（模擬手機放歪），yaw：身體轉向鏡頭的比例（0 側面、1 正面）
export function demoLandmarks(id, depth, { yaw = 0 } = {}) {
    const pose = POSES[id](depth);
    const [first, second] = pose.lines;
    const pts = {};
    if (id === 'lunge') {
        const [shoulder, hip, kneeF, front, toeF] = first;
        const [, kneeB, back, toeB] = second;
        Object.assign(pts, { SHOULDER: shoulder, HIP: hip, L_KNEE: kneeF, L_ANKLE: front, L_TOE: toeF, R_KNEE: kneeB, R_ANKLE: back, R_TOE: toeB });
        const [, elbow, wrist] = pose.lines[2];
        Object.assign(pts, { ELBOW: elbow, WRIST: wrist });
    } else if (id === 'squat') {
        const [shoulder, hip, knee, ankle, toe] = first;
        const [, elbow, wrist] = second;
        Object.assign(pts, { SHOULDER: shoulder, HIP: hip, KNEE: knee, ANKLE: ankle, TOE: toe, ELBOW: elbow, WRIST: wrist });
    } else {
        // 伏地挺身、棒式：[腳尖, 腳踝, 膝, 髖, 肩]、[肩, 手肘, 手]
        const [toe, ankle, knee, hip, shoulder] = first;
        const [, elbow, wrist] = second;
        Object.assign(pts, { SHOULDER: shoulder, HIP: hip, KNEE: knee, ANKLE: ankle, TOE: toe, ELBOW: elbow, WRIST: wrist });
    }
    const lm = Array.from({ length: 33 }, () => ({ ...norm(pose.head), z: 0, visibility: 0.99 }));
    const set = (name, p, dx = 0, vis = 0.99) => { const n = norm(p); lm[P[name]] = { x: n.x + dx, y: n.y, z: 0, visibility: vis }; };
    // 身體轉向鏡頭：右側（遠的那側）往畫面左邊移，肩寬、髖寬變大
    const spread = yaw * 0.12;
    for (const side of ['LEFT', 'RIGHT']) {
        const dx = side === 'RIGHT' ? -spread : 0;
        const key = k => pts[(side === 'LEFT' ? 'L_' : 'R_') + k] || pts[k];
        set(side + '_SHOULDER', key('SHOULDER'), dx);
        set(side + '_HIP', key('HIP'), dx);
        set(side + '_KNEE', key('KNEE'), dx);
        set(side + '_ANKLE', key('ANKLE'), dx);
        set(side + '_ELBOW', key('ELBOW'), dx);
        set(side + '_WRIST', key('WRIST'), dx);
        const ankle = key('ANKLE'), toe = key('TOE');
        set(side + '_HEEL', [ankle[0] - 4, ankle[1] + 2], dx);
        set(side + '_FOOT_INDEX', toe, dx);
        for (const f of ['PINKY', 'INDEX', 'THUMB']) set(side + '_' + f, key('WRIST'), dx);
        set(side + '_EAR', [pose.head[0] - 4, pose.head[1]], dx);
        for (const e of ['EYE_INNER', 'EYE', 'EYE_OUTER']) set(side + '_' + e, [pose.head[0] + 3, pose.head[1] - 2], dx);
    }
    set('NOSE', [pose.head[0] + 7, pose.head[1] + 1]);
    return lm;
}
