// 四個動作的示範動畫（老師 10/12 回饋：使用者腦中不一定有標準姿勢，先看一次再跟著做）
// 側面火柴人（和網站建議的拍攝方向一樣），重要的角度數字跟著動作變化
// 首頁「支援的運動」卡片（js/pages/exercise-demos.js）和鏡頭畫面的「示範」視窗（main.js）共用
// 計算次數、計時的門檻在 js/analysis/workouts.js

// 重點字：動作教學的內容，組員 10/12 確認過（要改的話改這裡就好，首頁和鏡頭畫面都會跟著改）
export const EXERCISES = [
    { id: 'squat', name: '深蹲', metric: '膝蓋角度', cues: ['膝蓋彎到 90° 以下才算蹲到位', '背部打直'] },
    { id: 'pushup', name: '伏地挺身', metric: '手肘角度', cues: ['手肘彎到約 90°', '肩、髖、腳踝保持一直線'] },
    { id: 'plank', name: '棒式', metric: '撐住的秒數', cues: ['肩、髖、腳踝一直線', '腰不要塌、屁股不要翹'] },
    { id: 'lunge', name: '弓箭步', metric: '前腳膝蓋角度', cues: ['前腳、後腳的膝蓋都彎到約 90°', '上身保持直立'] }
];

// ---------- 姿勢（座標：寬 240、高 180，地面在 y = 162，人面向右邊） ----------
const FLOOR = 162;
const L = { thigh: 42, shank: 43, torso: 46, head: 17, upper: 30, fore: 28 };
const rad = d => d * Math.PI / 180;
const lerp = (a, b, t) => a + (b - a) * t;
const add = (p, len, deg) => [p[0] + len * Math.sin(rad(deg)), p[1] - len * Math.cos(rad(deg))];  // deg：0 朝上、90 朝前（右）

// 兩節骨頭（大腿＋小腿、上臂＋前臂）：已知兩端，求中間的關節；front：關節往前（右）凸還是往後凸
function joint(a, c, l1, l2, front) {
    const d = Math.min(Math.hypot(c[0] - a[0], c[1] - a[1]), l1 + l2 - 0.01);
    const t = Math.atan2(c[1] - a[1], c[0] - a[0]);
    const k = Math.acos(Math.max(-1, Math.min(1, (l1 * l1 + d * d - l2 * l2) / (2 * l1 * d))));
    const p = [a[0] + l1 * Math.cos(t + k), a[1] + l1 * Math.sin(t + k)];
    const q = [a[0] + l1 * Math.cos(t - k), a[1] + l1 * Math.sin(t - k)];
    return (p[0] > q[0]) === front ? p : q;
}

// 三點夾角（度），和網站算關節角度的方式相同
export function angleAt(a, b, c) {
    const v1 = [a[0] - b[0], a[1] - b[1]], v2 = [c[0] - b[0], c[1] - b[1]];
    const cos = (v1[0] * v2[0] + v1[1] * v2[1]) / (Math.hypot(...v1) * Math.hypot(...v2));
    return Math.acos(Math.max(-1, Math.min(1, cos))) * 180 / Math.PI;
}

// 每個動作：depth 0 = 起始姿勢、1 = 最低點；回傳要畫的線、關節、頭、要顯示角度的關節
// lines：每一條是連在一起的點
export const POSES = {
    squat(d) {
        const ankle = [104, FLOOR - 4];
        const knee = add(ankle, L.shank, lerp(4, 24, d));
        const kneeAngle = lerp(168, 85, d);   // 蹲到 85°：90° 以下才算蹲到位
        const a = Math.atan2(ankle[1] - knee[1], ankle[0] - knee[0]) + rad(kneeAngle);
        const hip = [knee[0] + L.thigh * Math.cos(a), knee[1] + L.thigh * Math.sin(a)];
        const lean = lerp(6, 30, d);
        const shoulder = add(hip, L.torso, lean), head = add(hip, L.torso + L.head, lean);
        const elbow = add(shoulder, L.upper, lerp(150, 95, d)), wrist = add(elbow, L.fore, lerp(140, 92, d));
        return {
            lines: [[shoulder, hip, knee, ankle, [ankle[0] + 16, ankle[1]]], [shoulder, elbow, wrist]],
            joints: [shoulder, hip, knee, ankle, elbow, wrist], head,
            angle: { at: knee, from: hip, to: ankle }
        };
    },
    lunge(d) {
        const front = [150, FLOOR - 4], back = [60, FLOOR - 14], backToe = [50, FLOOR - 2];
        const hip = [lerp(104, 108, d), lerp(88, 113, d)];
        const kneeF = joint(hip, front, L.thigh, L.shank, true), kneeB = joint(hip, back, L.thigh, L.shank, true);
        const shoulder = add(hip, L.torso, 2), head = add(hip, L.torso + L.head, 2);
        // 雙手扠腰：手肘在身體後面，手放在髖部（不會和上身、大腿疊在一起）
        const wrist = [hip[0] + 3, hip[1] - 6], elbow = joint(shoulder, wrist, L.upper, L.fore, false);
        return {
            lines: [[shoulder, hip, kneeF, front, [front[0] + 16, front[1]]], [hip, kneeB, back, backToe], [shoulder, elbow, wrist]],
            joints: [shoulder, hip, kneeF, front, kneeB, back, elbow, wrist], head,
            angle: { at: kneeF, from: hip, to: front }
        };
    },
    pushup(d) {
        // 腳尖撐地、身體一直線，繞著腳踝轉；手掌固定在地上
        const toe = [38, FLOOR - 2], ankle = [44, FLOOR - 10], hand = [170, FLOOR - 4];
        const tilt = lerp(23, 15.4, d);   // 身體和地面的夾角（度）：手肘約 164° → 89°
        const along = len => [ankle[0] + len * Math.cos(rad(tilt)), ankle[1] - len * Math.sin(rad(tilt))];
        const knee = along(L.shank), hip = along(L.shank + L.thigh), shoulder = along(L.shank + L.thigh + L.torso);
        const head = along(L.shank + L.thigh + L.torso + L.head);
        const elbow = joint(shoulder, hand, L.upper, L.fore, false);
        return {
            lines: [[toe, ankle, knee, hip, shoulder], [shoulder, elbow, hand]],
            joints: [ankle, knee, hip, shoulder, elbow, hand], head,
            angle: { at: elbow, from: shoulder, to: hand }
        };
    },
    plank() {
        // 前臂撐地：手肘在肩膀正下方，肩、髖、腳踝一直線
        const elbow = [160, FLOOR - 4], wrist = [190, FLOOR - 4], shoulder = [160, FLOOR - 34];
        const ankle = [30, FLOOR - 10], toe = [24, FLOOR - 2];
        const tilt = Math.atan2(ankle[1] - shoulder[1], shoulder[0] - ankle[0]);
        const along = len => [ankle[0] + len * Math.cos(tilt), ankle[1] - len * Math.sin(tilt)];
        const knee = along(L.shank), hip = along(L.shank + L.thigh);
        const head = [shoulder[0] + L.head * Math.cos(tilt), shoulder[1] - L.head * Math.sin(tilt)];
        return {
            lines: [[toe, ankle, knee, hip, shoulder], [shoulder, elbow, wrist]],
            joints: [ankle, knee, hip, shoulder, elbow, wrist], head
        };
    }
};

// 一下的節奏（秒）：往下、最低點停一下、往上、起始姿勢停一下；棒式撐 30 秒再從 0 開始
const DOWN = 1.3, HOLD_BOTTOM = 0.4, UP = 1.3, HOLD_TOP = 0.6;
const PERIOD = DOWN + HOLD_BOTTOM + UP + HOLD_TOP;
const PLANK_SECONDS = 30;
const ease = t => t * t * (3 - 2 * t);
function depthAt(t) {
    t %= PERIOD;
    if (t < DOWN) return ease(t / DOWN);
    t -= DOWN;
    if (t < HOLD_BOTTOM) return 1;
    t -= HOLD_BOTTOM;
    if (t < UP) return 1 - ease(t / UP);
    return 0;
}

// ---------- 畫圖 ----------
const NS = 'http://www.w3.org/2000/svg';
const f = v => v.toFixed(1);
function el(parent, tag, attrs) {
    const e = document.createElementNS(NS, tag);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    parent.append(e);
    return e;
}

// 一個示範動畫：svg 是空的 <svg viewBox="0 0 240 180">；setExercise 換動作、start／stop 播放
// 看不到時不畫（呼叫的地方負責 start／stop）；系統設定「減少動態效果」時停在最低點（棒式停在撐住的樣子）
export class DemoFigure {
    constructor(svg, id) {
        this.svg = svg;
        this.frame = null;
        this.startTime = null;
        this.reduceMotion = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
        el(svg, 'path', { class: 'demo-floor', d: `M8 ${FLOOR}H232` });
        this.bones = el(svg, 'path', { class: 'demo-bones' });
        this.arc = el(svg, 'path', { class: 'demo-arc' });
        this.head = el(svg, 'circle', { class: 'demo-head', r: 9 });
        this.jointGroup = el(svg, 'g', { class: 'demo-joints' });
        const chip = el(svg, 'g', { class: 'demo-chip' });
        this.chipBox = el(chip, 'rect', { height: 28, rx: 14 });
        this.chipText = el(chip, 'text', {});
        this.setExercise(id);
    }

    setExercise(id) {
        this.id = POSES[id] ? id : 'squat';
        this.exercise = EXERCISES.find(e => e.id === this.id);
        this.jointGroup.replaceChildren();
        this.joints = null;
        this.startTime = null;
        this.draw(this.id === 'plank' ? 0 : 1, PLANK_SECONDS);
    }

    // depth：0～1（棒式不用）；seconds：棒式撐了幾秒
    draw(depth, seconds) {
        const pose = POSES[this.id](depth);
        this.bones.setAttribute('d', pose.lines.map(line => 'M' + line.map(p => f(p[0]) + ' ' + f(p[1])).join('L')).join(''));
        if (!this.joints) this.joints = pose.joints.map(() => el(this.jointGroup, 'circle', { r: 3.5 }));
        pose.joints.forEach((p, i) => {
            this.joints[i].setAttribute('cx', f(p[0]));
            this.joints[i].setAttribute('cy', f(p[1]));
        });
        this.head.setAttribute('cx', f(pose.head[0]));
        this.head.setAttribute('cy', f(pose.head[1]));
        let text, at;
        if (pose.angle) {
            const { at: b, from: a, to: c } = pose.angle;
            at = b;
            text = Math.round(angleAt(a, b, c)) + '°';
            // 角度的虛線弧：從關節往兩邊各 12 單位
            const toward = (p, r) => {
                const len = Math.hypot(p[0] - b[0], p[1] - b[1]);
                return [b[0] + (p[0] - b[0]) / len * r, b[1] + (p[1] - b[1]) / len * r];
            };
            const p1 = toward(a, 12), p2 = toward(c, 12);
            const cross = (a[0] - b[0]) * (c[1] - b[1]) - (a[1] - b[1]) * (c[0] - b[0]);
            this.arc.setAttribute('d', `M${f(p1[0])} ${f(p1[1])}A12 12 0 0 ${cross > 0 ? 1 : 0} ${f(p2[0])} ${f(p2[1])}`);
        } else {
            at = [120, 40];
            text = '撐住 ' + Math.floor(seconds) + ' 秒';
            this.arc.setAttribute('d', '');
        }
        // 數字標籤：放在關節上方，不超出圖框
        const w = text.length > 4 ? 92 : 52;
        const x = Math.max(4, Math.min(236 - w, at[0] - w / 2)), y = Math.max(4, at[1] - 44);
        this.chipBox.setAttribute('x', f(x));
        this.chipBox.setAttribute('y', f(y));
        this.chipBox.setAttribute('width', w);
        this.chipText.setAttribute('x', f(x + w / 2));
        this.chipText.setAttribute('y', f(y + 20));
        if (this.chipText.textContent !== text) this.chipText.textContent = text;
    }

    start() {
        if (this.frame !== null || this.reduceMotion) return;
        const tick = now => {
            if (this.startTime === null) this.startTime = now - (this.id === 'plank' ? 0 : DOWN * 1000);  // 從最低點開始，和靜止的畫面接得上
            const t = (now - this.startTime) / 1000;
            this.draw(depthAt(t), t % PLANK_SECONDS);
            this.frame = requestAnimationFrame(tick);
        };
        this.frame = requestAnimationFrame(tick);
    }

    stop() {
        if (this.frame !== null) cancelAnimationFrame(this.frame);
        this.frame = null;
    }
}
