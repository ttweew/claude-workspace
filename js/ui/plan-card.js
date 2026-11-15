// 首頁的「智慧課表」卡片（11/14，js/analysis/plan.js）：一行寫這次排的（「深蹲 11 下 → 伏地挺身 8 下 → …」）、
// 一顆「開始課表」；點開「怎麼排的」看每一項的理由（上次做了幾下、做得好不好、弱點），勾選要做哪幾項（會記住）
// 運動紀錄、目標變了（做完一次運動、改了「目標」卡片）就重新排一次
import { PLAN_ORDER, suggestPlan, stepText, planLine, focusText, loadPlanPicks, savePlanPicks } from '../analysis/plan.js';

// els：{ line（那一行課表）, list（每一項的清單）, start（開始課表）, hint（下面的說明）}
// getHistory()、getGoals()：這台裝置上的運動紀錄、目標；onStart(steps)：按「開始課表」
// 回傳 { refresh()（重新排）, setDisabled(on, why)（不能開鏡頭、實測模式開著時不能按，why 寫在下面） }
export function setupPlanCard(els, { getHistory, getGoals, onStart }) {
    let picks = loadPlanPicks();
    let steps = [];
    let blocked = '';

    function render() {
        // 四項都排出來（沒勾的也寫，勾了就知道會排多少）；steps 只有勾選的
        const all = suggestPlan(getHistory(), getGoals(), PLAN_ORDER);
        steps = all.filter(s => picks.includes(s.workout));
        els.line.textContent = planLine(steps);
        els.list.replaceChildren(...all.map(step => {
            const li = document.createElement('li');
            const label = document.createElement('label');
            const box = document.createElement('input');
            box.type = 'checkbox';
            box.checked = picks.includes(step.workout);
            box.dataset.workout = step.workout;
            // 至少要做一項：只剩一項時不能再取消
            box.disabled = box.checked && picks.length === 1;
            box.addEventListener('change', () => {
                const next = PLAN_ORDER.filter(id => (id === step.workout ? box.checked : picks.includes(id)));
                picks = savePlanPicks(next.length ? next : picks);
                render();
            });
            const name = document.createElement('span');
            name.className = 'plan-name';
            name.textContent = stepText(step);
            label.append(box, ' ', name);
            const why = document.createElement('small');
            why.className = 'plan-why';
            const focus = focusText(step);
            why.textContent = step.why + (focus ? '；' + focus : '');
            li.append(label, why);
            return li;
        }));
        els.start.disabled = !!blocked || !steps.length;
        els.hint.textContent = blocked;
        els.hint.hidden = !blocked;
    }

    els.start.addEventListener('click', () => {
        if (!blocked && steps.length) onStart(steps.map(s => ({ ...s })));
    });
    render();
    return {
        refresh: render,
        setDisabled(on, why = '') {
            blocked = on ? why || '現在不能開始課表' : '';
            render();
        }
    };
}
