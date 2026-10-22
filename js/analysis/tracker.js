// 一次運動的計算：次數（棒式計時）＋動作錯誤，並把做每一下期間出現過的錯誤記到那一下（rep.errors，最嚴重的數字在 rep.peaks）、
// 和示範動作的相似度（rep.similarity，0～100，見 similarity.js）
// 鏡頭畫面（main.js）和重播分析（js/data/replay-core.js）共用，重播算出來的結果就和當時畫面上的一樣

import { WORKOUTS, isWorkout } from './workouts.js';
import { FormChecker } from './form.js';
import { repSimilarity } from './similarity.js';
import { Calibrator, personalThresholds } from './calibrate.js';

// 站著做的動作才校正（伏地挺身、棒式是趴著，用不到站直的角度）
const CALIBRATED = ['squat', 'lunge'];

export class WorkoutTracker {
    constructor(workoutId) {
        this.workout = isWorkout(workoutId) ? WORKOUTS[workoutId] : WORKOUTS.free;
        this.counter = this.workout.create ? this.workout.create() : null;
        this.form = new FormChecker(this.workout.id);
        this.errors = new Set();   // 這一下（或這一次棒式）出現過的錯誤規則
        this.peaks = new Map();    // 這一下每種錯誤最嚴重的數字（度或 %，說出原因用，見 form.js 的 why）
        // 棒式：姿勢跑掉（不在計時）時看到的錯誤先放這裡，之後又回到姿勢對才記；這一次就此結束（起身）就不記（見 collectHold）
        this.pending = new Set();
        this.pendingPeaks = new Map();
        // 棒式：趴好、還沒一直線過（準備）時看到的錯誤；之後一直線了就不記（在調整姿勢），整次都沒一直線才記
        this.prep = new Set();
        this.prepPeaks = new Map();
        this.timed = false;        // 這一次有沒有一直線（計時）過
        // 個人校正（calibrate.js）：站直不動約 2 秒後，「站直」的門檻和上身前傾的判斷依這個人調整
        this.calibrator = CALIBRATED.includes(this.workout.id) ? new Calibrator() : null;
        this.defaults = this.counter ? { up: this.counter.config.up, down: this.counter.config.down } : null;
    }

    get baseline() {
        return this.calibrator ? this.calibrator.baseline : null;
    }

    // 校正結果套用到計次的門檻和錯誤判斷；baseline 是 null 時回到預設
    applyBaseline(baseline) {
        this.form.tilt = baseline ? baseline.tilt : 0;
        if (this.counter && this.defaults) Object.assign(this.counter.config, personalThresholds(this.defaults, baseline));
    }

    // 沿用已經有的校正結果（重播分析用錄製檔記下的 meta.calibration，結果才會和當時畫面上的一樣）
    // 格式不對（例如舊檔案、手改過的檔案）就不用，改成從錄影裡站直不動的那段自己校正
    useBaseline(baseline) {
        if (!this.calibrator || !baseline || !Number.isFinite(baseline.knee) || !Number.isFinite(baseline.tilt)) return false;
        this.calibrator.baseline = { knee: baseline.knee, tilt: baseline.tilt };
        this.applyBaseline(this.calibrator.baseline);
        return true;
    }

    // 做完的每一下（棒式是每一次）
    get items() {
        if (!this.counter) return [];
        return this.workout.kind === 'hold' ? this.counter.holds : this.counter.reps;
    }

    reset() {
        if (this.counter) this.counter.reset();
        this.form.reset();
        this.clearErrors();
        if (this.calibrator) this.calibrator.reset();
        this.applyBaseline(null);
    }

    // 鏡頭中斷（重開鏡頭）：進行中的這一下作廢，棒式撐到現在的算一次；已經做完的保留
    interrupt() {
        const hold = this.counter ? this.counter.interrupt() : null;
        if (hold) this.attach(hold);
        this.form.reset();
        this.clearErrors();
        // 重開鏡頭（可能換了鏡頭、手機重放）：重新校正
        if (this.calibrator) this.calibrator.reset();
        this.applyBaseline(null);
        return hold;
    }

    // 每一格：回傳 { form（這一格的錯誤，見 form.js）, count（計次／計時的結果，自由模式是 null）, done（剛完成的一下或一次，已經記上 errors），
    //   calibrated（這一格剛校正好時是校正結果） }
    update(pose, timeMs) {
        const calibrated = this.calibrator ? this.calibrator.update(pose, timeMs) : null;
        if (calibrated) this.applyBaseline(calibrated);
        const form = this.form.update(pose, timeMs);
        if (!this.counter) return { form, count: null, done: null, calibrated };
        const count = this.counter.update(pose, timeMs);
        // 做這一下的期間：彎下去到站起來；棒式是這一次（趴好開始到起身結束）
        const hold = this.workout.kind === 'hold';
        const during = hold ? !!this.counter.current : count.state === 'down' || count.state === 'squat';
        if (during && hold) this.collectHold(form, timeMs);
        else if (during) this.collect(form, form.errors, this.errors, this.peaks);
        const done = count.rep || count.hold || null;
        if (done) this.attach(done);
        else if (!during) this.clearErrors();
        return { form, count, done, calibrated };
    }

    // 把這一格顯示中的錯誤（rules）記到 errors，最嚴重的數字記到 peaks
    collect(form, rules, errors, peaks) {
        for (const e of rules) {
            errors.add(e);
            const v = form.values[e.id];
            if (v !== undefined && !(peaks.get(e.id) >= v)) peaks.set(e.id, v);
        }
    }

    // 棒式的錯誤（10/20 實測：受測者 A、B 做對的那組，趴下準備、做完起身那幾秒屁股翹起來，也被記成「屁股太高」）：
    //   這一格姿勢對、正在計時：看到的錯誤直接記（例如塌腰：髖部角度還夠大，照樣計時）
    //   姿勢跑掉：看到的先放著；之後又回到姿勢對才記（中途屁股翹高、又放下來，是真的做錯）；這一次就此結束（起身）就不記
    //   趴好、還沒一直線過：在調整姿勢，之後一直線了就不記；整次都沒一直線（10/20 受測者 B 故意屁股太高的那組）才記（見 attach）
    //   只記這一格真的做錯的：紅字在姿勢改好之後還會多留一下（form.js 的 hideMs），那段不算
    collectHold(form, timeMs) {
        const goodNow = this.counter.lastGood === timeMs;
        const bad = form.errors.filter(e => this.form.states.get(e.id).badSince !== null);
        if (goodNow) {
            this.timed = true;
            this.collect(form, bad, this.errors, this.peaks);
            this.merge(this.pending, this.pendingPeaks);
            this.prep.clear();
            this.prepPeaks.clear();
        } else if (this.timed) {
            this.collect(form, bad, this.pending, this.pendingPeaks);
        } else {
            this.collect(form, bad, this.prep, this.prepPeaks);
        }
    }

    // 先放著的錯誤記進這一次（放著的就清掉）
    merge(errors, peaks) {
        for (const e of errors) this.errors.add(e);
        for (const [id, v] of peaks) if (!(this.peaks.get(id) >= v)) this.peaks.set(id, v);
        errors.clear();
        peaks.clear();
    }

    clearErrors() {
        this.errors.clear();
        this.peaks.clear();
        this.pending.clear();
        this.pendingPeaks.clear();
        this.prep.clear();
        this.prepPeaks.clear();
        this.timed = false;
    }

    // 完成的一下：記上錯誤；有角度曲線的（計次的動作）算和示範動作的相似度，曲線算完就不留（省記憶體）
    attach(item) {
        // 棒式整次都沒一直線：趴著時看到的錯誤就是這一次的錯誤
        if (this.workout.kind === 'hold' && !this.timed) this.merge(this.prep, this.prepPeaks);
        item.errors = [...this.errors].map(e => e.id);
        // 最嚴重的數字取整數（畫面、總結、錄製檔都一樣）；只留這一下有出現的錯誤
        item.peaks = {};
        for (const id of item.errors) if (this.peaks.has(id)) item.peaks[id] = Math.round(this.peaks.get(id));
        this.clearErrors();
        if (item.samples) {
            item.similarity = repSimilarity(this.workout.id, item.samples);
            delete item.samples;
        }
    }
}
