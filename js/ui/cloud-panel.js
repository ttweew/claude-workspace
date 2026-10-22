// 首頁的雲端同步（js/cloud/cloud.js）：開關、狀態、刪除雲端上的紀錄，和運動完的詢問（10/22 從 main.js 搬出來）
// 預設關閉；打開時把這台裝置的運動紀錄傳上去，之後每次運動完自動上傳；網站還沒接上 Firebase 時整段不出現
// 運動完要不要問（只問一次）的規則在 js/ui/cloud-ask.js
import { cloud } from '../cloud/cloud.js';
import { shouldAskCloud, loadAsked, saveAsked } from './cloud-ask.js';
import { loadHistory } from '../analysis/session.js';

// 回傳 { afterSession() }：一次運動存成紀錄之後呼叫（上傳這一筆、需要時在總結下面問一次）
export function setupCloudPanel() {
    const box = document.getElementById('cloudBox');
    const toggle = document.getElementById('cloudToggle');
    const status = document.getElementById('cloudStatus');
    const del = document.getElementById('cloudDelete');
    const ask = document.getElementById('cloudAsk');   // 總結下面：問一次要不要打開雲端同步
    let asked = loadAsked();

    box.hidden = !cloud.available;
    toggle.checked = cloud.enabled;
    cloud.onStatus(s => {
        status.textContent = s.text;
        status.dataset.state = s.state;
        del.hidden = !cloud.hasData || s.state === 'working';
    });
    // 自己開、關過：之後運動完不用再問
    function answer() {
        asked = true;
        saveAsked();
        ask.hidden = true;
    }
    toggle.addEventListener('change', () => {
        cloud.setEnabled(toggle.checked, loadHistory());
        answer();
    });
    // 運動完的詢問：「打開」和直接打開開關一樣；「不用了」之後不再問（開關還在首頁上，隨時可以打開）
    document.getElementById('cloudAskYes').addEventListener('click', () => {
        toggle.checked = true;
        cloud.setEnabled(true, loadHistory());
        answer();
        toggle.focus();
    });
    document.getElementById('cloudAskNo').addEventListener('click', answer);
    // 刪除雲端上這台裝置的紀錄（這台裝置上的不動），同時關閉同步
    del.addEventListener('click', async () => {
        if (!confirm('確定要刪除雲端上這台裝置的運動紀錄嗎？這台裝置上的紀錄不會被刪掉，雲端同步也會關閉。')) return;
        toggle.checked = false;
        toggle.disabled = true;
        await cloud.deleteAll();
        toggle.disabled = false;
    });
    // 網路恢復、打開網頁時：補傳還沒上傳的
    window.addEventListener('online', () => cloud.sync(loadHistory()));
    cloud.sync(loadHistory());

    return {
        afterSession() {
            // 打開了雲端同步：這一筆存一份到雲端（沒有網路時先存在這台裝置，之後自動補傳）
            cloud.sync(loadHistory());
            // 還沒打開、也還沒問過：在總結下面問一次要不要打開
            ask.hidden = !shouldAskCloud({ available: cloud.available, enabled: cloud.enabled, hasSummary: true, asked });
        }
    };
}
