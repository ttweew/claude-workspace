// 四個動作的示範動畫（js/ui/demo.js）放到首頁和鏡頭畫面
// 首頁「支援的運動」：每個動作一張卡片，看得到才動
// 鏡頭畫面：右上角「示範」按鈕打開小視窗，可以切換動作，網站會記住上次看的動作
// 鏡頭畫面開著時首頁的動畫被蓋住（瀏覽器仍然當作「看得到」），要停，不和 AI 搶運算

import { EXERCISES, DemoFigure } from '../ui/demo.js';

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
    card.append(list);
    cards.push({ card, figure: new DemoFigure(svg, exercise.id), visible: false });
}

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
const panel = document.getElementById('demoPanel');
const tabs = panel.querySelector('.demo-tabs');
const art = document.getElementById('demoArt');
const cues = document.getElementById('demoCues');
const STORAGE_KEY = 'demoExercise';
let current = 'squat';
try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (byId(saved)) current = saved;
} catch (err) { /* 不能讀就用預設 */ }
const figure = new DemoFigure(art, current);

for (const exercise of EXERCISES) {
    const tab = document.createElement('button');
    tab.type = 'button';
    tab.dataset.exercise = exercise.id;
    tab.textContent = exercise.name;
    tab.addEventListener('click', () => choose(exercise.id));
    tabs.append(tab);
}

function choose(id) {
    current = id;
    try { localStorage.setItem(STORAGE_KEY, id); } catch (err) { /* 不能存就不記 */ }
    showExercise();
}
function showExercise() {
    const exercise = byId(current);
    for (const tab of tabs.children) tab.setAttribute('aria-pressed', String(tab.dataset.exercise === current));
    figure.setExercise(current);
    label(art, exercise);
    cueList(cues, exercise);
    if (!panel.hidden) figure.start();
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
    else if (!panel.hidden) figure.start();
});
