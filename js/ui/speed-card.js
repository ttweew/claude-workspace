// 鏡頭畫面的「測 AI 速度」卡片（11/25）：數據面板按「測 AI 速度」打開
//   開始前：寫要測哪幾個、大約多久、最多要下載多少（第一次用 YOLO 要下載 AI 引擎和模型檔），按「開始」才測
//   測的時候：寫第幾個、暖機還是量測中、量了幾秒；按「停止」不測了
//   測完：表格列出每個模型每格幾毫秒、每秒幾格、GPU 或 CPU；「複製結果」貼到 LINE；換回原本用的模型（使用者選的不會變）
// 換模型、每一格的結果在 main.js（hooks）；算法和文字在 js/ai/model-speed.js
import { SPEED_PLAN, ModelTimer, speedOrder, speedRows, speedReport, speedDownloadBytes } from '../ai/model-speed.js';
import { profileOf } from '../ai/models.js';
import { copyText } from './copy.js';

const TICK_MS = 250;        // 多久看一次量好了沒（秒數也這時候更新）
const NOTICE_MS = 4000;     // 「測速中不能錄影」這類說明寫多久，再換回進度

// els：{ root, text（念出來的狀態）, clock（一直在變的秒數、下載進度：不念）, table, note, go, copy, close, copyStatus, opener }
// hooks：
//   blocked()：現在不能開始的原因（錄影中、AI 還沒好、正在換模型…），可以開始是 ''
//   broken()：AI 壞了（測到一半壞掉就停）
//   current()：現在用的模型（'lite'…）
//   switchTo(key, onStatus)：換模型，onStatus(文字) 回報下載進度；換好回傳 ''，失敗回傳原因（原本的模型照常能用）
//   compute()：{ compute：'GPU'、'CPU', detail：晶片名稱… }
//   onRunning(on)：開始、結束測速（main.js：測的時候不跳速度建議、不自動調、不能錄影、不能換模型和每秒格數）
//   reportInfo()：複製的文字要的手機、鏡頭資訊（js/ai/model-speed.js 的 speedReport）
// 回傳 { open(), close(reason), stop(reason), frame(ms, person), running(), say(text) }
//   close：收起卡片（關鏡頭）；stop：停下來但卡片留著寫原因（換鏡頭、畫面轉向，鏡頭重開）
export function setupSpeedCard(els, hooks) {
    const { root, text, clock, table, note, go, copy, close, copyStatus, opener } = els;
    let mode = 'closed';        // 'closed'、'ready'（還沒開始）、'running'、'finished'
    let results = [];
    let timer = null;           // 正在量的模型（ModelTimer）
    let stopWhy = '';           // 按了停止、關了鏡頭、切到背景：不測了的原因
    let endMeasure = null;      // 量到一半不測了：馬上結束這一個
    let stage = '';             // 現在的進度（念出來的那一行）
    let notice = '', noticeTimer = null;

    // 畫面上的名字（MediaPipe lite…）；不認得的名字原樣（不會發生：模型都從能力表來，只是不讓卡片因此壞掉）
    const label = key => (profileOf(key) || { label: String(key) }).label;
    const render = () => {
        const value = notice || stage;
        if (text.textContent !== value) text.textContent = value;
    };
    const setStage = value => { stage = value; render(); };
    const setClock = value => { if (clock.textContent !== value) clock.textContent = value; };

    // 按鈕：還沒開始「開始、取消」；測的時候只有「停止」；測完「再測一次、複製結果、關閉」
    function showButtons() {
        go.textContent = mode === 'running' ? '停止' : mode === 'finished' ? '再測一次' : '開始';
        copy.hidden = mode !== 'finished' || !results.length;
        close.hidden = mode === 'running';
        close.textContent = mode === 'finished' ? '關閉' : '取消';
    }

    function intro() {
        const mb = Math.round(speedDownloadBytes(hooks.current()) / 1e6);
        const seconds = (SPEED_PLAN.warmupMs + SPEED_PLAN.measureMs) / 1000;
        return '輪流用 MediaPipe lite、full、YOLO26n、YOLO26s 各算約 ' + seconds + ' 秒（共約 1 分鐘）。手機放穩、人站進畫面。'
            + '第一次最多要下載約 ' + mb + ' MB（下載過的不用），建議用 Wi-Fi；測完換回原本的模型。';
    }

    function clearResults() {
        results = [];
        table.hidden = true;
        note.hidden = true;
        copyStatus.textContent = '';
        const fallback = root.querySelector('.copy-fallback');
        if (fallback) fallback.remove();
    }

    function open() {
        if (mode === 'running') {
            root.hidden = false;
            return;
        }
        mode = 'ready';
        clearResults();
        setClock('');
        setStage(hooks.blocked() || intro());
        root.hidden = false;
        showButtons();
        go.focus({ preventScroll: true });
    }

    // 收起卡片；測的時候先停下來（換回原本的模型照樣會做完）。reason：為什麼停（關了鏡頭…）
    function closeCard(reason = '') {
        if (mode === 'closed') return;
        if (mode === 'running') stop(reason || '關掉了');
        else mode = 'closed';
        const focused = root.contains(document.activeElement);
        root.hidden = true;
        if (focused && opener && !opener.hidden && !opener.closest('[hidden]')) opener.focus({ preventScroll: true });
    }

    // 不再寫「測速中不能錄影」這類說明，換回進度
    function clearNotice() {
        clearTimeout(noticeTimer);
        notice = '';
    }

    function stop(reason) {
        if (mode !== 'running' || stopWhy) return;
        stopWhy = reason;
        clearNotice();
        setStage('停止中…（' + reason + '）');
        if (endMeasure) endMeasure();
    }

    // 量一個模型：暖機 2 秒、量 8 秒（畫面裡有人的格子不夠就多等，最多 20 秒）
    function measure(head, key) {
        return new Promise(resolve => {
            timer = new ModelTimer(performance.now());
            let loop = null;
            const finish = state => {
                clearInterval(loop);
                endMeasure = null;
                const t = timer;
                timer = null;
                resolve(state === 'stopped' ? null : { key, ...t.result(), ...hooks.compute(), error: state === 'nobody' ? '畫面裡沒有人' : '' });
            };
            const tick = () => {
                // AI 壞掉了（重新啟動也救不回來）：不會再有新的格子，不用等到 20 秒
                if (hooks.broken()) {
                    stop('AI 無法使用');
                    return;
                }
                const now = performance.now();
                const state = timer.state(now);
                if (state === 'done' || state === 'nobody') {
                    finish(state);
                    return;
                }
                // 念出來的那一行只在換階段時變（暖機 → 量測中 → 等你站進畫面）；秒數一直在變，放在不念的那一格
                const what = state === 'warmup' ? '暖機中' : timer.seesPerson(now) ? '量測中' : '等你站進畫面';
                if (stage !== head + what) setStage(head + what);
                setClock(state === 'warmup' ? '' : timer.seconds(now) + '／' + SPEED_PLAN.measureMs / 1000 + ' 秒');
            };
            endMeasure = () => finish('stopped');
            loop = setInterval(tick, TICK_MS);
            tick();
        });
    }

    async function run() {
        mode = 'running';
        stopWhy = '';
        clearResults();
        showButtons();
        hooks.onRunning(true);
        const start = hooks.current();
        const order = speedOrder(start);
        for (let i = 0; i < order.length && !stopWhy; i++) {
            const key = order[i];
            const head = (i + 1) + '／' + order.length + ' ' + label(key) + '：';
            if (hooks.broken()) {
                stop('AI 無法使用');
                break;
            }
            if (hooks.current() !== key) {
                setStage(head + '換模型中');
                setClock('');
                const why = await hooks.switchTo(key, status => setClock(status));
                if (stopWhy) break;
                if (why) {
                    results.push({ key, error: '載入失敗：' + why });
                    continue;
                }
            }
            const result = await measure(head, key);
            if (result) results.push(result);
        }
        // 換回原本的模型（按了停止、關了鏡頭也要換回去）
        let back = '';
        if (hooks.current() !== start && !hooks.broken()) {
            setStage('換回 ' + label(start) + ' 中');
            setClock('');
            back = await hooks.switchTo(start, status => setClock(status));
        }
        mode = 'finished';
        hooks.onRunning(false);
        clearNotice();
        setClock('');
        const now = label(hooks.current());
        const broken = hooks.broken();
        const head = broken ? '已停止。' : stopWhy ? '已停止（' + stopWhy + '）。' : '測完了。';
        setStage(head + (broken ? 'AI 無法使用了：請關閉鏡頭重開，或重新整理頁面。'
            : back ? '換回 ' + label(start) + ' 失敗，現在用 ' + now + '：請到「AI 模型」重新選。' : '現在用 ' + now + '（原本的）。'));
        showTable();
        showButtons();
    }

    // 結果的表格：模型｜每格｜每秒｜運算；沒量到的那一列寫原因
    function showTable() {
        table.tBodies[0].replaceChildren(...speedRows(results).map(row => {
            const tr = document.createElement('tr');
            const th = document.createElement('th');
            th.scope = 'row';
            th.textContent = row.label;
            tr.append(th);
            if (row.error) {
                const td = document.createElement('td');
                td.colSpan = 3;
                td.className = 'speed-miss';
                td.textContent = row.error;
                tr.append(td);
                return tr;
            }
            const ms = document.createElement('td');
            ms.textContent = row.ms;
            if (row.ratio) {
                const small = document.createElement('small');
                small.textContent = 'lite 的 ' + row.ratio + ' 倍';
                ms.append(small);
            }
            const fps = document.createElement('td');
            fps.textContent = row.fps;
            const compute = document.createElement('td');
            compute.textContent = row.compute;
            tr.append(ms, fps, compute);
            return tr;
        }));
        table.hidden = false;
        note.hidden = false;
    }

    go.addEventListener('click', () => {
        if (mode === 'running') {
            stop('按了停止');
            return;
        }
        const why = hooks.blocked();
        if (why) {
            setStage(why);
            return;
        }
        run();
    });
    close.addEventListener('click', () => closeCard());
    copy.addEventListener('click', () => {
        copyText(speedReport({ ...hooks.reportInfo(), time: new Date(), results }), copy, copyStatus);
    });
    // 切到背景：鏡頭、AI 都停了，量的數字不準，直接停（回來之後再按「再測一次」）
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) stop('切到背景了');
    });

    return {
        open,
        close: closeCard,
        stop,
        // 每一格 AI 的結果回來時（main.js 的 measureFrame）
        frame(ms, person) {
            if (timer) timer.frame(ms, person, performance.now());
        },
        running: () => mode === 'running',
        // 測的時候按了錄影之類的：卡片上寫為什麼不行，4 秒後換回進度
        say(value) {
            if (mode !== 'running') return;
            notice = value;
            render();
            clearTimeout(noticeTimer);
            noticeTimer = setTimeout(() => { notice = ''; render(); }, NOTICE_MS);
        }
    };
}
