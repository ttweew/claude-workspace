// 重播分析的 AI 全自動分段（11/8 追加 3）：一段錄影做了好幾個動作（自由模式錄的；或錄製中 AI 全自動不換動作，
// 因為錄製檔只記一個動作），重播分析時照首頁 AI 全自動的做法一格一格跑，切成幾段，每一段用 AI 認出的動作數
// 做法和首頁一樣（auto-mode.js 的 AutoSwitch 決定什麼時候換、從哪一格重算；main.js 換動作、把最近幾秒的骨架交給新的動作重算）：
//   每一格先給現在的動作算 → AI 自動辨識動作猜（ActivityMeter，每 0.5 秒）→ 畫面上的動作（ActivityDisplay）→ 要不要換
//   換的時候：棒式撐到現在的算一次、這一段結束；新的動作從 AutoSwitch 給的那幾格開始重算
// 自己一套 ActivityMeter（換動作時要清掉），不動重播分析原本「AI 猜了什麼、各幾秒」的統計
// tests/auto-mode.test.mjs 的 run() 照 main.js 的做法跑，同一批骨架這裡分出來的每一段、每一段幾下要和它一樣
import { AutoSwitch } from './auto-mode.js';
import { ActivityMeter, ActivityDisplay } from './activity.js';
import { WorkoutTracker } from './tracker.js';

export class AutoSegmenter {
    constructor() {
        this.meter = new ActivityMeter();
        this.display = new ActivityDisplay();
        this.auto = new AutoSwitch();
        this.current = 'free';
        this.tracker = new WorkoutTracker('free');
        this.segments = [];
        this.last = null;
    }

    // 每一格：processed（pipeline 的結果，沒有人時 null）、now（這一格的時間，毫秒）
    update(processed, now) {
        this.last = now;
        this.tracker.update(processed, now);
        const guess = this.meter.update(processed, now);
        const shown = this.display.update(guess);
        const keep = this.tracker.items.length > 0 || !!(this.tracker.counter && this.tracker.counter.current);
        const change = this.auto.update(processed, now, guess, shown, this.current, true, keep);
        if (!change) return;
        this.finish();
        this.current = change.workout;
        this.tracker = new WorkoutTracker(this.current);
        this.meter.reset();
        this.display.reset();
        this.auto.reset();
        for (const g of change.frames) this.tracker.update(g.processed, g.now);
    }

    // 這一段結束（換動作、檔案結束）：棒式撐到現在的算一次；自由模式、什麼都沒數到的不算一段
    finish() {
        const t = this.tracker;
        if (this.current === 'free') return;
        if (t.workout.kind === 'hold' && t.counter.current) t.interrupt();
        if (t.items.length) this.segments.push({ workout: this.current, items: t.items });
    }

    // 檔案結束：最後一段也算進去，回傳每一段 { workout, items（和重播分析的 reps 一樣的每一下）}
    done() {
        if (this.last !== null) this.finish();
        this.current = 'free';
        this.tracker = new WorkoutTracker('free');
        this.last = null;
        return this.segments;
    }
}
