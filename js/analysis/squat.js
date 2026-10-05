// 深蹲判斷（實驗中，網址加 ?lab=squat 才會出現）：計算次數、每一下蹲多深
//
// 怎麼算一下：先站直（膝蓋 ≥ 160°）→ 往下蹲到膝蓋 ≤ 140° → 再站直 → 算一下
//   站直和「有蹲下去」用兩個不同的門檻，角度在門檻附近抖動時才不會多算
//   太快（不到 0.5 秒）的不算，通常是偵測跳動
// 每一下記錄最低的膝蓋角度，判斷深度：
//   ≤ 90° 蹲到位、90～110° 再低一點、> 110° 太淺
//   90° 是很多健身 App 常用的門檻；大腿和地面平行時膝蓋約 60～70°。門檻之後要和老師討論再調整
// 只在側面、斜側面拍時計算：正面拍的膝蓋角度誤差太大（見 view.js），會提示使用者側身

import { clearerSide } from '../skeleton/landmarks.js';

export const SQUAT = {
    STAND: 160,       // 膝蓋 ≥ 這個角度算站直
    DOWN: 140,        // 膝蓋 ≤ 這個角度才算有蹲下去
    GOOD: 90,         // 最低膝蓋角度 ≤ 這個：蹲到位
    CLOSE: 110,       // ≤ 這個：再低一點；再大：太淺
    MIN_REP_MS: 500,  // 一下至少要這麼久
    LOST_MS: 1500,    // 看不到人（或膝蓋）超過這麼久，這一下作廢，重新從站直開始
    FRONT_MS: 700     // 判斷成正面拍持續這麼久，才作廢這一下、提示側身（短暫跳一下不算）
};

export const DEPTH_TEXT = { good: '蹲到位', close: '再低一點', shallow: '太淺' };

export function depthOf(minKnee) {
    return minKnee <= SQUAT.GOOD ? 'good' : minKnee <= SQUAT.CLOSE ? 'close' : 'shallow';
}

export class SquatCounter {
    constructor() {
        this.reset();
    }

    reset() {
        this.reps = [];           // 每一下：{ n, start, bottom, end（秒）, minKnee, minHip, depth, view }
        this.state = 'wait';      // wait：等站直；stand：站著；down：蹲下中（還沒到 140°）；squat：已經蹲夠深
        this.side = 'LEFT';
        this.current = null;      // 進行中的這一下
        this.lastSeen = null;
        this.frontSince = null;   // 從什麼時候開始判斷成正面拍
    }

    // pose：pipeline.process 的結果（沒有人時為 null）；timeMs：時間
    // 回傳 { reps（次數）, state, knee（現在的膝蓋角度）, prompt（要提醒使用者的話，沒有則為 null）, rep（這一格剛完成的一下，沒有則為 null） }
    update(pose, timeMs) {
        const out = { reps: this.reps.length, state: this.state, knee: null, prompt: null, rep: null };
        const knee = pose ? this.knee(pose) : null;
        if (knee === null) {
            // 暫時看不到（例如手擋住、偵測跳一下）先等等；太久就作廢這一下
            if (this.lastSeen !== null && timeMs - this.lastSeen > SQUAT.LOST_MS) this.abandon();
            out.state = this.state;
            return out;
        }
        out.knee = knee;
        // 中間隔太久沒看到人（例如手機切到背景、AI 重新啟動，這段時間完全沒有畫面進來）：那一下作廢
        if (this.lastSeen !== null && timeMs - this.lastSeen > SQUAT.LOST_MS) this.abandon();
        const view = pose.view.view;
        // 正面拍：膝蓋角度不準，不計算。要持續 FRONT_MS 才作廢這一下並提示側身：
        // 斜側面（約 30°）在分界附近，偶爾一個關節跳一下就會短暫被判斷成正面，以前會把正在蹲的這一下整個作廢、漏算
        if (view === 'front') {
            if (this.frontSince === null) this.frontSince = timeMs;
            // 已經在側面蹲到底（最低的角度量好了），起身時轉成正面：站直了就算這一下
            // 站直不管從哪個方向拍都看得出來；第一次真實錄影有人蹲完轉身面向手機，以前這一下會被作廢
            // 正面拍的角度不拿來更新最低角度，也不會因為正面而開始新的一下
            const c = this.current;
            if (c && c.reachedDown) {
                this.lastSeen = timeMs;
                if (knee >= SQUAT.STAND && timeMs - c.start >= SQUAT.MIN_REP_MS) {
                    out.rep = this.finish(timeMs);
                    this.abandon();
                    out.reps = this.reps.length;
                }
                if (timeMs - this.frontSince >= SQUAT.FRONT_MS) out.prompt = '請側身對著鏡頭，正面拍膝蓋角度不準';
                out.state = this.state;
                return out;
            }
            if (timeMs - this.frontSince >= SQUAT.FRONT_MS) {
                out.prompt = '請側身對著鏡頭，正面拍膝蓋角度不準';
                this.abandon();
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
        const hip = pose.angles[this.side + '_HIP'];

        if (knee >= SQUAT.STAND) {
            if (this.current && this.current.reachedDown && timeMs - this.current.start >= SQUAT.MIN_REP_MS) {
                out.rep = this.finish(timeMs);
            }
            this.current = null;
            this.state = 'stand';
        } else if (this.state === 'stand' || this.state === 'down' || this.state === 'squat') {
            if (!this.current) this.current = { start: timeMs, minKnee: knee, minHip: hip, bottom: timeMs, reachedDown: false, views: new Set() };
            const c = this.current;
            c.views.add(view);
            if (knee < c.minKnee) {
                c.minKnee = knee;
                c.bottom = timeMs;
            }
            if (hip !== null && (c.minHip === null || hip < c.minHip)) c.minHip = hip;
            if (knee <= SQUAT.DOWN) c.reachedDown = true;
            this.state = c.reachedDown ? 'squat' : 'down';
        }
        out.reps = this.reps.length;
        out.state = this.state;
        return out;
    }

    // 選一側的膝蓋角度（和大字儀表板同一側：靠近鏡頭、看得比較清楚的那側）；那一側算不出來時用另一側
    knee(pose) {
        this.side = clearerSide(pose.landmarks, this.side);
        const other = this.side === 'LEFT' ? 'RIGHT' : 'LEFT';
        const a = pose.angles[this.side + '_KNEE'];
        if (a !== null) return a;
        const b = pose.angles[other + '_KNEE'];
        return b;
    }

    finish(timeMs) {
        const c = this.current;
        const rep = {
            n: this.reps.length + 1,
            start: c.start / 1000,
            bottom: c.bottom / 1000,
            end: timeMs / 1000,
            minKnee: c.minKnee,
            minHip: c.minHip,
            depth: depthOf(c.minKnee),
            // 這一下有沒有斜側面拍的格子（角度誤差約 10°，僅供參考）
            oblique: c.views.has('oblique')
        };
        this.reps.push(rep);
        return rep;
    }

    // 這一下作廢（看不到人太久、轉成正面拍），要重新站直才開始算
    abandon() {
        this.current = null;
        this.state = 'wait';
    }
}
