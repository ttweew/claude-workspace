// 錄製前倒數（10/25 從 main.js 搬出來，行為不變）
// 一個人錄的時候，按下錄製還要走到 2～3 公尺外、轉成側面；倒數讓開頭不會都是走路的畫面
// 每一秒唸一個數字、最後唸「開始」（語音提示選完整時）；不講話時每秒嗶一聲，最後一聲比較長、比較高，代表開始錄
// 這裡只管倒數的時間和畫面中間的大數字；開始錄製、錄製按鈕的字、實測的一組在 main.js

export const COUNT_LIFE = 900;   // 倒數唸的數字：0.9 秒內沒講出來（上一句還沒講完）就不講了，下一秒會唸新的數字

export class RecCountdown {
    // el：畫面中間的大數字（#countdown）
    // cue(text, long, life)：唸出來或嗶一聲（main.js 照語音模式決定；long：「開始」那一聲比較長）
    // onLeft(left)：換一個數字（main.js 改錄製按鈕的字）；onStop(starting)：倒數停了（starting：倒數完、接著開始錄，不算取消）
    // onGo()：倒數完了，開始錄
    constructor(el, { cue, onLeft, onStop, onGo }) {
        this.el = el;
        this.cue = cue;
        this.onLeft = onLeft;
        this.onStop = onStop;
        this.onGo = onGo;
        this.state = null;   // 倒數中：{ end, timer, shown }；倒數完、畫面上還顯示「開始」：{ timer, go: true }
    }

    // 正在倒數（不算畫面上還留著的「開始」）
    get counting() {
        return !!this.state && !this.state.go;
    }

    start(seconds) {
        this.state = { end: performance.now() + seconds * 1000, timer: 0, shown: 0 };
        this.tick();
    }

    // 用「結束時間」算剩幾秒，不是每秒減 1：手機忙的時候計時器會晚到，累積起來會越倒越慢
    tick() {
        const left = Math.ceil((this.state.end - performance.now()) / 1000);
        if (left <= 0) {
            this.cancel(true);
            this.cue('開始', true, COUNT_LIFE);
            this.onGo();
            // 「開始」短暫顯示一下，站遠的人知道已經在錄了
            this.el.textContent = '開始';
            this.el.classList.add('go');
            this.el.hidden = false;
            this.state = { timer: setTimeout(() => this.hide(), 800), go: true };
            return;
        }
        if (left !== this.state.shown) {
            this.state.shown = left;
            this.el.textContent = String(left);
            this.el.classList.remove('go');
            this.el.hidden = false;
            this.onLeft(left);
            this.cue(String(left), false, COUNT_LIFE);
        }
        this.state.timer = setTimeout(() => this.tick(), 100);
    }

    hide() {
        this.el.hidden = true;
        this.el.classList.remove('go');
        if (this.state && this.state.go) this.state = null;
    }

    // 取消倒數（按取消、關鏡頭、換鏡頭）；已經開始錄的「開始」字樣也一起收掉
    // starting：倒數完了、接著開始錄（只收掉倒數，不算取消）
    cancel(starting = false) {
        if (!this.state) return;
        clearTimeout(this.state.timer);
        const counting = !this.state.go;
        this.state = null;
        this.hide();
        if (counting) this.onStop(starting);
    }
}
