// 使用說明「實測任務卡」：組員實測那天照著做，每一項做完打勾（10/19）
// 勾選只存在這台裝置上（localStorage），重新整理、隔天再打開都還在
const KEY = 'testdayTasks';

// 存的資料可能被改過或壞掉：只留還在卡片上的項目代號（先比對清單，不直接拿去查物件）
export function cleanDone(raw, known) {
    let list;
    try {
        list = JSON.parse(raw);
    } catch (err) {
        return new Set();
    }
    if (!Array.isArray(list)) return new Set();
    return new Set(list.filter(id => typeof id === 'string' && known.includes(id)));
}

export function progressText(done, total) {
    if (!done) return '還沒開始：共 ' + total + ' 項';
    if (done >= total) return '全部做完了！記得把檔案放到 Google Drive';
    return '做完 ' + done + '／' + total + ' 項';
}

// root：卡片（裡面的 input[data-task]）；progress：顯示做完幾項；reset：全部取消勾選的按鈕
export function setupTaskCard({ root, progress, reset }) {
    const boxes = [...root.querySelectorAll('input[data-task]')];
    const known = boxes.map(b => b.dataset.task);
    let raw = null;
    try { raw = localStorage.getItem(KEY); } catch (err) { /* 不能讀：從沒勾過開始 */ }
    const done = cleanDone(raw, known);
    const show = () => { progress.textContent = progressText(done.size, boxes.length); };
    const save = () => {
        try { localStorage.setItem(KEY, JSON.stringify([...done])); } catch (err) { /* 存不了：這次打開有效 */ }
    };
    for (const box of boxes) {
        box.checked = done.has(box.dataset.task);
        box.addEventListener('change', () => {
            if (box.checked) done.add(box.dataset.task);
            else done.delete(box.dataset.task);
            save();
            show();
        });
    }
    reset.addEventListener('click', () => {
        if (!done.size || !confirm('全部取消勾選？')) return;
        done.clear();
        for (const box of boxes) box.checked = false;
        save();
        show();
    });
    show();
}
