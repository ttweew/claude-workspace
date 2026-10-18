// 一次運動的計算：次數（棒式計時）＋動作錯誤，並把做每一下期間出現過的錯誤記到那一下（rep.errors）
// 鏡頭畫面（main.js）和重播分析（js/data/replay-core.js）共用，重播算出來的結果就和當時畫面上的一樣

import { WORKOUTS } from './workouts.js';
import { FormChecker } from './form.js';

export class WorkoutTracker {
    constructor(workoutId) {
        this.workout = WORKOUTS[workoutId] || WORKOUTS.free;
        this.counter = this.workout.create ? this.workout.create() : null;
        this.form = new FormChecker(this.workout.id);
        this.errors = new Set();   // 這一下（或這一次棒式）出現過的錯誤規則
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
    }

    // 鏡頭中斷（重開鏡頭）：進行中的這一下作廢，棒式撐到現在的算一次；已經做完的保留
    interrupt() {
        const hold = this.counter ? this.counter.interrupt() : null;
        if (hold) this.attach(hold);
        this.form.reset();
        this.errors.clear();
        return hold;
    }

    // 每一格：回傳 { form（這一格的錯誤，見 form.js）, count（計次／計時的結果，自由模式是 null）, done（剛完成的一下或一次，已經記上 errors） }
    update(pose, timeMs) {
        const form = this.form.update(pose, timeMs);
        if (!this.counter) return { form, count: null, done: null };
        const count = this.counter.update(pose, timeMs);
        // 做這一下的期間：彎下去到站起來；棒式是撐著的時候
        const during = this.workout.kind === 'hold' ? !!this.counter.current : count.state === 'down' || count.state === 'squat';
        if (during) form.errors.forEach(e => this.errors.add(e));
        const done = count.rep || count.hold || null;
        if (done) this.attach(done);
        else if (!during) this.errors.clear();
        return { form, count, done };
    }

    attach(item) {
        item.errors = [...this.errors].map(e => e.id);
        this.errors.clear();
    }
}
