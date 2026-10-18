// 提示音（老師 10/12 回饋：人站遠、做動作時看不到螢幕）
// 入鏡提示（離開畫面、站位不對、站好了）、錄製倒數與提醒，全部共用同一個音量：關、小、中、大
// 用 Web Audio 產生簡單的嗶聲，不用下載音檔。瀏覽器規定網頁要先被點過才能發出聲音，
// 所以開鏡頭、按音量按鈕時都會呼叫 unlock()

export const LEVELS = ['off', 'low', 'mid', 'high'];
export const LEVEL_NAMES = { off: '關', low: '小', mid: '中', high: '大' };
const GAIN = { off: 0, low: 0.05, mid: 0.2, high: 0.6 };
const STORAGE_KEY = 'soundLevel';

// 每種聲音：一串音，f 頻率（Hz）、d 長度（秒）、gap 和下一個音之間空多久（秒）
// 三種入鏡提示的高低、次數都不同，聽一下就知道是哪一種
export const SOUNDS = {
    count: [{ f: 880, d: 0.12 }],                                                      // 錄製倒數每秒一聲
    long: [{ f: 1320, d: 0.45 }],                                                      // 開始錄製、錄滿、剩 30 秒
    away: [{ f: 440, d: 0.12, gap: 0.08 }, { f: 440, d: 0.12, gap: 0.08 }, { f: 440, d: 0.12 }],  // 逼逼逼：離開畫面（低音）
    wrong: [{ f: 660, d: 0.12, gap: 0.08 }, { f: 660, d: 0.12 }],                     // 逼逼：站位不對
    ok: [{ f: 1760, d: 0.4, bell: true }]                                               // 叮：站好了（高音、慢慢變小聲）
};

export class Sound {
    constructor() {
        this.ctx = null;
        this.level = 'mid';
        try {
            const saved = localStorage.getItem(STORAGE_KEY);
            if (LEVELS.includes(saved)) this.level = saved;
        } catch (err) { /* 不能讀就用預設 */ }
    }

    // 在使用者按按鈕的當下呼叫：建立或喚醒聲音（iPhone 一定要在按的當下才能出聲）
    unlock() {
        try {
            if (!this.ctx) this.ctx = new (window.AudioContext || window.webkitAudioContext)();
            if (this.ctx.state === 'suspended') this.ctx.resume();
        } catch (err) { /* 不支援就沒有聲音，其他功能照常 */ }
    }

    // 換下一段音量（關 → 小 → 中 → 大 → 關），試聽一聲並記住
    next() {
        this.level = LEVELS[(LEVELS.indexOf(this.level) + 1) % LEVELS.length];
        try { localStorage.setItem(STORAGE_KEY, this.level); } catch (err) { /* 不能存就不記 */ }
        this.unlock();
        this.play('ok');
        return this.level;
    }

    play(name) {
        const gain = GAIN[this.level];
        const tones = SOUNDS[name];
        if (!gain || !tones) return;
        try {
            if (!this.ctx) this.unlock();
            const ctx = this.ctx;
            if (!ctx) return;
            if (ctx.state === 'suspended') ctx.resume();
            let t = ctx.currentTime + 0.01;
            for (const tone of tones) {
                const osc = ctx.createOscillator(), g = ctx.createGain();
                osc.type = 'sine';
                osc.frequency.value = tone.f;
                g.gain.setValueAtTime(0.0001, t);
                g.gain.exponentialRampToValueAtTime(gain, t + (tone.bell ? 0.005 : 0.01));
                g.gain.exponentialRampToValueAtTime(0.0001, t + tone.d);
                osc.connect(g).connect(ctx.destination);
                osc.start(t);
                osc.stop(t + tone.d + 0.02);
                t += tone.d + (tone.gap || 0);
            }
        } catch (err) { /* 沒有聲音也沒關係 */ }
    }
}

// 入鏡提示要不要響、響哪一種：只在狀況改變時響，不會一直響
// 畫面上的提示本來就要持續 0.6 秒才會換（framing.js），AI 偶爾漏一格也不會跳提示，所以不會亂響
const AWAY_FIRST_MS = 1000;   // 離開畫面多久後第一次響
const AWAY_REPEAT_MS = 5000;  // 一直沒回來，每隔多久再提醒一次
const AWAY_TIMES = 3;         // 最多提醒幾次（休息、走開時不要一直響）
const WRONG_GAP_MS = 2000;    // 站位提示換來換去時，兩次「逼逼」至少隔這麼久

export class FramingSound {
    // play(name)：實際發出聲音的函式，例如 name => sound.play(name)
    constructor(play) {
        this.play = play;
        this.reset();
    }

    // 開鏡頭、關鏡頭時重新開始
    reset() {
        this.state = null;     // 上一個狀況：'ok' 站好了、'wrong' 站位不對、'away' 離開畫面
        this.text = null;      // 上一個站位提示的文字（換成別的提示時再響一次）
        this.seen = false;     // 開鏡頭後有沒有偵測到人過：還沒走進畫面前不算「離開畫面」
        this.awaySince = 0;
        this.awayCount = 0;
        this.lastWrong = -Infinity;
    }

    // category：'ok'、'wrong'、'away'，或 null（偵測中、腳被擋住這類不用使用者調整的提示，不算狀況改變）
    // text：畫面上顯示的提示文字；now：毫秒
    update(category, text, now) {
        if (!category) return;
        if (category === 'away') {
            if (this.state !== 'away') {
                this.state = 'away';
                this.awaySince = now;
                this.awayCount = 0;
            }
            if (this.seen && this.awayCount < AWAY_TIMES && now - this.awaySince >= AWAY_FIRST_MS + this.awayCount * AWAY_REPEAT_MS) {
                this.awayCount++;
                this.play('away');
            }
            return;
        }
        this.seen = true;
        if (category === 'wrong') {
            if ((this.state !== 'wrong' || this.text !== text) && now - this.lastWrong >= WRONG_GAP_MS) {
                this.lastWrong = now;
                this.play('wrong');
            }
            this.text = text;
        } else if (category === 'ok' && this.state !== 'ok') {
            this.play('ok');
        }
        this.state = category;
    }
}
