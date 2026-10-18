import { squatPose, project, angle2 } from './body.mjs';
import { computeAngles, signedAngle, shortSegments } from '/home/user/claude-workspace/js/analysis/angles.js';
import { viewRatio, facingScore, ViewTracker } from '/home/user/claude-workspace/js/analysis/view.js';
import { LANDMARKS } from '/home/user/claude-workspace/js/skeleton/landmarks.js';
let fail = 0;
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fail++; };
const W = 640, H = 480;
// 合成骨架 → 33 點（正規化座標）
function toLandmarks(p) {
    return LANDMARKS.map(([k]) => p[k] ? { x: p[k].x / W, y: p[k].y / H, z: 0, visibility: 0.99 } : { x: 0.5, y: 0.1, z: 0, visibility: 0.1 });
}
// yaw 180 = 面向左的側面
const lm = (opts, yaw, scale = 150) => toLandmarks(project(squatPose(opts).P, yaw, scale, 320, 420));

// 1. 拍攝方向分類（單格）
for (const [yaw, expect] of [[0, 'side'], [15, 'side'], [180, 'side'], [30, 'oblique'], [150, 'oblique'], [45, 'front'], [90, 'front'], [270, 'front']]) {
    const tr = new ViewTracker();
    const l = lm({ knee: 120, lean: 25 }, yaw);
    const st = tr.update(l, 1000, W, H);
    ok(st.view === expect, `yaw ${yaw}° → ${st.view}（比值 ${st.ratio.toFixed(2)}，應為 ${expect}）`);
}
// 2. 深蹲過程比值穩定（側面）
{
    const rs = [180, 150, 120, 90, 70].map(k => viewRatio(lm({ knee: k, lean: (180 - k) * 0.4 }, 10), W, H));
    ok(Math.max(...rs) < 0.2, '側偏 10° 深蹲全程都判斷為側面：' + rs.map(r => r.toFixed(2)).join(' '));
}
// 3. 面向
for (const [yaw, expect] of [[0, 1], [20, 1], [180, -1], [200, -1], [90, 0]]) {
    const tr = new ViewTracker();
    const st = tr.update(lm({ knee: 150, lean: 10 }, yaw), 1000, W, H);
    ok(st.facing === expect, `yaw ${yaw}° 面向 ${st.facing}（應為 ${expect}，分數 ${facingScore(lm({ knee: 150, lean: 10 }, yaw), W, H).toFixed(2)}）`);
}
// 4. 緩衝：比值在門檻附近抖動時不會一直換
{
    const tr = new ViewTracker(); let t = 0, changes = 0, last = null;
    for (let i = 0; i < 300; i++) {
        const yaw = 23 + Math.sin(i * 1.7) * 3;  // 比值約 0.18～0.22 之間抖動
        const st = tr.update(lm({ knee: 150, lean: 10 }, yaw), t += 33, W, H);
        if (last && st.view !== last) changes++;
        last = st.view;
    }
    ok(changes <= 1, '比值在 0.2 附近抖動 10 秒，類別只換了 ' + changes + ' 次');
}
// 5. 正面拍深蹲：大腿朝鏡頭 → 膝、髖角度不給
{
    // 深蹲到大腿接近水平（小腿前傾 35°、膝 70°）
    const l = lm({ knee: 70, shankLean: 35, lean: 35 }, 90);
    const a = computeAngles(l, W, H);
    const s = shortSegments(l, W, H);
    ok(a.LEFT_KNEE === null && a.LEFT_HIP === null, `正面深蹲（大腿接近水平）：膝=${a.LEFT_KNEE} 髖=${a.LEFT_HIP}（太短：${[...s].join(',')}）`);
    // 半蹲：大腿還不夠短，角度照給（但錯很多）→ 要靠拍攝方向判斷提醒
    const l2 = lm({ knee: 120, lean: 25 }, 90);
    const a2 = computeAngles(l2, W, H);
    const st = new ViewTracker().update(l2, 1000, W, H);
    ok(a2.LEFT_KNEE !== null && st.view === 'front', `正面半蹲：膝顯示 ${a2.LEFT_KNEE.toFixed(0)}°（實際 120°）→ 線段檢查擋不到，拍攝方向判斷為 ${st.view}`);
}
// 6. 側面拍：所有深度都給角度、而且等於真實值
{
    let allShown = true, worst = 0;
    for (const k of [180, 150, 120, 90, 70, 55]) {
        const l = lm({ knee: k, lean: (180 - k) * 0.4 }, 0);
        const a = computeAngles(l, W, H);
        if (a.LEFT_KNEE === null || a.LEFT_HIP === null || a.RIGHT_KNEE === null) allShown = false;
        else worst = Math.max(worst, Math.abs(a.LEFT_KNEE - k));
    }
    ok(allShown && worst < 0.5, '側面拍 膝 180～55° 全部給角度，最大誤差 ' + worst.toFixed(2) + '°');
}
// 7. 站很遠（軀幹 40 像素）也照常給角度
{
    const l = lm({ knee: 120, lean: 20 }, 0, 40);
    const a = computeAngles(l, W, H);
    ok(a.LEFT_KNEE !== null, '站很遠（軀幹 40 px）膝=' + (a.LEFT_KNEE && a.LEFT_KNEE.toFixed(0)));
}
// 8. 有方向的角度
{
    // 一般深蹲：面向右、面向左都不會被當成反折
    for (const yaw of [0, 180]) {
        const l = lm({ knee: 100, lean: 30 }, yaw);
        const a = computeAngles(l, W, H);
        const st = new ViewTracker().update(l, 1000, W, H);
        const sk = signedAngle('LEFT_KNEE', a, l, W, H, st.facing), sh = signedAngle('LEFT_HIP', a, l, W, H, st.facing);
        ok(sk < 180 && sh < 180 && Math.abs(sk - a.LEFT_KNEE) < 1e-9, `yaw ${yaw} 深蹲：膝 ${sk.toFixed(0)}° 髖 ${sh.toFixed(0)}°（面向 ${st.facing}）`);
    }
    // 膝蓋反折 8°（小腿往後斜）
    for (const yaw of [0, 180]) {
        const l = lm({ knee: 172, shankLean: -8, lean: 0 }, yaw);
        // 手動做反折：把膝蓋往後推
        const p = project(squatPose({ knee: 180 }).P, yaw, 150, 320, 420);
        const dir = yaw === 0 ? -1 : 1;  // 面向右時「後」是 -x
        p.LEFT_KNEE = { ...p.LEFT_KNEE, x: p.LEFT_KNEE.x + dir * 0.07 * 150 };
        const l2 = toLandmarks(p);
        const a = computeAngles(l2, W, H);
        const st = new ViewTracker().update(l2, 1000, W, H);
        const sk = signedAngle('LEFT_KNEE', a, l2, W, H, st.facing);
        ok(sk > 180 && sk < 200, `yaw ${yaw} 膝蓋反折：${sk.toFixed(0)}°（一般角度 ${a.LEFT_KNEE.toFixed(0)}°，面向 ${st.facing}）`);
    }
    // 弓箭步後腳：大腿在軀幹後面 → 髖超過 180°
    for (const yaw of [0, 180]) {
        const p = project(squatPose({ knee: 180 }).P, yaw, 150, 320, 420);
        const dir = yaw === 0 ? -1 : 1;
        for (const k of ['LEFT_KNEE', 'LEFT_ANKLE', 'LEFT_HEEL', 'LEFT_FOOT_INDEX']) {
            const d = k === 'LEFT_KNEE' ? 0.3 : 0.6;
            p[k] = { ...p[k], x: p[k].x + dir * d * 150, y: p[k].y - (k === 'LEFT_KNEE' ? 0.05 : 0.1) * 150 };
        }
        const l2 = toLandmarks(p);
        const a = computeAngles(l2, W, H);
        const st = new ViewTracker().update(l2, 1000, W, H);
        const sh = signedAngle('LEFT_HIP', a, l2, W, H, st.facing);
        ok(sh > 180, `yaw ${yaw} 弓箭步後腳髖：${sh && sh.toFixed(0)}°（一般角度 ${a.LEFT_HIP && a.LEFT_HIP.toFixed(0)}°，面向 ${st.facing}）`);
    }
    // 正面拍：面向不明 → 不加方向
    const l = lm({ knee: 150, lean: 10 }, 90);
    const a = computeAngles(l, W, H);
    ok(signedAngle('LEFT_KNEE', a, l, W, H, 0) === a.LEFT_KNEE, '面向不明時回傳一般角度');
    ok(signedAngle('LEFT_ELBOW', a, l, W, H, 1) === a.LEFT_ELBOW, '手肘不加方向');
}
// 9. 看不到肩膀時不判斷
{
    const l = lm({ knee: 150 }, 0); l[11].visibility = 0.1;
    const st = new ViewTracker().update(l, 1000, W, H);
    ok(st.view === null && st.facing === 0, '看不到肩膀：' + JSON.stringify(st));
}
console.log(fail ? fail + ' FAILED' : 'ALL PASS');
