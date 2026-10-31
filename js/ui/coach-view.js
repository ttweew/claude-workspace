// 首頁的教練建議（10/31）：「AI 教練」開關（js/cloud/ai-coach.js），和總結裡的「教練建議」
//   一定有：網站內建的固定句子（js/analysis/coach.js 的 fixedAdvice）
//   AI 教練打開時：先寫「AI 教練想一下…」，Gemini 回答了就換成它寫的；失敗時用固定句子，並寫出原因
//   speak(text)：唸出來（main.js 決定要不要唸：完整語音、有中文的聲音才唸）
import { aiCoach, failureOf, FAILURE_TEXT } from '../cloud/ai-coach.js';
import { fixedAdvice } from '../analysis/coach.js';

const ON = '打開了：每組做完，把這組的數字（次數、角度、錯誤、疲勞、流暢度、穩定度）給 Gemini 寫兩三句建議';
const OFF = '關閉：用網站內建的固定建議';

export function setupCoach({ speak }) {
    const box = document.getElementById('coachBox');
    const toggle = document.getElementById('coachToggle');
    const note = document.getElementById('coachNote');
    const advice = document.getElementById('coachAdvice');
    const list = document.getElementById('coachLines');
    const source = document.getElementById('coachSource');
    const status = document.getElementById('coachStatus');

    box.hidden = !aiCoach.available;
    toggle.checked = aiCoach.enabled;
    note.textContent = aiCoach.enabled ? ON : OFF;
    toggle.addEventListener('change', () => {
        aiCoach.setEnabled(toggle.checked);
        note.textContent = aiCoach.enabled ? ON : OFF;
    });

    function render(lines, from, why = '') {
        list.replaceChildren(...lines.map(text => {
            const li = document.createElement('li');
            li.textContent = text;
            return li;
        }));
        source.textContent = from;
        status.textContent = why;
    }

    // 每次運動完一個號碼：Gemini 慢慢回來時，使用者已經又做了一組，舊的回答就不用了
    let round = 0;
    return {
        // facts：js/analysis/coach.js 的 coachFacts（null：這次不是計次、計時的動作，收起來）
        async show(facts) {
            const my = ++round;
            advice.hidden = !facts;
            if (!facts) return;
            const fixed = fixedAdvice(facts);
            if (!aiCoach.enabled) {
                render(fixed, '（固定建議）');
                speak(fixed.join(''));
                return;
            }
            render([], '（AI 教練）', 'AI 教練想一下…（最多 10 秒）');
            try {
                const lines = await aiCoach.advise(facts);
                if (my !== round) return;
                render(lines, '（AI 教練，Gemini）');
                speak(lines.join(''));
            } catch (err) {
                if (my !== round) return;
                console.warn('AI 教練：', err);
                render(fixed, '（固定建議）', FAILURE_TEXT[failureOf(err)]);
                speak(fixed.join(''));
            }
        }
    };
}
