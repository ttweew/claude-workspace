// 一次運動的計算：次數（棒式計時）＋動作錯誤，並把做每一下期間出現過的錯誤記到那一下（rep.errors）、
// 和示範動作的相似度（rep.similarity，0～100，見 similarity.js）
// 鏡頭畫面（main.js）和重播分析（js/data/replay-core.js）共用，重播算出來的結果就和當時畫面上的一樣

import { WORKOUTS } from './workouts.js';
import { FormChecker } from './form.js';
import { repSimilarity } from './similarity.js';
import { Calibrator, personalThresholds } from './calibrate.js';

// 站著做的動作才校正（伏地挺身、棒式是趴著，用不到站直的角度）
const CALIBRATED = ['squat', 'lunge'];

export class WorkoutTracker {
    constructor(workoutId) {
        this.workout = WORKOUTS[workoutId] || WORKOUTS.free;
        this.counter = this.workout.create ? this.workout.create() : null;
        this.form = new FormChecker(this.workout.id);
        this.errors = new Set();   // 這一下（或這一次棒式）出現過的錯誤規則
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
        this.errors.clear();
        if (this.calibrator) this.calibrator.reset();
        this.applyBaseline(null);
    }

    // 鏡頭中斷（重開鏡頭）：進行中的這一下作廢，棒式撐到現在的算一次；已經做完的保留
    interrupt() {
        const hold = this.counter ? this.counter.interrupt() : null;
        if (hold) this.attach(hold);
        this.form.reset();
        this.errors.clear();
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
        // 做這一下的期間：彎下去到站起來；棒式是撐著的時候
        const during = this.workout.kind === 'hold' ? !!this.counter.current : count.state === 'down' || count.state === 'squat';
        if (during) form.errors.forEach(e => this.errors.add(e));
        const done = count.rep || count.hold || null;
        if (done) this.attach(done);
        else if (!during) this.errors.clear();
        return { form, count, done, calibrated };
    }

    // 完成的一下：記上錯誤；有角度曲線的（計次的動作）算和示範動作的相似度，曲線算完就不留（省記憶體）
    attach(item) {
        item.errors = [...this.errors].map(e => e.id);
        this.errors.clear();
        if (item.samples) {
            item.similarity = repSimilarity(this.workout.id, item.samples);
            delete item.samples;
        }
    }
}
