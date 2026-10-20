// 錄影控制列（10/20 使用者要求：像手機相機的錄影）：工具列「錄影」打開，放在鏡頭畫面下方中間
//   中間紅色大圓鈕：開始錄（照倒數設定）→ 錄的時候變成方塊，按了就結束；倒數中是 ✕（取消）
//   右邊暫停鍵：錄的時候才出現，暫停時變成紅點（繼續）
//   左邊「錄製檔 N」：像手機相簿的縮圖，點開看存好的每一段（錄的時候不能點）
//   上面是錄了多久（● 0:12；暫停時 ❚❚ 0:12）
// 只管畫面；開始、暫停、結束、存檔在 main.js（和數據面板的錄製按鈕共用）

export class RecBar {
    // root：#recBar；onMain()：按大圓鈕；onPause()：按暫停／繼續；onGallery()：按「錄製檔」
    constructor(root, { onMain, onPause, onGallery }) {
        this.root = root;
        this.clock = root.querySelector('#recClock');
        this.main = root.querySelector('#recMain');
        this.pauseBtn = root.querySelector('#recPause');
        this.gallery = root.querySelector('#galleryBtn');
        this.count = root.querySelector('#galleryCount');
        this.note = root.querySelector('#recNote');
        this.main.addEventListener('click', () => onMain());
        this.pauseBtn.addEventListener('click', () => onPause());
        this.gallery.addEventListener('click', () => onGallery());
        this.show('idle');
    }

    // state：idle（還沒錄）、counting（倒數中）、recording（錄製中）、paused（暫停中）
    show(state, clock = '') {
        this.state = state;
        this.root.dataset.state = state;
        const label = { idle: '開始錄影', counting: '取消倒數', recording: '結束錄影', paused: '結束錄影' }[state];
        this.main.dataset.state = state;
        this.main.setAttribute('aria-label', label);
        this.main.title = label;
        const live = state === 'recording' || state === 'paused';
        this.pauseBtn.hidden = !live;
        this.pauseBtn.dataset.state = state;
        this.pauseBtn.setAttribute('aria-label', state === 'paused' ? '繼續錄影' : '暫停錄影');
        this.pauseBtn.title = this.pauseBtn.getAttribute('aria-label');
        this.gallery.disabled = live || state === 'counting';
        this.clock.dataset.state = state;
        this.tick(clock);
    }

    // 錄了多久（和數據面板的「錄製中 0:12」同一個數字）
    tick(clock) {
        const text = this.state === 'recording' ? '● ' + clock : this.state === 'paused' ? '❚❚ ' + clock : this.state === 'counting' ? '倒數中' : '';
        if (this.clock.textContent !== text) this.clock.textContent = text;
        this.clock.hidden = !text;
    }

    // 「錄製檔 N」：存好幾段
    setCount(n) {
        this.count.textContent = String(n);
    }

    // 短暫的說明（例如「已存好第 7 段」）；給螢幕閱讀器也唸一次
    say(text) {
        this.note.textContent = text;
    }
}
