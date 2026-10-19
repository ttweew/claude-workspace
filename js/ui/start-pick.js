// 首頁「今天要做什麼運動？」（10/19 組員回饋：很多人沒看到下面的動作卡片，直接按「開啟鏡頭」，
// 進了只看骨架的自由模式：不計次、沒有運動總結、也不會上傳雲端）
// 四個大按鈕：按了就選好這個動作並開鏡頭；自由模式改成下面一行小字
// #startBtn 一直是「用目前選的動作開鏡頭」（首頁卡片的「開始深蹲」、測試都按它），只是放的位置和字跟著目前選的動作換：
//   選的是某個動作（上次做的、或網址 ?workout=）：放在那個動作的位置，標「上次」
//   自由模式：最下面那一行小字「只看骨架」
// 選的是某個動作時，最下面另外一行小字（#freeBtn）可以改用自由模式
import { WORKOUTS, getWorkout, setWorkout, onWorkoutChange } from '../analysis/workouts.js';

export const PICKS = ['squat', 'pushup', 'plank', 'lunge'];
// 按鈕上第二行小字：網站算什麼（和動作卡片、示範動畫的說法一樣）
// 手機 320 寬時按鈕裡大約放得下 7 個字：太長會擠成兩行
const SUB = { squat: '計次 · 看膝蓋', pushup: '計次 · 看手肘', plank: '計時 · 一直線', lunge: '計次 · 看膝蓋' };
export const FREE_TEXT = '只看骨架（自由模式，不計次）';

// 目前選的動作 → #startBtn 放哪裡、寫什麼（認不得的代號當作自由模式）
export function startLook(id) {
    if (!PICKS.includes(id)) return { place: 'free', text: FREE_TEXT };
    return { place: id, name: WORKOUTS[id].name, sub: SUB[id] };
}

function fill(button, name, sub, tag) {
    const parts = [['wb-name', name], ['wb-sub', sub]];
    if (tag) parts.push(['wb-tag', tag]);
    button.replaceChildren(...parts.map(([cls, text]) => {
        const span = document.createElement('span');
        span.className = cls;
        span.textContent = text;
        return span;
    }));
}

// grid：放四個大按鈕的框；freeLine：最下面那一行小字的框
// 回傳 setDisabled(on)：這個瀏覽器不能開鏡頭時，全部的按鈕一起變灰
export function setupStartPick({ grid, freeLine, startBtn, freeBtn }) {
    const buttons = new Map();
    for (const id of PICKS) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'workout-btn';
        button.dataset.workout = id;
        fill(button, WORKOUTS[id].name, SUB[id]);
        // 選好動作，再用同一顆 #startBtn 開鏡頭（開鏡頭前的準備都在它那裡：喚醒聲音、語音）
        button.addEventListener('click', () => {
            setWorkout(id);
            startBtn.click();
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
        for (const [id, button] of buttons) button.hidden = id === look.place;
        if (look.place === 'free') {
            startBtn.className = 'free-start';
            startBtn.textContent = look.text;
            freeLine.prepend(startBtn);
        } else {
            startBtn.className = 'workout-btn current';
            fill(startBtn, look.name, look.sub, '上次');
            grid.insertBefore(startBtn, buttons.get(look.place));
        }
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
