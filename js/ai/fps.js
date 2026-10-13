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
    // frames：這次算幾格（鏡頭的格數：兩次叫醒之間可能已經送來不只一格）
    tick(now, frames = 1) {
        this.count += frames;
        if (now - this.start < 1000) return false;
        this.value = Math.round(this.count * 1000 / (now - this.start));
        this.count = 0;
        this.start = now;
        return true;
    }
}
