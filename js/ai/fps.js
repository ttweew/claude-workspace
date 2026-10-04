// 計算每秒偵測次數（FPS）：每完成一次偵測呼叫 tick()，每滿一秒更新一次數值
export class FpsCounter {
    constructor() {
        this.reset();
    }

    reset() {
        this.count = 0;
        this.start = performance.now();
        this.value = 0;     // 0 代表還在計算中
    }

    // 回傳 true 代表 FPS 數值剛更新，畫面需要重新顯示
    tick(now) {
        this.count++;
        if (now - this.start < 1000) return false;
        this.value = Math.round(this.count * 1000 / (now - this.start));
        this.count = 0;
        this.start = now;
        return true;
    }
}
