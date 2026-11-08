// AI 全自動（11/9）：不用選動作，AI 自動辨識動作（activity.js）認出你在做什麼，就自動換過去開始計次；換動作也跟著換
// 這裡只決定「什麼時候換、換成什麼、從哪一格開始重算」，main.js 照著做（換動作、把最近幾秒的骨架交給新的動作重算）
//
// 什麼時候換：畫面上 AI 猜的動作（ActivityDisplay：連續猜到 2 次才換上去）是另一個動作，而且穩定一段時間：
//   自由模式（還沒在數）1.5 秒；已經在數別的動作 3 秒（真的換動作中間會停一下；棒式起身、趴下去那幾秒常被猜成伏地挺身，
//   合成受測者 K 的棒式最後起身時被猜成伏地挺身約 2 秒，等 1.5 秒就會誤換）
//   站著、還不確定都不換（兩下之間站直休息很正常）；錄製中不換（錄製檔只記一個動作，換了重播會算錯）
// 為什麼要重算：AI 看最近 3 秒才猜得出來，再等一下確定，認出來時已經做了 1～2 下。
//   所以留最近 8 秒的骨架，換過去時從這個動作大概開始的時候交給新的動作重算，認出來之前做的那幾下也算
//   從哪裡開始：畫面上第一次出現這個動作時，AI 看的是前 3 秒（再加一次猜的間隔 0.5 秒）
//   11/7 試過（合成受測者 K、I、J）：深蹲、伏地挺身、弓箭步從自由模式開始，每一下都數到（和一開始就選對的一樣多）
// 同一下不能兩個動作都算（11/8 保養，dropRecounted）：AI 還沒認出換了動作的那幾秒，原本的動作照樣在數
//   （深蹲、弓箭步都是彎膝蓋：示範動畫弓箭步接深蹲，深蹲的前 2 下也被數成弓箭步），新的動作又重算一次。
//   換過去時，原本的動作拿掉「新的動作重算的第一格之後才開始的」那幾下，留給新的動作算；
//   新的動作重算時一下都沒數到（例如 AI 認錯動作、新的動作還沒開始做）、換成棒式時不拿，原本的動作數到的不會不見
//   （11/8 試過 38 種換法：示範動畫深蹲、弓箭步、伏地挺身兩兩互換，中間停 0～6 秒；合成受測者 K、I、J：沒有一種變差，
//   深蹲、弓箭步互換本來前一個多 2 下，改了都對）。
//   以前（11/9）的做法是重算不早於 AI 最後一次猜成原本那個動作的時候，但首頁沒有照做；同樣 38 種換法試過反而比較常漏掉新動作的第一下，拿掉
import { WINDOW_MS, STEP_MS } from './activity.js';
import { isWorkout } from './workouts.js';
import { WorkoutTracker } from './tracker.js';

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
        this.candidate = null;  // 畫面上是另一個動作：哪一個、從什麼時候開始
        this.since = 0;
    }

    // 每一格呼叫：processed（pipeline 的結果，沒有人時 null）、now（這一格的時間）、
    //   shown（ActivityDisplay.update 的結果：畫面上的 { label, confidence } 或 null）、current（現在的動作）、canSwitch（錄製中 false）
    // 回傳 null（不換），或 { workout（換成哪個）, from（從什麼時候開始重算）, frames（要重算的格子，照時間順序） }
    update(processed, now, shown, current, canSwitch) {
        this.frames.push({ processed, now });
        while (this.frames.length && now - this.frames[0].now > BACKFILL_MS) this.frames.shift();
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
        const from = this.since - LEAD_MS;
        const out = { workout: label, from, frames: this.frames.filter(f => f.now >= from) };
        this.reset();
        return out;
    }

    // 畫面上寫「你在做深蹲，馬上開始數」：還在等穩定的那個動作，沒有時 null
    get pending() {
        return this.candidate;
    }
}

// 換過去時（main.js、auto-segments.js 都在換動作、存好原本的動作之前呼叫）：原本的動作（tracker）拿掉新的動作會重算到的那幾下
// （change.frames 第一格之後才開始的），回傳拿掉幾下。change.frames 先給新的動作數一次（和換過去之後重算的一樣）：
// 一下都沒數到就不拿（例如 AI 認錯動作：11/8 的長時間測試，弓箭步做完站著時被認成伏地挺身，換過去又換回深蹲）；新的動作是棒式也不拿（一次是撐著的一段時間，不是一下）
export function dropRecounted(tracker, change) {
    if (!change.frames.length) return 0;
    const next = new WorkoutTracker(change.workout);
    if (next.workout.kind !== 'reps') return 0;
    for (const f of change.frames) next.update(f.processed, f.now);
    return next.items.length ? tracker.dropFrom(change.frames[0].now) : 0;
}
