// 「用哪一個 AI 看你做深蹲？」兩張卡片（11/24 使用者：選了要做的動作之後，要有一個介面讓使用者選 MediaPipe 還是 YOLO）
// 放在選好動作之後的轉場畫面裡（js/ui/model-screen.js；同一天下午使用者說不要像設定一樣放在首頁，要轉場到一個畫面選）
// 兩張可以點的卡片（單選，fieldset＋radio：螢幕閱讀器念得出是一組、選了哪一個，鍵盤用方向鍵換）：
//   MediaPipe（推薦）、YOLO（實驗），每張三條重點，寫出這個動作用那一家時有什麼不一樣：
//   YOLO 沒有腳跟、腳尖：深蹲不判斷「腳跟離地」、弓箭步不判斷「膝超過腳尖」（js/analysis/form.js 的 unjudgedRules，和鏡頭畫面上寫的同一份）
//   YOLO 才做得到的：畫面裡有好幾個人時點一下換人（11/22）
// 這裡只選哪一家；大小（lite、full、自動；YOLO26n、26s）在「進階設定」選，換家時用那一家上次選的（js/ai/model-choice.js 的 choiceForFamily）
// 和「進階設定」的 AI 模型是同一個選擇：main.js 的 chooseModel 換、showModelChoice 時兩邊一起更新
import { WORKOUTS, isWorkout } from '../analysis/workouts.js';
import { unjudgedRules } from '../analysis/form.js';
import { hasFeet, profileOf } from '../ai/models.js';

const FAMILY_TEXT = {
    mediapipe: { tag: '推薦', first: '網站一直在用的，比較快', second: '看得到腳跟、腳尖' },
    yolo: { tag: '實驗', first: '畫面裡有好幾個人時，點一下就能換人' }
};
// 每一家有哪幾個選項（和 js/ai/model-choice.js 的 MODEL_CHOICES 一樣；這裡不 import 它：它在載入時讀網址，node 測試不方便）
const MEMBERS = { mediapipe: ['lite', 'full', 'auto'], yolo: ['yolo-n', 'yolo-s'] };

// 模型選項的名字（卡片、首頁的「開始深蹲 · MediaPipe lite」用同一個）：照「進階設定」選的大小寫（MediaPipe lite、YOLO26n）
// 自動是在 full 和 lite 之間換，寫「MediaPipe（自動）」；不認得的（被改過的值）回傳空字串
export function choiceLabel(key) {
    if (key === 'auto') return 'MediaPipe（自動）';
    const p = profileOf(key);
    return p ? p.label : '';
}

// 卡片上的字（純函式，node 測試）：workoutId 現在選的動作、current 現在選的模型（getModelChoice）、
// variants 每一家換過去會用哪一個（{ mediapipe: 'lite' | 'full' | 'auto', yolo: 'yolo-n' | 'yolo-s' }）、mb 第一次用 YOLO 要下載幾 MB
// 每張卡片：label 名字、tag 推薦／實驗、points 重點（一條一行）、sub 重點接成一句（螢幕閱讀器、測試用）、checked 現在選的是不是這一家
export function pickTexts(workoutId, current, variants, mb) {
    const name = isWorkout(workoutId) && workoutId !== 'free' ? WORKOUTS[workoutId].name : '';
    const options = ['mediapipe', 'yolo'].map(family => {
        // 這一家換過去會用哪一個；不是這一家的（被改過的值）當作這一家最快的那個
        const asked = variants && MEMBERS[family].includes(variants[family]) ? variants[family] : MEMBERS[family][0];
        const key = asked === 'auto' ? 'full' : asked;   // 自動：先用 full（js/ai/model-choice.js 的 modelToLoad）
        const label = choiceLabel(asked);
        const blind = name ? unjudgedRules(workoutId, hasFeet(key)) : [];
        const text = FAMILY_TEXT[family];
        const points = [text.first];
        if (text.second) points.push(text.second);
        if (blind.length) points.push('沒有腳跟、腳尖，不判斷「' + blind.join('」「') + '」');
        else if (family === 'mediapipe') points.push('每一種錯誤都判斷');
        else if (name) points.push('做' + name + '時每一種錯誤都判斷');
        if (family === 'yolo' && Number.isFinite(mb) && mb > 0) points.push('第一次用要下載約 ' + Math.round(mb) + ' MB');
        return { family, label, tag: text.tag, points, sub: points.join('；'), checked: MEMBERS[family].includes(current) };
    });
    return { title: name ? '用哪一個 AI 看你做' + name + '？' : '用哪一個 AI？', options };
}

// box：<fieldset>（裡面第一個是 <legend>）；onChoose(family)：使用者點了一張卡片
// 回傳 render({ workoutId, current, variants, mb, disabled })：動作、模型、換模型中（不能點）改了就呼叫
export function setupModelPick({ box, onChoose }) {
    const legend = box.querySelector('legend');
    const cards = new Map();
    for (const family of ['mediapipe', 'yolo']) {
        const label = document.createElement('label');
        label.className = 'model-opt';
        const input = document.createElement('input');
        input.type = 'radio';
        input.name = 'modelFamily';
        input.value = family;
        input.addEventListener('change', () => {
            if (input.checked) onChoose(family);
        });
        const body = document.createElement('span');
        body.className = 'mo-body';
        const head = document.createElement('span');
        head.className = 'mo-head';
        const name = document.createElement('span');
        name.className = 'mo-name';
        const tag = document.createElement('span');
        tag.className = 'mo-tag ' + family;
        head.append(name, tag);
        // 重點一條一行（span 排成區塊；label 裡面不能放 ul）
        const points = document.createElement('span');
        points.className = 'mo-points';
        body.append(head, points);
        // 螢幕閱讀器：名字念「MediaPipe lite 推薦」，重點當說明念（不然整張卡片的字會黏成一長串當名字）
        name.id = 'moName-' + family;
        tag.id = 'moTag-' + family;
        points.id = 'moPoints-' + family;
        input.setAttribute('aria-labelledby', name.id + ' ' + tag.id);
        input.setAttribute('aria-describedby', points.id);
        label.append(input, body);
        box.append(label);
        cards.set(family, { input, name, tag, points });
    }
    return function render({ workoutId, current, variants, mb, disabled = false }) {
        const t = pickTexts(workoutId, current, variants, mb);
        legend.textContent = t.title;
        // 換模型中圓點不能按：焦點在圓點上的話，先放到整組上（被停用的圓點會把焦點丟到頁面最外層，Esc、Tab 都跑到轉場畫面外面），
        // 換好再放回選了的那個（11/24 瀏覽器測試抓到：用方向鍵換成 YOLO 之後按 Esc 收不起來）
        const inputs = [...cards.values()].map(c => c.input);
        if (disabled && inputs.includes(document.activeElement)) {
            box.tabIndex = -1;
            box.focus({ preventScroll: true });
        }
        for (const o of t.options) {
            const c = cards.get(o.family);
            c.name.textContent = o.label;
            c.tag.textContent = o.tag;
            c.points.replaceChildren(...o.points.map(text => {
                const line = document.createElement('span');
                line.className = 'mo-point';
                line.textContent = text;
                return line;
            }));
            c.input.checked = o.checked;
            c.input.disabled = disabled;
        }
        if (!disabled && box.hasAttribute('tabindex')) {
            if (document.activeElement === box) (inputs.find(i => i.checked) || inputs[0]).focus({ preventScroll: true });
            box.removeAttribute('tabindex');
        }
    };
}
