// AI 全自動（11/9）：不用選動作，AI 自動辨識動作（activity.js）認出你在做什麼，就自動換過去開始計次；換動作也跟著換
// 這裡只決定「什麼時候換、換成什麼、從哪一格開始重算」，main.js 照著做（換動作、把最近幾秒的骨架交給新的動作重算）
//
// 什麼時候換：畫面上 AI 猜的動作（ActivityDisplay：連續猜到 2 次才換上去）是另一個動作，而且穩定一段時間：
//   自由模式（還沒在數）1.5 秒；已經在數別的動作 3 秒（真的換動作中間會停一下；棒式起身、趴下去那幾秒常被猜成伏地挺身，
//   合成受測者 K 的棒式最後起身時被猜成伏地挺身約 2 秒，等 1.5 秒就會誤換）
//   站著、還不確定都不換（兩下之間站直休息很正常）；錄製中不換（錄製檔只記一個動作，換了重播會算錯）
// 為什麼要重算：AI 看最近 3 秒才猜得出來，再等一下確定，認出來時已經做了 1～2 下。
//   所以留最近 8 秒的骨架，換過去時從這個動作大概開始的時候交給新的動作重算，認出來之前做的那幾下也算
//   從哪裡開始：畫面上第一次出現這個動作時，AI 看的是前 3 秒（再加一次猜的間隔 0.5 秒）；
//   原本的動作已經數到東西（keep）時，不早於 AI 最後一次猜成原本那個動作的時候（之前的骨架是原本的動作，不能算兩次，
//   例如弓箭步換深蹲，不能把弓箭步算成深蹲）。原本的動作什麼都沒數到（剛開始被猜錯，例如棒式一開始被猜成伏地挺身）就不用管它
//   11/7 試過（合成受測者 K、I、J）：深蹲、伏地挺身、弓箭步從自由模式開始，每一下都數到（和一開始就選對的一樣多）
import { WINDOW_MS, STEP_MS } from './activity.js';
import { isWorkout } from './workouts.js';

export const AUTO_HOLD_MS = 1500;      // 自由模式（還沒在數）：畫面上的動作穩定 1.5 秒就開始數
export const SWITCH_HOLD_MS = 3000;    // 已經在數別的動作：穩定 3 秒才換
export const BACKFILL_MS = 8000;
const LEAD_MS = WINDOW_MS + STEP_MS;

// 可以自動換過去的：會計次、計時的動作（站著、自由模式不算）
const countable = label => typeof label === 'string' && label !== 'stand' && label !== 'free' && isWorkout(label);

export class AutoSwitch {
    constructor() {
        this.reset();
    }

    reset() {
        this.frames = [];       // 最近 8 秒的每一格 { processed, now }
        this.guesses = [];      // 最近 8 秒 AI 每 0.5 秒猜的 { t, label }
        this.candidate = null;  // 畫面上是另一個動作：哪一個、從什麼時候開始
        this.since = 0;
    }

    // 每一格呼叫：processed（pipeline 的結果，沒有人時 null）、now（這一格的時間）、
    //   guess（ActivityMeter.update 的結果：undefined 這一格沒猜、null 猜不出來、{ label, confidence }）、
    //   shown（ActivityDisplay.update 的結果：畫面上的 { label, confidence } 或 null）、current（現在的動作）、canSwitch（錄製中 false）、
    //   keep（現在的動作已經數到東西：做完的下數、棒式撐著）
    // 回傳 null（不換），或 { workout（換成哪個）, from（從什麼時候開始重算）, frames（要重算的格子，照時間順序） }
    update(processed, now, guess, shown, current, canSwitch, keep = false) {
        this.frames.push({ processed, now });
        while (this.frames.length && now - this.frames[0].now > BACKFILL_MS) this.frames.shift();
        if (guess !== undefined) this.guesses.push({ t: now, label: guess && guess.label ? guess.label : null });
        while (this.guesses.length && now - this.guesses[0].t > BACKFILL_MS) this.guesses.shift();
        const label = shown ? shown.label : null;
        if (!countable(label) || label === current) {
            this.candidate = null;
            return null;
        }
        if (this.candidate !== label) {
            this.candidate = label;
            this.since = now;
        }
        if (now - this.since < (countable(current) ? SWITCH_HOLD_MS : AUTO_HOLD_MS) || !canSwitch) return null;
        // 原本的動作數到東西了：重算從最後一次猜成原本那個動作之後開始
        const last = keep ? this.guesses.filter(g => g.label === current).pop() : null;
        const from = Math.max(this.since - LEAD_MS, last ? last.t : -Infinity);
        const out = { workout: label, from, frames: this.frames.filter(f => f.now >= from) };
        this.reset();
        return out;
    }

    // 畫面上寫「你在做深蹲，馬上開始數」：還在等穩定的那個動作，沒有時 null
    get pending() {
        return this.candidate;
    }
}
