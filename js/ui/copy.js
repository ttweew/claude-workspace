// 複製一段文字（使用說明的「複製檢查結果」、鏡頭畫面的「複製手機資訊」共用）
// 有些瀏覽器不允許網頁直接複製（舊版、App 內建瀏覽器）：改成在按鈕後面放一個選好的文字框，讓使用者自己長按複製

// text：要複製的文字；button：按的那個按鈕（文字框放在它後面）；status：顯示結果的地方
export async function copyText(text, button, status) {
    const old = button.parentElement && button.parentElement.querySelector('.copy-fallback');
    if (old) old.remove();
    try {
        await navigator.clipboard.writeText(text);
        status.textContent = '已複製，可以貼到 LINE 或訊息裡';
        return true;
    } catch (err) {
        const area = document.createElement('textarea');
        area.value = text;
        area.rows = 6;
        area.className = 'copy-fallback';
        area.readOnly = true;
        button.after(area);
        area.select();
        status.textContent = '請長按上面的文字，選「全選」再「拷貝」';
        return false;
    }
}
