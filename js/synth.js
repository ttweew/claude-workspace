// 合成示範資料：用 3D 火柴人做出一段深蹲，格式和「數據」面板錄下來的 JSON 一樣
// 用途：還沒有真人錄影前，先用來試用重播工具、測試動作判斷；檔案裡會標明是合成資料
// 身體比例取自 MediaPipe 在真人正面全身照片上的輸出（軀幹長 = 1）

import { LANDMARKS } from './landmarks.js';

const PROP = { shoulderW: 0.64, hipW: 0.38, thigh: 0.8, shank: 0.8, upperArm: 0.55, forearm: 0.5, ankleH: 0.13, heel: 0.1, toe: 0.3 };
const rad = d => d * Math.PI / 180;

// 一個姿勢的 3D 座標（前 = +x、上 = +y、人的左邊 = +z；單位：軀幹長）
// knee：膝蓋角度（180 = 站直）；lean：軀幹前傾；shankLean：小腿前傾；armFwd：手臂往前抬
function bodyPoints({ knee, lean, shankLean, armFwd }) {
    const flex = 180 - knee;
    const ankle = [0, PROP.ankleH];
    const kneeP = [Math.sin(rad(shankLean)) * PROP.shank, ankle[1] + Math.cos(rad(shankLean)) * PROP.shank];
    const thighDir = rad(shankLean - flex);
    const hip = [kneeP[0] + Math.sin(thighDir) * PROP.thigh, kneeP[1] + Math.cos(thighDir) * PROP.thigh];
    const up = [Math.sin(rad(lean)), Math.cos(rad(lean))];         // 軀幹方向
    const fwd = [Math.cos(rad(lean)), -Math.sin(rad(lean))];       // 和軀幹垂直、往前
    const sh = [hip[0] + up[0], hip[1] + up[1]];
    const head = [sh[0] + up[0] * 0.38, sh[1] + up[1] * 0.38];
    const arm = [Math.sin(rad(armFwd)), -Math.cos(rad(armFwd))];
    const elbow = [sh[0] + arm[0] * PROP.upperArm, sh[1] + arm[1] * PROP.upperArm];
    const wrist = [elbow[0] + arm[0] * PROP.forearm, elbow[1] + arm[1] * PROP.forearm];
    const hand = [wrist[0] + arm[0] * 0.12, wrist[1] + arm[1] * 0.12];
    const at = (p, f, u) => [p[0] + fwd[0] * f + up[0] * u, p[1] + fwd[1] * f + up[1] * u];
    const P = {};
    const put = (key, p, z) => { P[key] = [p[0], p[1], z]; };
    put('NOSE', at(head, 0.13, -0.02), 0);
    for (const [s, k] of [[1, 'LEFT'], [-1, 'RIGHT']]) {
        put(k + '_EYE_INNER', at(head, 0.1, 0.03), s * 0.02);
        put(k + '_EYE', at(head, 0.1, 0.03), s * 0.04);
        put(k + '_EYE_OUTER', at(head, 0.09, 0.03), s * 0.06);
        put(k + '_EAR', at(head, -0.02, 0), s * 0.09);
        put('MOUTH_' + k, at(head, 0.11, -0.07), s * 0.03);
        put(k + '_SHOULDER', sh, s * PROP.shoulderW / 2);
        put(k + '_ELBOW', elbow, s * PROP.shoulderW / 2);
        put(k + '_WRIST', wrist, s * PROP.shoulderW / 2);
        put(k + '_PINKY', hand, s * (PROP.shoulderW / 2 + 0.03));
        put(k + '_INDEX', hand, s * (PROP.shoulderW / 2 - 0.02));
        put(k + '_THUMB', [hand[0] + 0.03, hand[1] + 0.04], s * (PROP.shoulderW / 2 - 0.04));
        put(k + '_HIP', hip, s * PROP.hipW / 2);
        put(k + '_KNEE', kneeP, s * (PROP.hipW / 2 + 0.03));
        put(k + '_ANKLE', ankle, s * (PROP.hipW / 2 + 0.03));
        put(k + '_HEEL', [-PROP.heel, 0.03], s * (PROP.hipW / 2 + 0.03));
        put(k + '_FOOT_INDEX', [PROP.toe, 0.02], s * (PROP.hipW / 2 + 0.07));
    }
    return P;
}

// 可重現的亂數（同一個 seed 每次產生一樣的資料）
function random(seed) {
    let s = seed;
    const next = () => (s = (s * 16807) % 2147483647) / 2147483647;
    // 常態分布（Box-Muller）
    return () => Math.sqrt(-2 * Math.log(next() + 1e-12)) * Math.cos(2 * Math.PI * next());
}

// 深蹲的膝蓋角度變化：先站 lead 秒，每一下：下 tempo.down 秒、底部停 tempo.bottom 秒、上 tempo.up 秒、站 tempo.rest 秒
// depths：每一下蹲到的膝蓋角度
export const DEMO_DEPTHS = [95, 85, 125, 80, 92];
const DEFAULT_TEMPO = { down: 1, bottom: 0.2, up: 1, rest: 0.2 };
function kneeAt(t, depths, tempo, lead) {
    const period = tempo.down + tempo.bottom + tempo.up + tempo.rest;
    const i = Math.floor((t - lead) / period);
    if (t < lead || i >= depths.length) return 178;
    const u = t - lead - i * period;
    const depth = depths[i];
    const ease = x => 0.5 - 0.5 * Math.cos(Math.PI * Math.max(0, Math.min(1, x)));
    if (u < tempo.down) return 178 - (178 - depth) * ease(u / tempo.down);
    if (u < tempo.down + tempo.bottom) return depth;
    if (u < tempo.down + tempo.bottom + tempo.up) return depth + (178 - depth) * ease((u - tempo.down - tempo.bottom) / tempo.up);
    return 178;
}

// 產生一段合成深蹲錄製資料
// yaw：拍攝角度（0 = 正側面、人面向畫面右邊；90 = 正面；180 = 側面、面向左邊）；depths：每一下的膝蓋角度
// tempo：每一下的節奏（秒）；lead：開始前先站幾秒；gaps：[[開始秒, 結束秒]] 這段時間沒偵測到人（測試用）
export function makeDemoRecording({ yaw = 8, depths = DEMO_DEPTHS, tempo = DEFAULT_TEMPO, lead = 1.5, gaps = [],
                                    fps = 30, width = 640, height = 480, noisePx = 1.5, seed = 7, worldNoise = 0.03 } = {}) {
    const gauss = random(seed);
    // 公尺座標的雜訊另外用一組亂數，畫面座標才會和以前產生的完全一樣
    // 模仿真實的單鏡頭深度：左右上下雜訊小（0.5 公分），前後深度雜訊大（worldNoise 公尺），各點還會慢慢前後飄
    const wGauss = random(seed + 1000);
    const drift = LANDMARKS.map((_, j) => [0.5 + (j % 5) * 0.17, j * 1.3]);
    const period = tempo.down + tempo.bottom + tempo.up + tempo.rest;
    const seconds = lead + depths.length * period + 1;
    const scale = height * 0.21;  // 軀幹在畫面上的長度（像素），全身大約佔畫面高度 7 成
    const cx = width * 0.45, groundY = height * 0.93;
    const c = Math.cos(rad(yaw)), s = Math.sin(rad(yaw));
    const frames = [];
    for (let k = 0; k * 1000 / fps <= seconds * 1000; k++) {
        const t = k / fps;
        if (gaps.some(([a, b]) => t >= a && t < b)) {
            frames.push({ t: Math.round(t * 1000), landmarks: null, world: null });
            continue;
        }
        const knee = kneeAt(t, depths, tempo, lead);
        const flex = 180 - knee;
        const P = bodyPoints({ knee, lean: flex * 0.4, shankLean: flex * 0.42, armFwd: Math.min(90, flex * 0.9) });
        const hipZ = 0;
        const landmarks = [], world = [];
        for (const [key] of LANDMARKS) {
            const [x, y, z] = P[key];
            // 繞垂直軸轉 yaw。人面向畫面右邊時，靠近鏡頭的是右半身（z 是左邊，所以右邊是 -z）
            const X = x * c + z * s;       // 畫面上的左右
            const depth = x * s - z * c;   // 越大越靠近鏡頭
            // 側面拍時遠離鏡頭那一側的點比較不清楚
            const vis = Math.min(0.999, (depth < -0.05 ? 0.86 : 0.98) + 0.01 * gauss());
            landmarks.push([
                round((cx + X * scale + gauss() * noisePx) / width, 5),
                round((groundY - y * scale + gauss() * noisePx) / height, 5),
                round(-(depth - hipZ) * scale / width, 5),
                round(vis, 3)
            ]);
            const j = world.length;
            const zNoise = worldNoise * (wGauss() + 0.8 * Math.sin(drift[j][0] * t + drift[j][1]));
            world.push([round(X * 0.5 + 0.005 * wGauss(), 4), round(-(y - 1.2) * 0.5 + 0.005 * wGauss(), 4), round(-depth * 0.5 + zNoise, 4)]);
        }
        frames.push({ t: Math.round(t * 1000), landmarks, world });
    }
    return {
        format: 'ai-sport-pose',
        version: 1,
        meta: {
            app: 'AI 智慧運動分析系統',
            model: 'synthetic',
            synthetic: true,
            description: '合成示範資料（不是真人）：' + depths.length + ' 下深蹲，拍攝角度 ' + yaw + '°（0° = 正側面、90° = 正面），每下最低膝蓋角度 ' + depths.join('、') + '°；大腿、小腿實際長度 40 公分，公尺座標的前後深度加了模擬的雜訊',
            computeMode: '—',
            videoWidth: width,
            videoHeight: height,
            displayMirrored: false,
            startedAt: '2026-10-01T00:00:00.000Z'
        },
        landmarkNames: LANDMARKS.map(([key]) => key),
        fields: { landmarks: ['x', 'y', 'z', 'visibility'], world: ['x', 'y', 'z'] },
        frames: frames
    };
}

function round(v, digits) {
    return Number(v.toFixed(digits));
}
