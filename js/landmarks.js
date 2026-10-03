// MediaPipe 33 個關鍵點的名稱對照表，以及用現有的點算出新的點

// 編號（陣列位置）由模型訓練時固定，不能更改；我們替每個編號取英文代號與中文名稱
// 左、右指的是被拍攝者本人的左右
export const LANDMARKS = [
    ['NOSE', '鼻子'],                          // 0
    ['LEFT_EYE_INNER', '左眼內側'],            // 1
    ['LEFT_EYE', '左眼'],                      // 2
    ['LEFT_EYE_OUTER', '左眼外側'],            // 3
    ['RIGHT_EYE_INNER', '右眼內側'],           // 4
    ['RIGHT_EYE', '右眼'],                     // 5
    ['RIGHT_EYE_OUTER', '右眼外側'],           // 6
    ['LEFT_EAR', '左耳'],                      // 7
    ['RIGHT_EAR', '右耳'],                     // 8
    ['MOUTH_LEFT', '嘴巴左側'],                // 9
    ['MOUTH_RIGHT', '嘴巴右側'],               // 10
    ['LEFT_SHOULDER', '左肩'],                 // 11
    ['RIGHT_SHOULDER', '右肩'],                // 12
    ['LEFT_ELBOW', '左肘'],                    // 13
    ['RIGHT_ELBOW', '右肘'],                   // 14
    ['LEFT_WRIST', '左腕'],                    // 15
    ['RIGHT_WRIST', '右腕'],                   // 16
    ['LEFT_PINKY', '左手小指'],                // 17
    ['RIGHT_PINKY', '右手小指'],               // 18
    ['LEFT_INDEX', '左手食指'],                // 19
    ['RIGHT_INDEX', '右手食指'],               // 20
    ['LEFT_THUMB', '左手拇指'],                // 21
    ['RIGHT_THUMB', '右手拇指'],               // 22
    ['LEFT_HIP', '左髖'],                      // 23
    ['RIGHT_HIP', '右髖'],                     // 24
    ['LEFT_KNEE', '左膝'],                     // 25
    ['RIGHT_KNEE', '右膝'],                    // 26
    ['LEFT_ANKLE', '左踝'],                    // 27
    ['RIGHT_ANKLE', '右踝'],                   // 28
    ['LEFT_HEEL', '左腳跟'],                   // 29
    ['RIGHT_HEEL', '右腳跟'],                  // 30
    ['LEFT_FOOT_INDEX', '左腳尖'],             // 31
    ['RIGHT_FOOT_INDEX', '右腳尖']             // 32
];

// 用代號查編號，例如 P.LEFT_KNEE 就是 25
export const P = Object.fromEntries(LANDMARKS.map(([key], id) => [key, id]));

// 主要關節：肩、肘、腕（11～16）與髖、膝、踝（23～28），後續角度計算主要用這些點
export function isMainJoint(id) {
    return (id >= 11 && id <= 16) || (id >= 23 && id <= 28);
}

// MediaPipe 一定會回傳全部 33 點，就算那個部位不在畫面裡，也會「猜」一個位置
// （例如只拍到頭時，會猜出手腕落在畫面下方）。visibility 是模型認為這個點真的看得到的機率（0～1）
// 實測只拍到頭時，猜出來的手腕約 0.5～0.6，真的拍到的點幾乎都在 0.8 以上，所以門檻設 0.65
export const MIN_VISIBILITY = 0.65;

// 這個點是否真的看得到：可信度夠高，而且在畫面範圍內
// 只用來決定畫面上要不要畫出來；原始資料仍保留全部 33 點，之後分析時可以自己判斷
// 畫面上的點經過 ghost.js 檢查後會帶有 visible 欄位，以它為準（擋掉模型腦補出來的點）
export function isVisible(point) {
    if (point.visible !== undefined) return point.visible;
    return point.visibility >= MIN_VISIBILITY
        && point.x >= 0 && point.x <= 1 && point.y >= 0 && point.y <= 1;
}

// 兩點的中點：用來算出模型沒有提供的新點
export function midpoint(a, b) {
    return {
        x: (a.x + b.x) / 2,
        y: (a.y + b.y) / 2,
        z: (a.z + b.z) / 2,
        visibility: Math.min(a.visibility, b.visibility),
        // 兩個點都經過鬼點檢查時，中點也要兩點都看得到才算
        ...(a.visible !== undefined && b.visible !== undefined ? { visible: a.visible && b.visible } : {})
    };
}

// 自己算出的點：髖部中心（重心附近）與肩膀中心，兩點連線就是軀幹
export function getDerivedPoints(landmarks) {
    return {
        HIP_CENTER: midpoint(landmarks[P.LEFT_HIP], landmarks[P.RIGHT_HIP]),
        SHOULDER_CENTER: midpoint(landmarks[P.LEFT_SHOULDER], landmarks[P.RIGHT_SHOULDER])
    };
}

// 側面拍時，左右哪一邊看得比較清楚（靠近鏡頭那側比較準）：肩、髖、膝、踝的可信度加總比較
// current：目前用的那一側；另一側要明顯比較清楚（多 margin）才換，避免數字在左右之間一直跳
// 大字儀表板和深蹲計數都用這個，兩邊顯示的一定是同一隻腳
export function clearerSide(landmarks, current = 'LEFT', margin = 0.4) {
    const score = side => ['SHOULDER', 'HIP', 'KNEE', 'ANKLE'].reduce((sum, k) => sum + landmarks[P[side + '_' + k]].visibility, 0);
    const other = current === 'LEFT' ? 'RIGHT' : 'LEFT';
    return score(other) > score(current) + margin ? other : current;
}
