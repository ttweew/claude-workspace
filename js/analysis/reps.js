// 計算次數、計時（深蹲、弓箭步、伏地挺身、棒式共用）
//
// RepCounter：看一個角度（膝蓋、手肘…）「伸直 → 彎下去 → 再伸直」算一下
//   伸直和「有彎下去」用兩個不同的門檻，角度在門檻附近抖動時才不會多算；太快（不到 0.5 秒）的不算，通常是偵測跳動
//   深蹲、弓箭步太淺又太快（不到 0.8 秒）的也不算：通常是換姿勢（轉身、兩下之間很快的小蹲）
//   每一下記錄最小的角度，判斷深度：≤ good 到位、≤ close 再低一點、更大是太淺
//   只在側面、斜側面拍時計算：正面拍的角度誤差太大（見 view.js），會提示使用者側身
// HoldTimer：趴好就算開始這一次（棒式），姿勢對（一直線）的時候才計時；姿勢跑掉時暫停，起身就結束這一次

import { P, isVisible, clearerSide } from '../skeleton/landmarks.js';

export const REP_DEFAULTS = {
    minRepMs: 500,    // 一下至少要這麼久（伏地挺身：10/20 實測受測者 B 故意屁股太高時一下只要 0.67 秒）
    lostMs: 1500,     // 看不到人（或那個角度）超過這麼久，這一下作廢，重新從伸直開始
    frontMs: 700,     // 判斷成正面拍持續這麼久，才作廢這一下、提示側身（短暫跳一下不算）
    positionMs: 700   // 姿勢不對（例如伏地挺身沒有趴下）持續這麼久才作廢這一下
};

export function depthOf(min, config) {
    return min <= config.good ? 'good' : min <= config.close ? 'close' : 'shallow';
}

// 身體和地面的夾角（度）：0 是躺平（伏地挺身、棒式），90 是站直；看不到肩膀或髖部時回傳 null
// 用看得比較清楚那一側的肩、髖（側面拍時兩側幾乎重疊）
export function bodyTilt(landmarks, width, height, side = clearerSide(landmarks)) {
    const s = landmarks[P[side + '_SHOULDER']], h = landmarks[P[side + '_HIP']];
    if (!isVisible(s) || !isVisible(h)) return null;
    const dx = Math.abs(s.x - h.x) * width, dy = Math.abs(s.y - h.y) * height;
    if (dx + dy < 1) return null;
    return Math.atan2(dy, dx) * 180 / Math.PI;
}

// 選一側的角度（和大字儀表板同一側：靠近鏡頭、看得比較清楚的那側）；那一側算不出來時用另一側
// counter.side 會記住目前用哪一側，兩側差不多清楚時不會一直換
export function clearerAngle(pose, counter, joint) {
    counter.side = clearerSide(pose.landmarks, counter.side);
    const other = counter.side === 'LEFT' ? 'RIGHT' : 'LEFT';
    const a = pose.angles[counter.side + '_' + joint];
    return a !== null && a !== undefined ? a : pose.angles[other + '_' + joint] ?? null;
}

// config：{ up, down, good, close, metric(pose, counter), aux(pose, counter)?, position(pose)?, shallowMs?, frontPrompt, decorate(rep)? }
//   up：角度 ≥ 這個算伸直；down：≤ 這個才算有彎下去；good／close：判斷深度
//   shallowMs：太淺又不到這麼久的一下不算，可省略（見 SHALLOW_QUICK_MS）
//   metric：這一格要看的角度（算不出來回傳 null）；aux：另外記錄最小值的角度（例如深蹲的髖部），可省略
//   position：姿勢對不對（例如伏地挺身要趴下），不對時回傳提示文字，可省略
export class RepCounter {
    constructor(config) {
        this.config = { ...REP_DEFAULTS, ...config };
        this.reset();
    }

    reset() {
        this.reps = [];           // 每一下：{ n, start, bottom, end（秒）, min, minAux, depth, oblique }
        this.state = 'wait';      // wait：等伸直；stand：伸直；down：彎下去中（還沒到 down）；squat：已經彎夠
        this.side = 'LEFT';
        this.current = null;      // 進行中的這一下
        this.lastSeen = null;
        this.frontSince = null;   // 從什麼時候開始判斷成正面拍
        this.offSince = null;     // 從什麼時候開始姿勢不對
        this.lastTop = null;      // 最近一格伸直的角度 { t, v }：每一下的曲線從這裡開始（算動作相似度用）
    }

    // pose：pipeline.process 的結果（沒有人時為 null）；timeMs：時間
    // 回傳 { reps（次數）, state, value（現在的角度）, prompt（要提醒的話）, promptKind（'warn' 要使用者調整、'' 只是說明）, rep（這一格剛完成的一下） }
    update(pose, timeMs) {
        const c = this.config;
        const out = { reps: this.reps.length, state: this.state, value: null, prompt: null, promptKind: '', rep: null };
        const value = pose ? c.metric(pose, this) : null;
        if (value === null) {
            // 暫時看不到（例如手擋住、偵測跳一下）先等等；太久就作廢這一下
            if (this.lastSeen !== null && timeMs - this.lastSeen > c.lostMs) this.abandon();
            out.state = this.state;
            return out;
        }
        out.value = value;
        // 中間隔太久沒看到人（例如手機切到背景、AI 重新啟動，這段時間完全沒有畫面進來）：那一下作廢
        if (this.lastSeen !== null && timeMs - this.lastSeen > c.lostMs) this.abandon();
        const view = pose.view.view;
        // 正面拍：角度不準，不計算。要持續 frontMs 才作廢這一下並提示側身：
        // 斜側面（約 30°）在分界附近，偶爾一個關節跳一下就會短暫被判斷成正面，以前會把正在做的這一下整個作廢、漏算
        if (view === 'front') {
            const before = this.state;
            if (this.frontSince === null) this.frontSince = timeMs;
            const front = timeMs - this.frontSince >= c.frontMs;
            // 已經在側面彎到底（最小的角度量好了），起身時轉成正面：伸直了就算這一下
            // 伸直不管從哪個方向拍都看得出來；第一次真實錄影有人蹲完轉身面向手機，以前這一下會被作廢
            // 正面拍的角度不拿來更新最小角度，也不會因為正面而開始新的一下
            // 只限站著做的動作（沒有 position，例如深蹲）：伏地挺身做完起身時（已經不是趴著）常常轉成正面、手撐一下地，
            // 10/20 實測受測者 B 的兩組都因此多算一下；伏地挺身轉成正面拍時照舊等 frontMs 作廢
            const cur = this.current;
            if (cur && cur.reachedDown && !c.position) {
                this.lastSeen = timeMs;
                // 伸直了：這一下結束。太快的作廢，和側面拍一樣（見 counts）；
                // 以前正面時太快的會留著，等夠久再伸直一次才算（教練影片 2 轉場時 0.5 秒亂掉的骨架因此被算成一下）
                if (value >= c.up) {
                    if (this.counts(cur, timeMs)) out.rep = this.finish(timeMs);
                    this.abandon();
                    out.reps = this.reps.length;
                }
            } else if (front) {
                this.abandon();
            }
            // 站直不管從哪個方向拍都看得出來：沒有進行中的一下時，正面拍的格子站直也記成站直（只改狀態，不開始新的一下、不量深度）
            // 10/19 教練影片：斜側面（約 45°）拍時，站直的那幾格常被判斷成正面，網站一直等站直，下一下就沒算（一段影片漏 2 下）
            // 本來站直、還沒明顯蹲下去（角度 > down）時維持站直；正面拍時蹲下去就不算站直，要回到側面站直再開始（深度量不到）
            // 記成站直時也算「看到人」：正面拍超過 1.5 秒再轉回側面時，才不會被當成看不到人太久而作廢
            if (!this.current && (value >= c.up || (before === 'stand' && value > c.down))) {
                this.state = 'stand';
                this.lastSeen = timeMs;
                if (value >= c.up) this.lastTop = { t: timeMs, v: value };
            }
            if (front) {
                out.prompt = c.frontPrompt;
                out.promptKind = 'warn';
            }
            out.state = this.state;
            return out;
        }
        this.frontSince = null;
        if (view === null) {
            out.state = this.state;
            return out;
        }
        this.lastSeen = timeMs;
        // 姿勢不對（例如伏地挺身還站著）：不是做錯，只說明怎麼開始；持續 positionMs 才作廢進行中的這一下
        const off = c.position ? c.position(pose) : null;
        if (off) {
            if (this.offSince === null) this.offSince = timeMs;
            if (timeMs - this.offSince >= c.positionMs) {
                this.abandon();
                out.prompt = off;
            }
            out.state = this.state;
            return out;
        }
        this.offSince = null;
        const aux = c.aux ? c.aux(pose, this) : null;

        if (value >= c.up) {
            if (this.current && this.current.reachedDown && this.counts(this.current, timeMs)) {
                this.current.samples.push({ t: timeMs, v: value });
                out.rep = this.finish(timeMs);
            }
            this.current = null;
            this.state = 'stand';
            this.lastTop = { t: timeMs, v: value };
        } else if (this.state === 'stand' || this.state === 'down' || this.state === 'squat') {
            if (!this.current) {
                this.current = { start: timeMs, min: value, minAux: aux, bottom: timeMs, reachedDown: false, views: new Set(),
                    samples: this.lastTop ? [this.lastTop] : [] };
            }
            const cur = this.current;
            cur.views.add(view);
            cur.samples.push({ t: timeMs, v: value });
            if (value < cur.min) {
                cur.min = value;
                cur.bottom = timeMs;
            }
            if (aux !== null && (cur.minAux === null || aux < cur.minAux)) cur.minAux = aux;
            if (value <= c.down) cur.reachedDown = true;
            this.state = cur.reachedDown ? 'squat' : 'down';
        }
        out.reps = this.reps.length;
        out.state = this.state;
        return out;
    }

    // 這一下夠不夠久、可以算：不到 minRepMs 的不算（通常是偵測跳動）；
    // 有設 shallowMs 的動作（深蹲、弓箭步），太淺又不到 shallowMs 的也不算（換姿勢，見 SHALLOW_QUICK_MS）
    counts(cur, timeMs) {
        const c = this.config, ms = timeMs - cur.start;
        if (ms < c.minRepMs) return false;
        return !(c.shallowMs && ms < c.shallowMs && depthOf(cur.min, c) === 'shallow');
    }

    finish(timeMs) {
        const cur = this.current;
        const rep = {
            n: this.reps.length + 1,
            start: cur.start / 1000,
            bottom: cur.bottom / 1000,
            end: timeMs / 1000,
            min: cur.min,
            minAux: cur.minAux,
            depth: depthOf(cur.min, this.config),
            // 這一下有沒有斜側面拍的格子（角度誤差約 10°，僅供參考）
            oblique: cur.views.has('oblique'),
            // 這一下的角度曲線（算動作相似度用，見 similarity.js；算完就丟掉）
            samples: cur.samples
        };
        if (this.config.decorate) this.config.decorate(rep);
        this.reps.push(rep);
        return rep;
    }

    // 這一下作廢（看不到人太久、轉成正面拍、姿勢不對），要重新伸直才開始算
    abandon() {
        this.current = null;
        this.state = 'wait';
    }

    // 鏡頭中斷（換每秒格數、換鏡頭時會重開鏡頭）：進行中的這一下作廢，已經做完的保留
    interrupt() {
        this.abandon();
        this.lastSeen = null;
        this.frontSince = null;
        this.offSince = null;
    }
}

// 站著做的動作（深蹲、弓箭步）：太淺又不到這麼久的一下不算
// 10/20 實測 A、B 的深蹲、弓箭步 120 下真的動作，最快 1.02 秒；多算的 3 下都是換姿勢（倒數完從正面轉成側面、兩下之間很快的小蹲），
// 0.55～0.62 秒，而且都太淺（膝蓋 129～139°）。只看秒數擋不行：快速深蹲（下去、起來各 0.5 秒）一下只要 0.67～0.70 秒，
// 但是蹲得深，要算到（深蹲的測試；10/21 先試過「一律不到 0.8 秒不算」，這個測試沒過）
// 取 0.62 和 1.02 中間的 0.8 秒；蹲到「再低一點」以上的照舊只要 0.5 秒（minRepMs）
export const SHALLOW_QUICK_MS = 800;

export const HOLD_DEFAULTS = {
    graceMs: 1000,   // 姿勢跑掉不到這麼久：畫面上還是「撐住中」（偵測跳一下不會一直閃），但這段時間不算秒數
    endMs: 3000,     // 起身（不是趴著）超過這麼久：這一次結束
    minHoldMs: 3000, // 趴不到這麼久的不記成一次（例如剛趴下就起來）
    frontMs: 700,
    lostMs: 1500,
    maxStepMs: 200   // 兩格之間最多算這麼久（中間漏掉的畫面不算秒數）
};

// config：{ position(pose)（不對時回傳提示文字）, good(pose)（姿勢對時回傳 true）, frontPrompt }
export class HoldTimer {
    constructor(config) {
        this.config = { ...HOLD_DEFAULTS, ...config };
        this.reset();
    }

    reset() {
        this.holds = [];          // 每一次：{ n, start, end（秒）, seconds }
        this.current = null;      // 這一次：{ start, ms（一直線、有計時的毫秒）, lyingMs（趴著的毫秒） }
        this.lastGood = null;
        this.lastLying = null;
        this.lastTime = null;
        this.offSince = null;     // 從什麼時候開始沒有趴著
        this.frontSince = null;
    }

    get best() {
        return this.holds.reduce((m, h) => Math.max(m, h.seconds), this.current ? this.current.ms / 1000 : 0);
    }

    // 回傳 { seconds（這一次撐了幾秒）, holding（現在姿勢對、正在計時）, prompt, promptKind, hold（這一格剛結束的一次） }
    update(pose, timeMs) {
        const c = this.config;
        const dt = this.lastTime === null ? 0 : Math.min(Math.max(timeMs - this.lastTime, 0), c.maxStepMs);
        this.lastTime = timeMs;
        const out = { seconds: 0, holding: false, prompt: null, promptKind: '', hold: null };
        let good = false;
        const view = pose ? pose.view.view : null;
        if (view === 'front') {
            if (this.frontSince === null) this.frontSince = timeMs;
            if (timeMs - this.frontSince >= c.frontMs) {
                out.prompt = c.frontPrompt;
                out.promptKind = 'warn';
            }
        } else {
            this.frontSince = null;
        }
        if (pose && view !== null && view !== 'front') {
            const off = c.position(pose);
            if (off) {
                if (this.offSince === null) this.offSince = timeMs;
                // 起身超過 endMs：這一次結束；還沒開始撐就說明怎麼開始
                if (this.current && timeMs - this.offSince >= c.endMs) out.hold = this.end(timeMs);
                if (!this.current) out.prompt = off;
            } else {
                // 趴好了：這一次開始（還沒一直線也算，只是不計時）
                // 以前要一直線才開始：10/20 實測受測者 B 故意屁股太高的那組一直沒開始，紀錄裡沒有這一次（畫面上有紅字）
                this.offSince = null;
                good = c.good(pose);
                if (!this.current) this.current = { start: timeMs, ms: 0, lyingMs: 0 };
                else this.current.lyingMs += dt;
                this.lastLying = timeMs;
            }
        } else if (this.current && this.lastLying !== null && timeMs - this.lastLying > c.endMs + c.lostMs) {
            // 很久看不到人：這一次結束
            out.hold = this.end(timeMs);
        }
        if (good) {
            if (this.lastGood !== null && timeMs - this.lastGood <= c.graceMs) this.current.ms += dt;
            this.lastGood = timeMs;
        }
        out.holding = !!this.current && this.lastGood !== null && timeMs - this.lastGood <= c.graceMs;
        out.seconds = this.current ? this.current.ms / 1000 : 0;
        return out;
    }

    // 鏡頭中斷：撐到現在的這一次算結束（撐夠久才記）
    interrupt() {
        const hold = this.current ? this.end(this.lastTime ?? 0) : null;
        this.lastTime = null;
        this.offSince = null;
        this.frontSince = null;
        return hold;
    }

    end(timeMs) {
        const cur = this.current;
        this.current = null;
        this.lastGood = null;
        this.lastLying = null;
        if (cur.lyingMs < this.config.minHoldMs) return null;
        const hold = { n: this.holds.length + 1, start: cur.start / 1000, end: timeMs / 1000, seconds: cur.ms / 1000 };
        this.holds.push(hold);
        return hold;
    }
}
