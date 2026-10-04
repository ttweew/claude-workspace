// 骨架往前預測：讓畫出來的骨架貼住「現在」的身體，不會跟在後面
//
// 為什麼會跟在後面：AI 拿 t 時刻的畫面去算，算完（幾十毫秒後）才畫出來，這時人已經又動了一點，
// 骨架看起來就像拖在身體後面。做法是用平滑程式算出的速度，把每個點往前推「從拍到畫出來經過的時間」
//
// 只用在「畫出來」的位置（骨架、標籤）；角度、深蹲判斷、錄製資料都用沒預測的數字，不影響準確度
//
// 模擬測試（3D 合成深蹲，加上畫面雜訊；詳見 docs/data-format.md「骨架跟手程度」）：
//   每秒 30 格、延遲 40 ms：動作中骨架和身體差 6.8 → 3.0 像素；每秒 15 格、延遲 80 ms：11.8 → 6.0 像素
//   靜止時不受影響：速度很小（只是雜訊）時完全不預測（死區），點才不會因為雜訊而飄

const DEAD_ZONE = 40;     // 速度低於每秒 40 像素：當作沒在動，不預測
const FULL_SPEED = 120;   // 速度高於每秒 120 像素：完全預測；中間平滑過渡
const MAX_AHEAD_MS = 150; // 最多往前推這麼久，避免異常延遲時推得太遠

// landmarks：平滑後的點；velocity：每個點的速度 { vx, vy }（畫面比例／毫秒，PoseSmoother.velocity()）
// aheadMs：要往前推多久；width、height：鏡頭畫面的像素大小（速度換算成像素用）
// 回傳新的點陣列（保留 visible 等欄位，不會改到原本的點）
export function predictPose(landmarks, velocity, aheadMs, width, height) {
    const ahead = Math.max(0, Math.min(MAX_AHEAD_MS, aheadMs));
    if (!velocity || !ahead || velocity.length !== landmarks.length) return landmarks;
    return landmarks.map((p, i) => {
        const { vx, vy } = velocity[i];
        if (!Number.isFinite(vx) || !Number.isFinite(vy)) return p;
        const speed = Math.hypot(vx * width, vy * height) * 1000;  // 像素／秒
        const f = Math.min(1, Math.max(0, (speed - DEAD_ZONE) / (FULL_SPEED - DEAD_ZONE)));
        if (!f) return p;
        const a = ahead * f * f * (3 - 2 * f);
        return { ...p, x: p.x + vx * a, y: p.y + vy * a };
    });
}
