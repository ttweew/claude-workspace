// 講話：用瀏覽器內建的語音（不用下載、不用連網、不花錢）
// 人站在 2～3 公尺外運動時看不清楚螢幕上的字，用聽的最快
// 什麼時候講、講哪一句由 js/ui/speech-plan.js 決定；這裡只負責發出聲音、記住使用者選的模式
// 音量跟著工具列的「音量」（關、小、中、大）；關的時候不講

import { VOICE_MODES } from './speech-plan.js';

const VOLUME = { off: 0, low: 0.4, mid: 0.75, high: 1 };
const STUCK_MS = 15000;   // 一直在「講話中」超過這麼久：瀏覽器的語音卡住了（有些 Android 手機切到背景再回來會這樣），清掉重來
const MODE_KEY = 'voiceMode';
const OLD_KEY = 'voiceOn';   // 10/19 以前的開關：'0' 是關掉語音

// 首頁「語音提示」選的模式（完整、只講錯誤、不講話）；存的值不認得（被改過）就用預設的「完整」
export function loadVoiceMode() {
    try {
        const saved = localStorage.getItem(MODE_KEY);
        if (VOICE_MODES.includes(saved)) return saved;
        if (localStorage.getItem(OLD_KEY) === '0') return 'off';
    } catch (err) { /* 不能讀就用預設 */ }
    return 'full';
}

export function saveVoiceMode(mode) {
    try { localStorage.setItem(MODE_KEY, mode); } catch (err) { /* 不能存就不記 */ }
}

export class Voice {
    // getLevel()：目前的音量（'off'、'low'、'mid'、'high'）
    constructor(getLevel) {
        this.getLevel = getLevel;
        this.lastStart = -Infinity;  // 最近一次開始講的時間（看語音有沒有卡住）
        this.onIdle = null;          // 講完一句時呼叫（排隊的下一句就可以接著講）
        this.voice = null;
        this.synth = typeof window !== 'undefined' && window.speechSynthesis ? window.speechSynthesis : null;
        if (this.synth) {
            const pick = () => {
                const voices = this.synth.getVoices() || [];
                // 優先用台灣中文，沒有就用其他中文
                this.voice = voices.find(v => /zh[-_]TW/i.test(v.lang)) || voices.find(v => /^zh/i.test(v.lang)) || null;
            };
            pick();
            if (this.synth.addEventListener) this.synth.addEventListener('voiceschanged', pick);
        }
    }

    get supported() {
        return !!this.synth;
    }

    // 找得到中文的聲音：站位、倒數要靠講的才知道怎麼做，找不到中文聲音時（預設的英文聲音唸不出中文）改用嗶聲
    get chinese() {
        return !!this.voice;
    }

    // iPhone（Safari）要在使用者按按鈕的當下先講過一次，之後在別的時候（偵測到錯誤時）才講得出來：
    // 按「開啟鏡頭」時唸一個空白、音量 0（聽不到）
    unlock() {
        if (!this.synth || this.unlocked) return;
        this.unlocked = true;
        try {
            const u = new SpeechSynthesisUtterance(' ');
            u.volume = 0;
            this.synth.speak(u);
        } catch (err) { /* 不支援就算了 */ }
    }

    // 正在講話（或還有排在瀏覽器裡沒講完的）
    get busy() {
        if (!this.synth) return false;
        const busy = this.synth.speaking || this.synth.pending;
        // 自我修復：最後一次開始講已經超過 15 秒，瀏覽器還說在講話中，代表卡住了；不清掉的話之後每一句都講不出來
        if (busy && performance.now() - this.lastStart > STUCK_MS) {
            this.synth.cancel();
            return false;
        }
        return busy;
    }

    // 開始講一句（排隊、優先順序由 speech-plan.js 處理）；音量關掉、不支援時回傳 false
    speak(text) {
        const volume = VOLUME[this.getLevel()] || 0;
        if (!this.synth || !volume || !text) return false;
        try {
            const u = new SpeechSynthesisUtterance(text);
            u.lang = 'zh-TW';
            if (this.voice) u.voice = this.voice;
            u.volume = volume;
            u.rate = 1.1;
            u.onend = u.onerror = () => { if (this.onIdle) this.onIdle(); };
            this.synth.speak(u);
            this.lastStart = performance.now();
            return true;
        } catch (err) {
            return false;  // 不支援就算了，畫面上的提示照常
        }
    }

    // 關鏡頭、換動作、改成不講話時：把還沒講完的取消
    stop() {
        if (this.synth) this.synth.cancel();
    }
}
