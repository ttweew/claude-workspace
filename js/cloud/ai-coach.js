// AI 教練（10/31，計畫書研究目標 3「個人化建議」）：每組做完，把這組的數字（js/analysis/coach.js 的 coachFacts）給 Google 的 Gemini，
// 請它講兩三句建議。經過 Firebase AI Logic 的 Gemini Developer API（免費方案就能用）：用和雲端同步同一個 Firebase 專案，
// 網頁裡不用放 Gemini 的金鑰（Firebase 的設定本來就是公開的，見 config.js）
// 預設關閉：首頁「AI 教練」打開才會載入、才會送。只送數字和動作名稱，沒有影像、骨架座標、日期、帳號
// 沒打開、網站沒接上 Firebase、Firebase 主控台還沒開 AI Logic、沒網路、逾時、回答不能用：都改用固定句子（coach.js 的 fixedAdvice）
import { FIREBASE_CONFIG, FIREBASE_SDK, AI_MODEL } from './config.js';

const KEY = 'aiCoach';
export const AI_COACH = {
    timeoutMs: 10000,     // 超過 10 秒沒回答就改用固定句子（運動完看總結的人不會等太久）
    maxChars: 160,        // 兩三句、每句 30 字左右；太長多半是沒照規則回答
    maxLines: 3,
    maxTokens: 256
};

// 給 Gemini 的話：規則＋這組的數字（JSON，鍵用中文，Gemini 才知道每個數字的意思）
export function coachPrompt(f) {
    const data = { 動作: f.name, 次數: f.count, 沒有錯誤的: f.clean };
    if (f.kind === 'hold') {
        Object.assign(data, { 最久幾秒: f.best, 總共幾秒: f.total });
    } else {
        Object.assign(data, { 到位: f.good, 再低一點: f.close, 太淺: f.shallow, 最低角度: f.lowest, 平均最低角度: f.average, 平均每下幾秒: f.tempo });
        if (f.similarity !== null) data['和示範動作相似（0～100）'] = f.similarity;
    }
    if (f.errors.length) data.錯誤 = Object.fromEntries(f.errors.map(e => [e.name, e.count]));
    if (f.fatigue) data.疲勞跡象 = f.fatigue;
    if (f.rhythm) data.節奏 = f.rhythm === 'steady' ? '穩' : '忽快忽慢';
    if (f.stalls) data.中途卡住的是第幾下 = f.stalls;
    if (f.stability && f.kind === 'hold') data['髖部上下晃動（度）'] = { 平均: f.stability.hipSway, 前段: f.stability.front, 後段: f.stability.back };
    else if (f.stability) data['重心前後晃動（小腿長的 %）'] = { 平均: f.stability.sway, 前段: f.stability.front, 後段: f.stability.back };
    return [
        '你是健身教練。下面是使用者剛做完的一組運動，網站從鏡頭算出來的數字（不是影像）。',
        '請用繁體中文（台灣用語）寫兩到三句建議：先說一個做得好的地方，再說最需要改進的一點、具體怎麼做。',
        '每句不超過 30 個字；不要列點、標題、表情符號、英文、網址；不要做醫療診斷；數字只能用下面有的。',
        '數字：' + JSON.stringify(data)
    ].join('\n');
}

// 檢查 Gemini 的回答，回傳整理好的句子（陣列），不能用時回傳 null
// 要有中文、不能太長；照句號分成幾句，最多 3 句
// 分句不用「往回看」的正規表示式（(?<=…)）：iPhone 的 iOS 16.4 以前看不懂，整個網頁的程式會載不起來（網站支援 iOS 15 以上）
export function checkReply(text) {
    if (typeof text !== 'string') return null;
    const t = text.trim();
    if (!t || t.length > AI_COACH.maxChars || !/[一-鿿]/.test(t)) return null;
    const lines = t.replace(/([。！？!?])/g, '$1\n').split(/\n+/).map(s => s.trim()).filter(Boolean);
    return lines.length ? lines.slice(0, AI_COACH.maxLines) : null;
}

// 為什麼沒用到 AI（給使用者看的一句話；都會改用固定句子）
export const FAILURE_TEXT = {
    disabled: 'AI 教練還沒開通（Firebase 主控台要先開 AI Logic），先用固定的建議',
    timeout: 'AI 教練超過 10 秒沒回答，先用固定的建議',
    'bad-reply': 'AI 教練的回答看不懂，先用固定的建議',
    error: 'AI 教練暫時連不上，先用固定的建議'
};

// 錯誤 → 原因（FAILURE_TEXT 的鍵）；Firebase AI 的錯誤代號見 firebase-ai.js 的 AIErrorCode
export function failureOf(err) {
    const code = err && err.code;
    if (code === 'timeout' || code === 'bad-reply') return code;
    if (code === 'api-not-enabled') return 'disabled';
    return 'error';
}

function withTimeout(promise, ms) {
    let timer;
    const late = new Promise((_, reject) => {
        timer = setTimeout(() => reject(Object.assign(new Error('AI 教練超過 ' + ms / 1000 + ' 秒沒有回應'), { code: 'timeout' })), ms);
    });
    return Promise.race([promise, late]).finally(() => clearTimeout(timer));
}

// 載入 Firebase 的 AI 程式、建好模型（用自己的 app 名字，不和雲端同步的 app 互相影響）
async function loadModel(config) {
    const [appLib, aiLib] = await Promise.all([import(FIREBASE_SDK + '/firebase-app.js'), import(FIREBASE_SDK + '/firebase-ai.js')]);
    const name = 'ai-coach';
    const app = appLib.getApps().some(a => a.name === name) ? appLib.getApp(name) : appLib.initializeApp(config, name);
    const ai = aiLib.getAI(app, { backend: new aiLib.GoogleAIBackend() });
    return aiLib.getGenerativeModel(ai, { model: AI_MODEL, generationConfig: { maxOutputTokens: AI_COACH.maxTokens, temperature: 0.4 } });
}

export class AiCoach {
    // config：Firebase 的設定（測試可以傳 null，當作網站還沒接上 Firebase）；load：建好模型（測試換成假的）
    constructor(config = FIREBASE_CONFIG, { load = loadModel, timeoutMs = AI_COACH.timeoutMs } = {}) {
        this.config = config;
        this.available = !!config;
        this.load = load;
        this.timeoutMs = timeoutMs;
        this.enabled = false;
        try { this.enabled = this.available && localStorage.getItem(KEY) === '1'; } catch (err) { /* 不能讀就當作關閉 */ }
        this.model = null;   // 載入過的模型（失敗了下次再試）
    }

    setEnabled(on) {
        this.enabled = !!on && this.available;
        try { localStorage.setItem(KEY, this.enabled ? '1' : '0'); } catch (err) { /* 存不了：這次有效 */ }
    }

    // 請 Gemini 給建議：回傳句子陣列；失敗時丟出錯誤（failureOf 看原因）
    async advise(facts) {
        if (!this.enabled) throw Object.assign(new Error('AI 教練沒有打開'), { code: 'off' });
        if (!this.model) {
            this.model = this.load(this.config);
            this.model.catch(() => { this.model = null; });
        }
        const result = await withTimeout((async () => {
            const model = await this.model;
            const res = await model.generateContent(coachPrompt(facts));
            return res.response.text();
        })(), this.timeoutMs);
        const lines = checkReply(result);
        if (!lines) throw Object.assign(new Error('AI 教練的回答不能用：' + String(result).slice(0, 80)), { code: 'bad-reply' });
        return lines;
    }
}

export const aiCoach = new AiCoach();
