// 首頁「實測模式」卡片：開關、受測者代號、每組做完要不要馬上下載（存在這台裝置上，js/data/test-mode.js）
// 10/21 從進階設定拿出來（使用者回饋：收在裡面不容易發現）；開著時卡片變黃、首頁最上面一條黃色提醒（用完忘了關，平常運動也會一直錄）
// 10/22 從 main.js 搬出來；鏡頭畫面上每一組的按鈕在 js/ui/test-bar.js
import { saveTestMode, cleanSubject } from '../data/test-mode.js';

// mode：目前的設定 { on, subject, autoDownload }；onChange(mode)：改了設定（main.js 用新的設定重畫鏡頭畫面上的實測列）
export function setupTestCard(mode, onChange) {
    const toggle = document.getElementById('testToggle');
    const subject = document.getElementById('testSubject');
    const autoDownload = document.getElementById('testAutoDownload');
    const box = document.getElementById('testBox');
    const more = document.getElementById('testMore');
    const note = document.getElementById('testOnNote');
    toggle.checked = mode.on;
    subject.value = mode.subject;
    autoDownload.checked = mode.autoDownload;
    function show() {
        box.classList.toggle('on', mode.on);
        more.hidden = !mode.on;
        note.hidden = !mode.on;
        if (mode.on) {
            const small = document.createElement('small');
            small.textContent = '選動作後每一組自動錄製。實測做完記得到下面「實測模式」關掉';
            note.replaceChildren('實測模式開著 · 受測者 ' + mode.subject, small);
        }
    }
    function change() {
        mode = { on: toggle.checked, subject: cleanSubject(subject.value), autoDownload: autoDownload.checked };
        subject.value = mode.subject;
        saveTestMode(mode);
        show();
        onChange(mode);
    }
    show();
    toggle.addEventListener('change', change);
    subject.addEventListener('change', change);
    autoDownload.addEventListener('change', change);
}
