// 運動完問一次要不要打開雲端同步（10/19 組員回饋：開關收在「進階設定」裡，幾乎沒人看到）
// 第一次有運動總結的時候，在總結下面問；按「打開」或「不用了」都算問過，之後不再問。雲端同步預設還是關閉
// 開關本身也拿到首頁上了，使用者自己開、關過也算問過
const KEY = 'cloudAsked';

// available：網站接上 Firebase 了沒；enabled：已經打開；hasSummary：這次有運動總結（自由模式沒有）；asked：問過了
export function shouldAskCloud({ available, enabled, hasSummary, asked }) {
    return !!(available && !enabled && hasSummary && !asked);
}

// 存不了（私密瀏覽、儲存空間滿了）：當作問過，免得每做完一組都問一次
export function loadAsked() {
    try {
        return localStorage.getItem(KEY) === '1';
    } catch (err) {
        return true;
    }
}

export function saveAsked() {
    try { localStorage.setItem(KEY, '1'); } catch (err) { /* 存不了就算了：這次不會再問 */ }
}
