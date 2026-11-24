// 首頁「今天要做什麼運動？」（10/19 組員回饋：很多人沒看到下面的動作卡片，直接按「開啟鏡頭」，
// 進了只看骨架的自由模式：不計次、沒有運動總結、也不會上傳雲端）
// 四個大按鈕：按了選好這個動作（11/24 起不直接開鏡頭）；下面出現「用哪一個 AI」（js/ui/model-pick.js）和「開始深蹲」
//   11/24 使用者：選了要做的動作之後，要有一個介面讓使用者選 MediaPipe 還是 YOLO（老師 11/18 要使用者自己選模型）
// #startBtn 一直是「用目前選的動作、目前選的模型開鏡頭」（智慧課表、測試、完整回歸都按它），只是放的位置和字跟著目前選的動作換：
//   選的是某個動作（上次做的、或網址 ?workout=）：放在「用哪一個 AI」下面，寫「開始深蹲」
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
export function startLook(id) {
    if (!PICKS.includes(id)) return { place: 'free', text: FREE_TEXT };
    return { place: id, text: '開始' + WORKOUTS[id].name };
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

// grid：放四個大按鈕的框；ready：選好動作後出現的框（「用哪一個 AI」和 #startBtn）；freeLine：最下面那一行小字的框
// onPick(id)：按了某個動作（main.js 把 ready 捲進畫面）
// 回傳 setDisabled(on)：這個瀏覽器不能開鏡頭時，全部的按鈕一起變灰
export function setupStartPick({ grid, ready, freeLine, startBtn, freeBtn, onPick }) {
    const buttons = new Map();
    for (const id of PICKS) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'workout-btn';
        button.dataset.workout = id;
        fill(button, WORKOUTS[id].name, SUB[id]);
        // 只選動作；開鏡頭是下面的 #startBtn（開鏡頭前的準備都在它那裡：喚醒聲音、語音）
        button.addEventListener('click', () => {
            setWorkout(id);
            if (onPick) onPick(id);
        });
        grid.append(button);
        buttons.set(id, button);
    }
    freeBtn.addEventListener('click', () => {
        setWorkout('free');
        startBtn.click();
    });

    function render() {
        const look = startLook(getWorkout().id);
        // 選了的那個：白框、右上角打勾（只給看的；螢幕閱讀器念 aria-pressed 的「已按下」）
        // 不寫「已選」兩個字：320 寬的手機上按鈕只有約 90 像素寬，會蓋到「弓箭步」的「步」
        for (const [id, button] of buttons) {
            const on = id === look.place;
            button.classList.toggle('current', on);
            button.setAttribute('aria-pressed', String(on));
            fill(button, WORKOUTS[id].name, SUB[id], on ? '✓' : '');
        }
        startBtn.textContent = look.text;
        if (look.place === 'free') {
            startBtn.className = 'free-start';
            freeLine.prepend(startBtn);
        } else {
            startBtn.className = 'start-go';
            ready.append(startBtn);
        }
        ready.hidden = look.place === 'free';
        freeBtn.hidden = look.place === 'free';
    }
    onWorkoutChange(render);
    render();

    return function setDisabled(on) {
        startBtn.disabled = on;
        freeBtn.disabled = on;
        for (const button of buttons.values()) button.disabled = on;
    };
}
