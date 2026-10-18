// 最壞情況：一個點等速移動，突然完全停住。比較「有預測」與「沒預測」畫出來的位置，停住之後衝過頭多少、多久回來
import { PoseSmoother } from '/home/user/claude-workspace/js/skeleton/smooth.js';
import { predictPose } from '/home/user/claude-workspace/js/skeleton/predict.js';
const W = 640, H = 480;
function run(speedPx, fps, latency, predict) {
    const sm = new PoseSmoother();
    const stopAt = 1000, x0 = 0.2;
    const truthX = t => x0 + Math.min(t, stopAt) * speedPx / 1000 / W;
    let maxOver = 0, lastOverT = 0, maxLagMoving = 0;
    for (let t = 0; t < 2500; t += 1000 / fps) {
        const pts = Array.from({ length: 33 }, () => ({ x: truthX(t), y: 0.5, z: 0, visibility: 1 }));
        const s = sm.smooth(pts, t);
        const shown = predict ? predictPose(s, sm.velocity(), latency, W, H) : s;
        const drawnAt = t + latency;           // 畫出來的時刻
        const err = (shown[0].x - truthX(drawnAt)) * W;  // 正：跑到前面（衝過頭），負：落後
        if (drawnAt > stopAt) { if (err > maxOver) maxOver = err; if (err > 1) lastOverT = drawnAt - stopAt; }
        else if (t > 300) maxLagMoving = Math.min(maxLagMoving, err);
    }
    return { 移動中最大落後: -maxLagMoving.toFixed(1), 停住後最大衝過頭: +maxOver.toFixed(1), 衝過頭超過1像素持續ms: Math.round(lastOverT) };
}
for (const [fps, lat] of [[30, 40], [15, 80]]) for (const sp of [150, 300, 600, 1200]) {
    const a = run(sp, fps, lat, false), b = run(sp, fps, lat, true);
    console.log(`${fps}fps/${lat}ms 速度${sp}px/s | 不預測 落後${a.移動中最大落後} 衝過頭${a.停住後最大衝過頭}(${a.衝過頭超過1像素持續ms}ms) | 預測 落後${b.移動中最大落後} 衝過頭${b.停住後最大衝過頭}(${b.衝過頭超過1像素持續ms}ms)`);
}
