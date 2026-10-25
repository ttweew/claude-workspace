// 錄製上限（10/25 從 main.js 搬出來，行為不變）：數據面板「最多 5 分鐘」選單和旁邊的檔案大小
// 以前固定 5 分鐘；老師 10/12 回饋改成可以選 5、10、15、20 分鐘（會記住選擇）
// 旁邊顯示檔案大約多大；手機選 15、20 分鐘時提醒：錄製中的資料都放在記憶體裡（20 分鐘約 165 MB），
// 手機的瀏覽器記憶體不夠時會直接重新整理網頁，整段就不見了。只提醒、不禁止（有些手機記憶體夠）
import { MAX_SECONDS, LIMIT_MINUTES, JSON_MB_PER_MINUTE } from '../data/recorder.js';
import { describeDevice } from '../platform/support.js';

const PHONE = ['iOS', 'iPadOS', 'Android'].includes(describeDevice().os);
const PHONE_WARN_MINUTES = 15;
const KEY = 'recordLimit';

// select：#limitSelect；note：#limitNote
// recording()：是不是正在錄（錄製中不顯示說明，那一列留給「錄製中 0:12／10:00」）
// frameRate()：鏡頭實際設定的每秒格數（選 60 但鏡頭只給 30，就照 30 算；還沒開鏡頭時用選的格數）
// 回傳 { minutes()：選的上限（分鐘）, show()：重寫說明（錄製開始、停止、換每秒格數時呼叫） }
export function setupRecLimit(select, note, { recording, frameRate }) {
    try {
        const saved = localStorage.getItem(KEY);
        if (saved !== null && LIMIT_MINUTES.includes(Number(saved))) select.value = saved;
    } catch (err) { /* 不能存就用預設 */ }

    function minutes() {
        return Number(select.value) || MAX_SECONDS / 60;
    }

    function show() {
        const m = minutes();
        // 鏡頭每秒格數比 30 多（使用者選了 60 格以上），檔案和記憶體跟著變大，提醒的門檻跟著提早
        const load = m * Math.max(1, frameRate() / 30);
        // 四捨五入到 5 MB：只是大概，實際大小看每秒幾格、有沒有偵測到人
        const mb = Math.round(load * JSON_MB_PER_MINUTE / 5) * 5;
        const warn = PHONE && load >= PHONE_WARN_MINUTES;
        note.textContent = '檔案約 ' + mb + ' MB'
            + (warn ? '。手機錄太久，瀏覽器可能記憶體不夠而重新整理，錄的資料會不見；建議用電腦，或分成幾段錄' : '');
        note.classList.toggle('warn', warn);
        note.hidden = recording();
    }

    select.addEventListener('change', () => {
        try { localStorage.setItem(KEY, select.value); } catch (err) { /* 不能存就不記 */ }
        show();
    });
    show();
    return { minutes, show };
}
