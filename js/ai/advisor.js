// 速度建議（自動調整的第 1 步）：量這台裝置實際跑多快，建議要不要換每秒格數或模型
// 只建議、不自動改：使用者按「試試看」才換，按「不用了」以後不再提同一件事
// 量什麼：AI 每格算幾毫秒（送出畫面到結果回來）、AI 每秒算幾格、鏡頭每秒送幾格
// 下面的門檻是先訂的估計值，之後照組員各種手機的實測數字調整（docs/roadmap.md）

export const ADVICE = {
    warmupMs: 3000,     // 開鏡頭後先等這麼久再開始量（AI 暖機、鏡頭調整曝光的這幾秒比較慢，不準）
    seconds: 8,         // 畫面裡有人的時間量滿這麼多秒，才給建議
    keepUp: 0.85,       // AI 每秒算的格數有鏡頭的 85% 以上：算跟得上
    slowFps: 20,        // AI 每秒不到 20 格：動作快時骨架會慢半拍
    fullCost: 1.6,      // full 模型每格大約是 lite 的 1.5 倍時間，多抓一點
    // 每格耗時在「一格時間」的 60% 以內才算有餘裕：手機用久了發燙會降速，要留空間
    headroom: 0.6
};

// 中位數：偶爾一格特別慢（例如手機在背景整理記憶體）不會影響結果
export function median(values) {
    if (!values.length) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const mid = sorted.length >> 1;
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

// 收集量測數字：每一格記 AI 花幾毫秒，每一秒記 AI、鏡頭每秒幾格
export class SpeedMeter {
    constructor() {
        this.reset();
    }

    reset() {
        this.ms = [];
        this.aiFps = [];
        this.cameraFps = [];
    }

    addFrame(ms) {
        if (this.ms.length < 3000) this.ms.push(ms);
    }

    addSecond(aiFps, cameraFps) {
        if (aiFps > 0 && cameraFps > 0) {
            this.aiFps.push(aiFps);
            this.cameraFps.push(cameraFps);
        }
    }

    get ready() {
        return this.aiFps.length >= ADVICE.seconds && this.ms.length > 0;
    }

    // { msPerFrame, aiFps, cameraFps }：都取中位數，毫秒取到整數
    result() {
        return {
            msPerFrame: Math.round(median(this.ms)),
            aiFps: Math.round(median(this.aiFps)),
            cameraFps: Math.round(median(this.cameraFps))
        };
    }
}

// 依量測結果列出建議，越前面越優先；沒有要建議的回傳空陣列
// m：{ msPerFrame, aiFps, cameraFps, chosenFps（使用者選的每秒格數）, cameraMax（鏡頭最多幾格，0 不知道）, model（'lite' 或 'full'） }
// 每個建議：{ key（「不用了」記住用）, text, button（null：只有「知道了」）, action（{ fps } 或 { model } 或 null） }
export function advise(m) {
    const ms = m.msPerFrame;
    const list = [];
    if (m.aiFps < m.cameraFps * ADVICE.keepUp) {
        // 跟不上鏡頭：先建議把自己加上去的負擔拿掉（高格數、full 模型）
        if (m.chosenFps > 30) {
            list.push({
                key: 'fps30-from-' + m.chosenFps,
                text: 'AI 每秒只算到 ' + m.aiFps + ' 格，跟不上鏡頭的 ' + m.cameraFps + ' 格。建議改回每秒 30 格，比較省電、不容易發燙',
                button: '改回 30 格',
                action: { fps: 30 }
            });
        }
        if (m.model === 'full') {
            list.push({
                key: 'lite',
                text: '用 full 模型時，AI 每格要 ' + ms + ' 毫秒，每秒只算到 ' + m.aiFps + ' 格。建議改用比較快的 lite 模型（換的時候畫面停 1～2 秒）',
                button: '改用 lite',
                action: { model: 'lite' }
            });
        }
        if (m.aiFps < ADVICE.slowFps) {
            list.push({
                key: 'slow',
                text: '這台裝置 AI 每秒只算到 ' + m.aiFps + ' 格，動作快時骨架會慢半拍。可以關掉其他 App、接上電源再試',
                button: null,
                action: null
            });
        }
        return list;
    }
    // 跟得上：還有餘裕的話，先建議更準（full），再建議更順（60 格）
    const frameMs = 1000 / m.cameraFps;
    if (m.model === 'lite' && ms * ADVICE.fullCost < frameMs * ADVICE.headroom) {
        list.push({
            key: 'full',
            text: 'AI 每格只要 ' + ms + ' 毫秒，還很有餘裕。可以試試比較準的 full 模型（多下載 3.6 MB，換的時候畫面停 1～2 秒）',
            button: '試試 full',
            action: { model: 'full' }
        });
    }
    if (m.chosenFps <= 30 && m.cameraMax >= 60 && ms < 1000 / 60 * ADVICE.headroom) {
        list.push({
            key: 'fps60',
            text: 'AI 每格只要 ' + ms + ' 毫秒，鏡頭最多每秒 ' + m.cameraMax + ' 格。可以試試每秒 60 格，動作更順（比較耗電）',
            button: '試試 60 格',
            action: { fps: 60 }
        });
    }
    return list;
}

// 「不用了」的建議記在這台裝置上，以後不再提
const SKIP_KEY = 'adviceSkipped';
export function loadSkipped() {
    try {
        const list = JSON.parse(localStorage.getItem(SKIP_KEY) || '[]');
        return Array.isArray(list) ? list : [];
    } catch (err) {
        return [];
    }
}
export function skipAdvice(key) {
    const list = loadSkipped();
    if (!list.includes(key)) list.push(key);
    try { localStorage.setItem(SKIP_KEY, JSON.stringify(list)); } catch (err) { /* 不能存就下次再提 */ }
}

// ---------- 自動調每秒格數（自動調整的第 2 步） ----------
// 「畫面流暢度」選「自動」時：開鏡頭量完（同上面的速度建議）有餘裕就升到每秒 60 格，之後每秒檢查一次：
//   60 格時最近 10 秒有 8 秒跟不上（或鏡頭給不到 45 格）→ 降回 30（降得快，動作不會一直卡）
//   30 格時連續 60 秒都很有餘裕 → 再試一次 60（升得慢，才不會一直來回跳）；降過 2 次就不再試
// 只看畫面裡有人、沒在錄製時的秒數（錄製中格數鎖住，數據才能比較）
export const AUTO_FPS = {
    window: 10,      // 看最近幾秒
    downBad: 8,      // 其中幾秒跟不上就降
    upGood: 60,      // 連續幾秒有餘裕才再升
    maxDowns: 2,     // 降過幾次就不再升
    cameraMin: 45    // 要 60 格時鏡頭至少要給到這麼多格，不然是鏡頭做不到
};

export class AutoFps {
    constructor() {
        this.reset();
    }

    // 開鏡頭時：重新開始
    reset() {
        this.samples = [];
        this.downs = 0;
        this.cameraCant = false;   // 鏡頭給不到 60 格：這次開鏡頭不再試
    }

    // 換了格數：之前的秒數不算
    clear() {
        this.samples = [];
    }

    // 每秒一筆 s：{ aiFps, cameraFps, msPerFrame }；rate：目前每秒幾格；cameraMax：鏡頭最多幾格（0 不知道）
    // 回傳要換成的格數（30 或 60），不用換時回傳 0
    second(s, rate, cameraMax) {
        this.samples.push(s);
        if (this.samples.length > AUTO_FPS.upGood) this.samples.shift();
        if (rate > 30) {
            const recent = this.samples.slice(-AUTO_FPS.window);
            if (recent.length < AUTO_FPS.window) return 0;
            const cameraShort = recent.filter(x => x.cameraFps < AUTO_FPS.cameraMin).length;
            const behind = recent.filter(x => x.cameraFps < AUTO_FPS.cameraMin || x.aiFps < x.cameraFps * ADVICE.keepUp).length;
            if (behind < AUTO_FPS.downBad) return 0;
            this.downs++;
            if (cameraShort >= AUTO_FPS.downBad) this.cameraCant = true;
            this.samples = [];
            return 30;
        }
        if (this.downs >= AUTO_FPS.maxDowns || this.cameraCant || cameraMax < 60) return 0;
        if (this.samples.length < AUTO_FPS.upGood) return 0;
        const roomy = this.samples.every(x => x.aiFps >= x.cameraFps * ADVICE.keepUp && x.msPerFrame < 1000 / 60 * ADVICE.headroom);
        if (!roomy) return 0;
        this.samples = [];
        return 60;
    }
}
