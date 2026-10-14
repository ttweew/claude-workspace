// 四個動作的示範動畫（js/ui/demo.js）放到首頁和鏡頭畫面，也是選運動模式的地方（js/analysis/workouts.js）
// 首頁「支援的運動」：每個動作一張卡片，看得到才動；卡片上的「開始深蹲」選好動作並開鏡頭
// 鏡頭畫面：右上角「選擇動作」按鈕打開小視窗，選動作（也可以選「自由」，只看角度）、看示範
// 鏡頭畫面開著時首頁的動畫被蓋住（瀏覽器仍然當作「看得到」），要停，不和 AI 搶運算

import { EXERCISES, DemoFigure } from '../ui/demo.js';
import { WORKOUTS, getWorkout, setWorkout, onWorkoutChange } from '../analysis/workouts.js';

const NS = 'http://www.w3.org/2000/svg';
const stage = document.getElementById('stage');
const stageOpen = () => !!stage && !stage.hidden;
const byId = id => EXERCISES.find(e => e.id === id);

function cueList(list, exercise) {
    list.replaceChildren(...exercise.cues.map(text => {
        const li = document.createElement('li');
        li.textContent = text;
        return li;
    }));
}
function label(svg, exercise) {
    svg.setAttribute('aria-label', exercise.name + '的示範動畫：側面火柴人，標出' + exercise.metric);
}

// ---------- 首頁卡片 ----------
const cards = [];
for (const card of document.querySelectorAll('.exercises [data-exercise]')) {
    const exercise = byId(card.dataset.exercise);
    if (!exercise) continue;
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '0 0 240 180');
    svg.setAttribute('class', 'demo-art');
    svg.setAttribute('role', 'img');
    label(svg, exercise);
    card.prepend(svg);
    const list = document.createElement('ul');
    list.className = 'demo-cues';
    cueList(list, exercise);
    // 選好這個動作並開鏡頭
    const start = document.createElement('button');
    start.type = 'button';
    start.className = 'start-workout';
    start.textContent = '開始' + exercise.name;
    start.addEventListener('click', () => {
        setWorkout(exercise.id);
        const startBtn = document.getElementById('startBtn');
        if (startBtn && !startBtn.disabled) startBtn.click();
    });
    card.append(list, start);
    cards.push({ card, figure: new DemoFigure(svg, exercise.id), visible: false });
}
// 目前選的動作：卡片加綠框
function markCards() {
    const id = getWorkout().id;
    for (const c of cards) c.card.classList.toggle('selected', c.card.dataset.exercise === id);
}
markCards();

function updateCards() {
    for (const c of cards) {
        if (c.visible && !document.hidden && !stageOpen()) c.figure.start();
        else c.figure.stop();
    }
}
if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver(entries => {
        for (const entry of entries) {
            const c = cards.find(x => x.card === entry.target);
            if (c) c.visible = entry.isIntersecting;
        }
        updateCards();
    });
    cards.forEach(c => observer.observe(c.card));
}

// ---------- 鏡頭畫面的「示範」視窗 ----------
const button = document.getElementById('demoBtn');
const buttonText = document.getElementById('demoBtnText');
const panel = document.getElementById('demoPanel');
const tabs = panel.querySelector('.demo-tabs');
const art = document.getElementById('demoArt');
const cues = document.getElementById('demoCues');
let current = getWorkout().id;
const figure = new DemoFigure(art, byId(current) ? current : 'squat');

// 「自由」放第一個：只看角度、不計次數
for (const id of ['free', ...EXERCISES.map(e => e.id)]) {
    const tab = document.createElement('button');
    tab.type = 'button';
    tab.dataset.exercise = id;
    tab.textContent = WORKOUTS[id].name;
    tab.addEventListener('click', () => setWorkout(id));
    tabs.append(tab);
}

onWorkoutChange(workout => {
    current = workout.id;
    markCards();
    showExercise();
});
function showExercise() {
    const exercise = byId(current);
    const workout = WORKOUTS[current];
    for (const tab of tabs.children) tab.setAttribute('aria-pressed', String(tab.dataset.exercise === current));
    buttonText.textContent = current === 'free' ? '選擇動作' : workout.name;
    // 自由模式沒有示範動畫（art 是 <svg>，要用屬性藏起來）
    art.toggleAttribute('hidden', !exercise);
    if (exercise) {
        figure.setExercise(current);
        label(art, exercise);
        cueList(cues, { cues: [...exercise.cues, '網站計算：' + workout.hint + '（請側面對著鏡頭）'] });
        if (!panel.hidden) figure.start();
    } else {
        figure.stop();
        cueList(cues, { cues: ['只顯示膝、髖角度，不計次數', '選上面的動作，就會計算次數（棒式計時）'] });
    }
}

function setOpen(open) {
    panel.hidden = !open;
    button.setAttribute('aria-expanded', String(open));
    if (open) showExercise();
    else figure.stop();
}
button.addEventListener('click', () => setOpen(panel.hidden));
document.getElementById('demoClose').addEventListener('click', () => {
    setOpen(false);
    button.focus();
});
panel.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
        setOpen(false);
        button.focus();
    }
});
showExercise();

// 鏡頭畫面打開、關閉：首頁的動畫跟著停或動；關鏡頭時收起示範視窗
if (stage) {
    new MutationObserver(() => {
        if (!stageOpen()) setOpen(false);
        updateCards();
    }).observe(stage, { attributes: true, attributeFilter: ['hidden'] });
}
document.addEventListener('visibilitychange', () => {
    updateCards();
    if (document.hidden) figure.stop();
    else if (!panel.hidden && byId(current)) figure.start();
});
