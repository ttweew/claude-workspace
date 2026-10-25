// 首頁「目標」卡片（10/25 組員回饋）：每個動作選常用的目標（棒式 10～40 秒、其他 5～20 下）或自己填
// 選了馬上存在這台裝置上（js/analysis/goal.js），下次打開還在；自己填的數字不對時說明範圍、不存
import { WORKOUTS } from '../analysis/workouts.js';
import { GOAL_PRESETS, GOAL_RANGE, loadGoals, saveGoal, parseGoal, goalKind } from '../analysis/goal.js';

const ORDER = ['squat', 'pushup', 'plank', 'lunge'];
const CUSTOM = 'custom';
// 選「自己填」時先放的數字：之前的目標，沒有的話用常用的中間那個（10 下、30 秒；實測模式做對的一組是 10 下、30 秒）
const START = { reps: 10, hold: 30 };

// onChange(goals)：改了目標（main.js 換成新的目標）
export function setupGoalPick(onChange) {
    const rows = document.getElementById('goalRows');
    let goals = loadGoals();
    rows.replaceChildren(...ORDER.map(id => makeRow(id)));

    function makeRow(id) {
        const kind = goalKind(id);
        const unit = kind === 'hold' ? '秒' : '下';
        const [min, max] = GOAL_RANGE[kind];
        const row = document.createElement('div');
        row.className = 'goal-row';
        const label = document.createElement('label');
        label.htmlFor = 'goal-' + id;
        label.textContent = WORKOUTS[id].name;
        const select = document.createElement('select');
        select.id = 'goal-' + id;
        const option = (value, text) => {
            const o = document.createElement('option');
            o.value = value;
            o.textContent = text;
            return o;
        };
        select.append(option('', '不設目標'), ...GOAL_PRESETS[kind].map(n => option(String(n), n + ' ' + unit)), option(CUSTOM, '自己填…'));
        const custom = document.createElement('span');
        custom.className = 'goal-custom';
        const input = document.createElement('input');
        input.type = 'text';
        input.inputMode = 'numeric';
        input.maxLength = 4;
        input.autocomplete = 'off';
        input.id = 'goalInput-' + id;
        input.setAttribute('aria-label', WORKOUTS[id].name + '的目標（' + min + '～' + max + ' ' + unit + '）');
        const unitText = document.createElement('span');
        unitText.textContent = unit;
        custom.append(input, unitText);
        const note = document.createElement('p');
        note.className = 'goal-note';
        note.id = 'goalNote-' + id;
        note.setAttribute('role', 'status');
        input.setAttribute('aria-describedby', note.id);
        row.append(label, select, custom, note);

        // 畫面照存的目標：常用的數字選那一項，其他的選「自己填」並把數字放進框裡
        const value = Object.prototype.hasOwnProperty.call(goals, id) ? goals[id] : null;
        const preset = value !== null && GOAL_PRESETS[kind].includes(value);
        select.value = value === null ? '' : preset ? String(value) : CUSTOM;
        input.value = value !== null && !preset ? String(value) : '';
        custom.hidden = select.value !== CUSTOM;

        const save = v => {
            goals = saveGoal(id, v);
            onChange(goals);
        };
        const check = () => {
            const v = parseGoal(id, input.value);
            input.toggleAttribute('aria-invalid', v === null);
            note.textContent = v === null ? '請填 ' + min + '～' + max + ' 的整數' : '';
            if (v !== null) save(v);
        };
        select.addEventListener('change', () => {
            custom.hidden = select.value !== CUSTOM;
            note.textContent = '';
            input.removeAttribute('aria-invalid');
            if (select.value === CUSTOM) {
                // 先放之前的目標（或常用的數字），直接可以用；想改再改
                const now = Object.prototype.hasOwnProperty.call(goals, id) ? goals[id] : START[kind];
                input.value = String(now);
                save(now);
                input.focus();
                input.select();
            } else {
                save(select.value === '' ? null : Number(select.value));
            }
        });
        // 打字時：數字對了就存；不對時等打完（離開框或按 Enter）才說明，打到一半不跳紅字
        input.addEventListener('input', () => {
            const v = parseGoal(id, input.value);
            if (v !== null) {
                input.removeAttribute('aria-invalid');
                note.textContent = '';
                save(v);
            }
        });
        input.addEventListener('change', check);
        return row;
    }
}
