// 首頁示意圖的深蹲動畫：火柴人蹲下再站起來，膝蓋角度的數字跟著變
// 只在看得到時才動（手機上這張圖是隱藏的、捲出畫面、切到別的分頁都會停），不浪費電
// 系統設定「減少動態效果」時不動，維持 index.html 裡寫好的蹲到底的樣子

const $ = id => document.getElementById(id);
const svg = document.querySelector('.hero-art');

// 骨架長度（和 index.html 裡蹲到底的樣子相同）
const THIGH = 77.25, SHANK = 79.12, TORSO = 78.43, HEAD = 108.2, ARM_FROM = 61.4;
const ANKLE = [200, 305];
// 站著（上）與蹲到底（下）：膝蓋角度、小腿往前傾、上身往前傾（度）
// 上面的膝蓋角度停在 168°：完全站直時頭會超出圖框
const TOP = { knee: 168, shank: 4, torso: 6 };
const BOTTOM = { knee: 95.1, shank: 16.14, torso: 19.36 };
// 一下的節奏（秒）：往下、底部停一下、往上、站著停一下
const DOWN = 1.3, HOLD_BOTTOM = 0.35, UP = 1.3, HOLD_TOP = 0.6;
const PERIOD = DOWN + HOLD_BOTTOM + UP + HOLD_TOP;

const rad = d => d * Math.PI / 180;
const lerp = (a, b, t) => a + (b - a) * t;
const ease = t => t * t * (3 - 2 * t);
const f = v => v.toFixed(1);

// 一次循環中的第 t 秒：0 = 站著、1 = 蹲到底
function depthAt(t) {
    t %= PERIOD;
    if (t < DOWN) return ease(t / DOWN);
    t -= DOWN;
    if (t < HOLD_BOTTOM) return 1;
    t -= HOLD_BOTTOM;
    if (t < UP) return 1 - ease(t / UP);
    return 0;
}

function draw(depth) {
    const knee = lerp(TOP.knee, BOTTOM.knee, depth);
    const shank = rad(lerp(TOP.shank, BOTTOM.shank, depth));
    const torso = rad(lerp(TOP.torso, BOTTOM.torso, depth));
    const k = [ANKLE[0] + SHANK * Math.sin(shank), ANKLE[1] - SHANK * Math.cos(shank)];
    // 大腿方向：從「膝蓋 → 腳踝」轉過膝蓋角度
    const a = Math.atan2(ANKLE[1] - k[1], ANKLE[0] - k[0]) + rad(knee);
    const hip = [k[0] + THIGH * Math.cos(a), k[1] + THIGH * Math.sin(a)];
    const up = [Math.sin(torso), -Math.cos(torso)];
    const along = d => [hip[0] + d * up[0], hip[1] + d * up[1]];
    const shoulder = along(TORSO), head = along(HEAD), arm = along(ARM_FROM);
    const elbow = [arm[0] + 52, arm[1] + 18], wrist = [elbow[0] + 48, elbow[1]];
    const toward = (p, r) => {
        const d = Math.hypot(p[0] - k[0], p[1] - k[1]);
        return [k[0] + (p[0] - k[0]) / d * r, k[1] + (p[1] - k[1]) / d * r];
    };
    const p1 = toward(hip, 24), p2 = toward(ANKLE, 24);

    $('artBody').setAttribute('d', `M${f(shoulder[0])} ${f(shoulder[1])}L${f(hip[0])} ${f(hip[1])}L${f(k[0])} ${f(k[1])}L${ANKLE[0]} ${ANKLE[1]}`);
    $('artArm').setAttribute('d', `M${f(arm[0])} ${f(arm[1])}L${f(elbow[0])} ${f(elbow[1])}L${f(wrist[0])} ${f(wrist[1])}`);
    $('artArc').setAttribute('d', `M${f(p1[0])} ${f(p1[1])}A24 24 0 0 0 ${f(p2[0])} ${f(p2[1])}`);
    for (const [id, p] of [['artHead', head], ['artShoulder', shoulder], ['artHip', hip], ['artKnee', k], ['artElbow', elbow], ['artWrist', wrist]]) {
        $(id).setAttribute('cx', f(p[0]));
        $(id).setAttribute('cy', f(p[1]));
    }
    $('artChipBox').setAttribute('x', f(k[0] + 10));
    $('artChipBox').setAttribute('y', f(k[1] + 12));
    $('artAngle').setAttribute('x', f(k[0] + 53));
    $('artAngle').setAttribute('y', f(k[1] + 39));
    const text = Math.round(knee) + '°';
    if ($('artAngle').textContent !== text) $('artAngle').textContent = text;
}

let visible = false;
let frame = null;
let start = null;

function tick(now) {
    frame = null;
    if (start === null) start = now - DOWN * 1000;  // 從蹲到底開始，和靜態圖接得上
    draw(depthAt((now - start) / 1000));
    schedule();
}

// 鏡頭畫面開著時，示意圖被全螢幕畫面蓋住（瀏覽器仍然當作「看得到」），也要停，不和 AI 搶運算
const stage = document.getElementById('stage');
const covered = () => !!stage && !stage.hidden;

function schedule() {
    if (frame === null && visible && !document.hidden && !covered()) frame = requestAnimationFrame(tick);
}

function stop() {
    if (frame !== null) cancelAnimationFrame(frame);
    frame = null;
}

const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)');
if (svg && 'IntersectionObserver' in window && !(reduceMotion && reduceMotion.matches)) {
    // 看得到才動：手機上這張圖是隱藏的（display: none 永遠不會「看得到」），所以手機完全不會跑動畫
    new IntersectionObserver(entries => {
        visible = entries[entries.length - 1].isIntersecting;
        if (visible) schedule();
        else stop();
    }).observe(svg);
    document.addEventListener('visibilitychange', () => (document.hidden ? stop() : schedule()));
    if (stage) new MutationObserver(() => (covered() ? stop() : schedule())).observe(stage, { attributes: true, attributeFilter: ['hidden'] });
}
