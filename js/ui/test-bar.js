// 實測模式的控制列（js/data/test-mode.js）：鏡頭畫面左上角狀態列裡自己一行（手機橫拿時放在下方中間）
// 主持人每一組選「這組要做的」→ 倒數 → 自動錄製 → 按「這組做完」→ 自動下載。錄製和下載在 main.js，這裡只管畫面
// 錄過的組打勾（只記在這次打開的網頁裡），主持人看得出這位受測者這個動作還差哪一組

export class TestBar {
    // root：#testBar；onPick(condition)：選了這組要做的；onAction()：倒數中按「取消」、錄製中按「這組做完」；onPause()：暫停／繼續
    constructor(root, { onPick, onAction, onPause }) {
        this.root = root;
        this.title = root.querySelector('#testTitle');
        this.state = root.querySelector('#testState');
        this.clock = root.querySelector('#testClock');
        this.picks = root.querySelector('#testPicks');
        this.action = root.querySelector('#testAction');
        this.pauseBtn = root.querySelector('#testPause');
        this.file = root.querySelector('#testFile');
        this.onPick = onPick;
        this.done = new Set();    // 錄過的組：「代號|動作|這組要做的」
        this.key = '';
        this.recKey = '';
        this.conditions = [];
        this.action.addEventListener('click', () => onAction());
        this.pauseBtn.addEventListener('click', () => onPause());
    }

    // 換人、換動作、開關實測模式時重畫：subject 是 null（沒開實測模式）或這個動作沒有可以選的組（自由模式）就整列藏起來
    setPlan(subject, workout, conditions) {
        this.root.hidden = !subject || !conditions.length;
        if (this.root.hidden) return;
        this.key = subject + '|' + workout.id + '|';
        this.title.textContent = '實測 · 受測者 ' + subject + ' · ' + workout.name;
        this.picks.replaceChildren(...conditions.map(c => {
            const b = document.createElement('button');
            b.type = 'button';
            b.dataset.condition = c.id;
            b.addEventListener('click', () => this.onPick(c));
            return b;
        }));
        this.conditions = conditions;
        this.idle();
    }

    // 等主持人選下一組；note：上一組的結果（例如「✓ 已下載…」），沒有就是說明怎麼用
    idle(note = '選這組要做的，選了就倒數、開始錄') {
        this.conditions.forEach((c, i) => {
            const b = this.picks.children[i];
            const done = this.done.has(this.key + c.id);
            b.textContent = c.name + ' ' + c.amount + ' ' + c.unit + (done ? ' ✓' : '');
            b.classList.toggle('done', done);
            if (done) b.setAttribute('aria-label', c.name + ' ' + c.amount + ' ' + c.unit + '，已經錄過');
            else b.removeAttribute('aria-label');
        });
        // 用鍵盤操作時：焦點本來在「這組做完」（要藏起來了），移到還沒錄的第一組
        const refocus = document.activeElement === this.action || document.activeElement === this.pauseBtn;
        this.picks.hidden = false;
        this.action.hidden = true;
        this.pauseBtn.hidden = true;
        this.setState(note, '');
        if (refocus) (this.picks.querySelector('button:not(.done)') || this.picks.firstElementChild).focus();
    }

    counting(c) {
        const refocus = this.picks.contains(document.activeElement);
        this.file.hidden = true;
        this.picks.hidden = true;
        this.action.textContent = '✕ 取消';
        this.action.hidden = false;
        this.setState('倒數中：' + label(c), '');
        // 按的那一組藏起來了：焦點移到「取消」，用鍵盤的人不會掉到網頁最上面
        if (refocus) this.action.focus();
    }

    recording(c) {
        this.recKey = this.key;   // 錄的是哪位受測者、哪個動作（存好之前換了動作，也打勾在對的地方）
        this.picks.hidden = true;
        this.action.textContent = '■ 這組做完';
        this.action.classList.add('stop');
        this.action.hidden = false;
        this.pauseBtn.hidden = false;
        this.paused(c, false);
    }

    // 暫停中（10/20）：暫停的時間不錄，網站在暫停時算到的次數也不算進這一組
    paused(c, on) {
        this.pauseBtn.textContent = on ? '▶ 繼續' : '❚❚ 暫停';
        this.setState((on ? '❚❚ 暫停中：' : '● 錄製中：') + label(c), this.clock.textContent);
    }

    // 錄製中每秒更新已錄多久（和數據面板的「錄製中 0:07」同一個數字）
    tick(text) {
        if (this.clock.textContent !== text) this.clock.textContent = text;
    }

    // 這組存好了：打勾、寫出檔名；count：網站算了幾下（棒式是 null）；how：已存好（存進錄製檔）、已存好、已下載、已下載
    saved(c, fileName, count, how) {
        this.done.add(this.recKey + c.id);
        if (this.recKey !== this.key) return;   // 已經換到別的動作（例如關鏡頭後馬上選下一個）：只打勾
        this.action.classList.remove('stop');
        this.file.textContent = fileName;
        this.file.hidden = false;
        this.idle('✓ ' + how + '：' + label(c) + (count === null ? '' : '（網站算 ' + count + ' 下）'));
    }

    // 下載失敗（例如手機記憶體不夠）：資料還在，請主持人從數據面板再匯出一次
    failed(c) {
        this.action.classList.remove('stop');
        this.file.hidden = true;
        this.idle('✕ ' + label(c) + ' 沒有存好也沒有下載成功：按「數據」→「下載 JSON」再試一次');
    }

    // 倒數取消、沒錄到東西就停了：回到選組，不打勾
    cancel(note) {
        this.action.classList.remove('stop');
        this.idle(note);
    }

    setState(text, clock) {
        this.state.textContent = text;
        this.clock.textContent = clock;
    }
}

const label = c => c.name + ' ' + c.amount + ' ' + c.unit;
