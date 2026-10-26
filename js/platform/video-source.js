// 示範模式（10/26 提案）：選一段影片當鏡頭，網站照樣畫骨架、計次、講話
// 報告時不用現場運動；網路上的教練影片（下載下來的檔案）也能直接看網站怎麼判斷
// 做法：在看不到的 <video> 播影片，用 captureStream() 變成和鏡頭一樣的串流，交給 main.js 原本的鏡頭流程（同一套 AI、計次、說話）
// 影片只在這台裝置上播，不上傳。iPhone、iPad 的 Safari 沒有 captureStream，不能用（main.js 把按鈕藏起來）

// 這個瀏覽器能不能用影片當鏡頭
export function videoFileSupported() {
    const proto = typeof HTMLVideoElement === 'undefined' ? null : HTMLVideoElement.prototype;
    return !!proto && (typeof proto.captureStream === 'function' || typeof proto.mozCaptureStream === 'function');
}

// 選到的檔案是不是影片：先看瀏覽器給的類型；沒有類型（有些手機、副檔名少見）就讓瀏覽器試著播，播不了再說明
export function looksLikeVideo(file) {
    return !!file && typeof file.type === 'string' && (file.type === '' || file.type.startsWith('video/'));
}

// 開始播影片，回傳 { stream, stop() }：stream 和鏡頭的串流一樣用；stop() 停止播放、釋放檔案
// onEnded：影片播完（main.js 關掉鏡頭畫面、顯示總結）
// 播不了（不是影片、格式不支援、檔案壞了）就丟出錯誤，err.demo 是給使用者看的說明
export async function openVideoFile(file, { onEnded }) {
    const el = document.createElement('video');
    el.muted = true;          // 不放影片的聲音：網站自己的語音提示才聽得清楚；沒聲音瀏覽器也才肯自動播放
    el.playsInline = true;
    el.preload = 'auto';
    const url = URL.createObjectURL(file);
    let stopped = false;
    const stop = () => {
        if (stopped) return;
        stopped = true;
        el.onended = null;
        el.pause();
        el.removeAttribute('src');
        el.load();
        URL.revokeObjectURL(url);
    };
    try {
        await new Promise((resolve, reject) => {
            el.onloadeddata = resolve;
            el.onerror = () => reject(new Error('cannot decode'));
            el.src = url;
        });
        el.onloadeddata = el.onerror = null;
        if (!el.videoWidth || !el.videoHeight) throw new Error('no picture');
        await el.play();
        const stream = (el.captureStream || el.mozCaptureStream).call(el);
        if (!stream.getVideoTracks().length) throw new Error('no video track');
        el.onended = () => { if (!stopped) onEnded(); };
        return { stream, stop };
    } catch (err) {
        stop();
        const failed = new Error('這段影片播不了（可能不是影片，或瀏覽器不支援這種格式），請換一段（mp4、webm）');
        failed.demo = true;
        failed.cause = err;
        throw failed;
    }
}
