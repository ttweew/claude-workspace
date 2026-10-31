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

// 檢查 Gemini 的回答（10/31 保養：「回答怪怪的」改用固定句子）
// 先整理：去掉列點的符號（「- 」「1. 」）、粗體的星號、標題的井號、表情符號（規則說不要，模型偶爾還是會加）
// 再檢查，不能用的原因（replyProblem 回傳）：
//   link 有網址；english 英文太多（英文的字母超過三成）；empty 空的、太短（不到 6 個中文字）；long 太長；
//   simplified 簡體字（「这、们、说…」這種只有簡體才有的字出現 2 個以上；畫面上其他地方都是繁體）；
//   number 數字對不起來（模型自己編的，例如只做了 6 下卻說「做了 12 下」）。可以的數字：給它的話裡有的（四捨五入到整數也算，
//     例如 2.6 秒說成約 3 秒）、5 以下的小數字（「多做 2 下」）、第幾下（不超過這組的次數）
// 分句不用「往回看」的正規表示式（(?<=…)）：iPhone 的 iOS 16.4 以前看不懂，整個網頁的程式會載不起來（網站支援 iOS 15 以上）
const SIMPLIFIED = '这个们说动时为么过会还进现发开关问门长见对没样来难让体势稳节练习弯盖续层';
export function cleanReply(text) {
    return String(text)
        .replace(/\p{Extended_Pictographic}️?/gu, '')
        .replace(/\*\*|__/g, '')
        .split('\n').map(line => line.replace(/^\s*(#+|[-*•・]|\d+[.、)）])\s*/, '').trim()).join('\n')
        .trim();
}
// 給 Gemini 的話裡出現的每一個數字（規則、這組的數字），和它們四捨五入到整數
function knownNumbers(f) {
    const out = new Set();
    for (const n of coachPrompt(f).match(/\d+(\.\d+)?/g) || []) {
        out.add(String(Number(n)));
        out.add(String(Math.round(Number(n))));
    }
    return out;
}
export function replyProblem(text, facts = null) {
    if (typeof text !== 'string') return 'empty';
    const t = cleanReply(text);
    const cjk = (t.match(/[一-鿿]/g) || []).length;
    const latin = (t.match(/[A-Za-z]/g) || []).length;
    // 先看網址、英文，再看長短：整段英文的回答中文字是 0，要說「英文」不是「太短」
    if (/https?:|www\./i.test(t)) return 'link';
    if (latin / (latin + cjk) > 0.3) return 'english';
    if (cjk < 6) return 'empty';
    if (t.length > AI_COACH.maxChars) return 'long';
    if ([...t].filter(ch => SIMPLIFIED.includes(ch)).length >= 2) return 'simplified';
    if (facts) {
        const known = knownNumbers(facts);
        const count = Number.isInteger(facts.count) ? facts.count : 0;
        const bad = (t.match(/\d+(\.\d+)?/g) || []).map(Number).find(n => n > 5 && !known.has(String(n)) && !(Number.isInteger(n) && n <= count));
        if (bad !== undefined) return 'number';
    }
    return null;
}
// 回傳整理好的句子（陣列，最多 3 句、重複的拿掉），不能用時回傳 null
//   列點的句子常常沒有句號：補上「。」，唸的時候（句子接在一起唸）才會停一下
export function checkReply(text, facts = null) {
    if (replyProblem(text, facts)) return null;
    const lines = cleanReply(text).replace(/([。！？!?])/g, '$1\n').split(/\n+/).map(s => s.trim()).filter(Boolean)
        .map(s => (/[。！？!?]$/.test(s) ? s : s + '。'));
    return [...new Set(lines)].slice(0, AI_COACH.maxLines);
}

// 為什麼沒用到 AI（給使用者看的一句話；都會改用固定句子）
export const FAILURE_TEXT = {
    offline: '沒有網路，先用固定的建議',
    disabled: 'AI 教練還沒開通（Firebase 主控台要先開 AI Logic），先用固定的建議',
    timeout: 'AI 教練超過 10 秒沒回答，先用固定的建議',
    busy: 'AI 教練現在太忙（免費的用量用完了），先用固定的建議',
    model: 'AI 教練用的模型要更新（Google 換了新的模型），先用固定的建議',
    'bad-reply': 'AI 教練的回答怪怪的，先用固定的建議',
    error: 'AI 教練暫時連不上，先用固定的建議'
};

// 錯誤 → 原因（FAILURE_TEXT 的鍵）；Firebase AI 的錯誤代號見 firebase-ai.js 的 AIErrorCode，HTTP 狀態碼在 customErrorData.status
//   429：免費方案每分鐘、每天的用量用完了（Google 回 RESOURCE_EXHAUSTED）
//   404：模型名稱 Google 不認得了（停用、改名），要改 config.js 的 AI_MODEL
//   response-error：Google 擋下這次的回答（安全規則）或回答是空的
export function failureOf(err) {
    const code = err && err.code;
    const status = err && err.customErrorData && err.customErrorData.status;
    if (code === 'timeout' || code === 'bad-reply' || code === 'offline') return code;
    if (code === 'api-not-enabled') return 'disabled';
    if (status === 429) return 'busy';
    if (status === 404) return 'model';
    if (code === 'response-error') return 'bad-reply';
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
        // 明顯沒有網路：不用等 10 秒，直接用固定句子（10/31 保養）
        if (typeof navigator !== 'undefined' && navigator.onLine === false) throw Object.assign(new Error('沒有網路'), { code: 'offline' });
        if (!this.model) {
            const loading = this.load(this.config);
            this.model = loading;
            loading.then(() => { loading.done = true; }, () => { if (this.model === loading) this.model = null; });
        }
        const loading = this.model;
        let result;
        try {
            result = await withTimeout((async () => {
                const model = await loading;
                const res = await model.generateContent(coachPrompt(facts));
                return res.response.text();
            })(), this.timeoutMs);
        } catch (err) {
            // 載入 Firebase 的程式卡住（10/31 保養）：下次重新載入，不要一直等同一個卡住的
            if (err.code === 'timeout' && !loading.done && this.model === loading) this.model = null;
            throw err;
        }
        const why = replyProblem(result, facts);
        if (why) throw Object.assign(new Error('AI 教練的回答不能用（' + why + '）：' + String(result).slice(0, 80)), { code: 'bad-reply', why });
        return checkReply(result, facts);
    }
}

export const aiCoach = new AiCoach();
