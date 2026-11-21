// 骨架模型的「能力表」（11/21，讓使用者自己選模型的第 1 步）
// 網站其他部分不直接寫「lite」「full」這些名字，而是問這張表：這個模型是哪一家的、有沒有腳跟和腳尖、有沒有 3D 座標
// 例如「腳跟離地」要看得到腳跟：用沒有腳跟的模型時就不判斷，畫面上寫清楚（不能默默當作做對）
// 加新的模型（YOLO、之後自己訓練的）：在 PROFILES 加一筆，再到 js/ai/pose-source.js 的 LOADERS 接上那一家的載入方法
//
// 每一筆：
//   family：哪一家（同一家的模型換大小不用換載入方法；換一家要換）
//   label：畫面上的名字
//   feet：有沒有腳跟、腳尖（MediaPipe 的 29～32 號點）
//   hands：有沒有手指（17～22 號點）
//   world：有沒有 3D 座標（world landmarks）

export const PROFILES = {
    lite: { family: 'mediapipe', label: 'MediaPipe lite', feet: true, hands: true, world: true },
    full: { family: 'mediapipe', label: 'MediaPipe full', feet: true, hands: true, world: true }
};

export const MODEL_KEYS = Object.keys(PROFILES);

// 外面來的名字（網址參數、錄製檔、localStorage）要先比對清單，不能直接拿去查 PROFILES：
// 'constructor' 這種 JavaScript 內建的名字查得到東西，網頁會壞掉
export function isModelKey(key) {
    return MODEL_KEYS.includes(key);
}

export function profileOf(key) {
    return isModelKey(key) ? PROFILES[key] : null;
}

// 哪一家；不認得的名字回傳 ''
export function familyOf(key) {
    const p = profileOf(key);
    return p ? p.family : '';
}

// 這個模型有沒有腳跟、腳尖：不認得的名字（例如很舊的錄製檔沒寫）當作有（以前只有 MediaPipe）
export function hasFeet(key) {
    const p = profileOf(key);
    return p ? p.feet : true;
}
