// 首頁「今天要做什麼運動？」（10/19 組員回饋：很多人沒看到下面的動作卡片，直接按「開啟鏡頭」，
// 進了只看骨架的自由模式：不計次、沒有運動總結、也不會上傳雲端）
// 四個大按鈕：按了選好這個動作，轉場到「用哪一個 AI 看你做深蹲？」的畫面（js/ui/model-screen.js，main.js 的 onPick 打開）
//   11/24 使用者：選了要做的動作之後，要有一個介面讓使用者選 MediaPipe 還是 YOLO（老師 11/18 要使用者自己選模型）；
//   同一天下午：不要像設定一樣放在首頁，要轉場到一個畫面選。所以按鈕本身不開鏡頭，開鏡頭是轉場畫面裡的「開始深蹲」
// #startBtn 一直是「用目前選的動作、目前選的模型開鏡頭」（智慧課表、測試、完整回歸都按它），只是放的位置和字跟著目前選的動作換：
//   選的是某個動作（剛做完回到首頁、或網址 ?workout=）：四個大按鈕下面一行「開始深蹲 · MediaPipe lite」，
//   不用再選一次，直接用上次選的 AI 開始（要換 AI：再按一次「深蹲」）
//   自由模式：最下面那一行小字「只看骨架」（按了直接開，模型用進階設定選的；首次打開沒選過動作時也是這樣，
//   大按鈕要先選動作，第一眼就不會只看到一個「開始」而進了不計次的自由模式）
// 選的是某個動作時，最下面另外一行小字（#freeBtn）可以改用自由模式（按了直接開，和以前一樣）
import { WORKOUTS, getWorkout, setWorkout, onWorkoutChange } from '../analysis/workouts.js';

export const PICKS = ['squat', 'pushup', 'plank', 'lunge'];
// 按鈕上第二行小字：網站算什麼（和動作卡片、示範動畫的說法一樣）
// 手機 320 寬時按鈕裡大約放得下 7 個字：太長會擠成兩行
const SUB = { squat: '計次 · 看膝蓋', pushup: '計次 · 看手肘', plank: '計時 · 一直線', lunge: '計次 · 看膝蓋' };
export const FREE_TEXT = '只看骨架（自由模式，不計次）';

// 目前選的動作 → #startBtn 放哪裡、寫什麼（認不得的代號當作自由模式）
// model：會用哪一個 AI（js/ui/model-pick.js 的 choiceLabel，例如「MediaPipe lite」）；空的就只寫「開始深蹲」
export function startLook(id, model) {
    if (!PICKS.includes(id)) return { place: 'free', text: FREE_TEXT };
    const name = '開始' + WORKOUTS[id].name;
    return { place: id, text: typeof model === 'string' && model ? name + ' · ' + model : name };
}

function fill(button, name, sub, tag) {
    const parts = [['wb-name', name], ['wb-sub', sub]];
    if (tag) parts.push(['wb-tag', tag]);
    button.replaceChildren(...parts.map(([cls, text]) => {
        const span = document.createElement('span');
        span.className = cls;
        span.textContent = text;
        if (cls === 'wb-tag') span.setAttribute('aria-hidden', 'true');
        return span;
    }));
}

// grid：放四個大按鈕的框；quick：四個大按鈕下面那一行（「開始深蹲 · MediaPipe lite」）；freeLine：最下面那一行小字的框
// modelText()：現在選的 AI 的名字；onPick(button)：按了某個動作（main.js 從這顆按鈕轉場到選 AI 的畫面）
// 回傳 { setDisabled(on), refresh() }：setDisabled 是這個瀏覽器不能開鏡頭時，全部的按鈕一起變灰；refresh 是換了 AI 時重寫按鈕上的字
export function setupStartPick({ grid, quick, freeLine, startBtn, freeBtn, modelText, onPick }) {
    const buttons = new Map();
    for (const id of PICKS) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'workout-btn';
        button.dataset.workout = id;
        // 按了會打開一個畫面（螢幕閱讀器會先說「有彈出對話框」）
        button.setAttribute('aria-haspopup', 'dialog');
        fill(button, WORKOUTS[id].name, SUB[id]);
        // 只選動作、打開選 AI 的畫面；開鏡頭是那個畫面裡的「開始」（它按 #startBtn：開鏡頭前的準備都在 #startBtn 那裡，喚醒聲音、語音）
        button.addEventListener('click', () => {
            setWorkout(id);
            if (onPick) onPick(button);
        });
        grid.append(button);
        buttons.set(id, button);
    }
    freeBtn.addEventListener('click', () => {
        setWorkout('free');
        startBtn.click();
    });

    function render() {
        const look = startLook(getWorkout().id, modelText ? modelText() : '');
        // 上次選的那個：白框、右上角打勾（只給看的；螢幕閱讀器念 aria-current 的「目前的項目」）
        // 不寫「已選」兩個字：320 寬的手機上按鈕只有約 90 像素寬，會蓋到「弓箭步」的「步」
        for (const [id, button] of buttons) {
            const on = id === look.place;
            button.classList.toggle('current', on);
            if (on) button.setAttribute('aria-current', 'true');
            else button.removeAttribute('aria-current');
            fill(button, WORKOUTS[id].name, SUB[id], on ? '✓' : '');
        }
        if (startBtn.textContent !== look.text) startBtn.textContent = look.text;
        if (look.place === 'free') {
            startBtn.className = 'free-start';
            if (startBtn.parentNode !== freeLine) freeLine.prepend(startBtn);
        } else {
            startBtn.className = 'quick-start';
            if (startBtn.parentNode !== quick) quick.append(startBtn);
        }
        quick.hidden = look.place === 'free';
        freeBtn.hidden = look.place === 'free';
    }
    onWorkoutChange(render);
    render();

    return {
        setDisabled(on) {
            startBtn.disabled = on;
            freeBtn.disabled = on;
            for (const button of buttons.values()) button.disabled = on;
        },
        refresh: render
    };
}
