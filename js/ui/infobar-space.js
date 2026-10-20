// 鏡頭畫面左上角的狀態列（偵測狀態、運算標籤、光線提醒…）字多時會換行變高；
// 下面置中的大字（入鏡提示、動作錯誤的紅字、每一下的提示）原本固定在 104px，狀態列換行時會被蓋住
// （10/19 發現：320 寬的小手機上「已偵測到全身」＋「CPU · 30 FPS」排不下一行，第二行蓋到紅字）
// 狀態列變高時，把這幾個大字往下推到狀態列下面 8px（CSS 變數 --below-info）；沒換行時位置不變

const GAP = 8;

// infobar：狀態列；stage：鏡頭畫面（大字和狀態列都放在裡面）
export function keepBelowInfobar(infobar, stage) {
    const update = () => {
        const bottom = infobar.offsetHeight ? infobar.offsetTop + infobar.offsetHeight + GAP : 0;
        const value = bottom + 'px';
        if (stage.style.getPropertyValue('--below-info') !== value) stage.style.setProperty('--below-info', value);
    };
    // 狀態列裡的字換了（例如光線提醒出現）、螢幕轉向，高度都會變：ResizeObserver 都看得到
    if (typeof ResizeObserver === 'function') new ResizeObserver(update).observe(infobar);
    else window.addEventListener('resize', update);
    update();
    return update;
}
