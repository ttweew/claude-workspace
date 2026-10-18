// 語音提醒：用瀏覽器內建的語音（不用下載、不用連網、不花錢）唸出動作錯誤和次數
// 人站在 2～3 公尺外運動時看不清楚螢幕上的字，用聽的最快
// 音量跟著工具列的「音量」（關、小、中、大）；關的時候不唸；首頁「進階設定」也可以只關掉語音（保留嗶聲）
// 不要一直講：同一句話 6 秒內不重複；正在講話時，次數這種不重要的話就跳過，錯誤提醒會等上一句講完再講

const VOLUME = { off: 0, low: 0.4, mid: 0.75, high: 1 };
const REPEAT_MS = 6000;
const STUCK_MS = 15000;   // 一直在「講話中」超過這麼久：瀏覽器的語音卡住了（有些 Android 手機切到背景再回來會這樣），清掉重來
const KEY = 'voiceOn';

export class Voice {
    // getLevel()：目前的音量（'off'、'low'、'mid'、'high'）
    constructor(getLevel) {
        this.getLevel = getLevel;
        this.lastSaid = new Map();   // 每句話上次唸的時間
        this.lastStart = -Infinity;  // 最近一次開始講的時間（看語音有沒有卡住）
        this.enabled = true;         // 進階設定的語音開關（預設開，網站會記住）
        try { this.enabled = localStorage.getItem(KEY) !== '0'; } catch (err) { /* 不能讀就用預設 */ }
        this.voice = null;
        this.synth = typeof window !== 'undefined' && window.speechSynthesis ? window.speechSynthesis : null;
        if (this.synth) {
            const pick = () => {
                const voices = this.synth.getVoices();
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

    setEnabled(on) {
        this.enabled = on;
        try { localStorage.setItem(KEY, on ? '1' : '0'); } catch (err) { /* 不能存就不記 */ }
        if (!on) this.stop();
    }

    // important：錯誤提醒（排隊等前一句講完）；不重要的（次數）正在講話時就跳過
    say(text, important = false) {
        const volume = VOLUME[this.getLevel()] || 0;
        if (!this.synth || !this.enabled || !volume || !text) return false;
        const now = performance.now();
        if (now - (this.lastSaid.get(text) ?? -Infinity) < REPEAT_MS) return false;
        // 自我修復：最後一次開始講已經超過 15 秒，瀏覽器還說在講話中，代表卡住了；不清掉的話之後每一句都會被跳過
        if ((this.synth.speaking || this.synth.pending) && now - this.lastStart > STUCK_MS) this.synth.cancel();
        if (!important && (this.synth.speaking || this.synth.pending)) return false;
        // 錯誤提醒最多排一句：還有沒唸的就換成這一句（舊的錯誤可能已經改正了）
        if (important && this.synth.pending) this.synth.cancel();
        try {
            const u = new SpeechSynthesisUtterance(text);
            u.lang = 'zh-TW';
            if (this.voice) u.voice = this.voice;
            u.volume = volume;
            u.rate = 1.1;
            this.synth.speak(u);
            this.lastSaid.set(text, now);
            this.lastStart = now;
            return true;
        } catch (err) {
            return false;  // 不支援就算了，畫面上的提示照常
        }
    }

    // 關鏡頭、換動作時：把還沒唸完的取消
    stop() {
        if (this.synth) this.synth.cancel();
        this.lastSaid.clear();
    }
}
