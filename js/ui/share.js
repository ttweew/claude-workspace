// 分享一段文字（11/14，「分享這次的結果」）：手機用系統的分享選單（LINE、訊息、筆記…），
// 不能用的瀏覽器（多半是電腦）改成複製到剪貼簿（js/ui/copy.js，複製不了時放一個文字框讓使用者自己複製）
import { copyText } from './copy.js';

// text：要分享的文字；button：按的那顆按鈕；status：寫結果的地方
// 回傳 'shared'（分享出去了）、'cancelled'（打開分享選單又關掉）、'copied'（複製了）、'manual'（請使用者自己複製）
export async function shareOrCopy(text, button, status) {
    if (typeof navigator.share === 'function') {
        try {
            await navigator.share({ text });
            status.textContent = '已經送到分享選單';
            return 'shared';
        } catch (err) {
            // 使用者自己關掉分享選單：不用再複製一次
            if (err && err.name === 'AbortError') {
                status.textContent = '';
                return 'cancelled';
            }
            // 其他情況（這個瀏覽器不讓網頁分享文字）：改用複製
        }
    }
    return (await copyText(text, button, status)) ? 'copied' : 'manual';
}
