// 「複製手機資訊」（10/20）：實測時每支手機按一下、貼到筆記，之後整理成「各手機的實測數字」（10/22 保養）
// 系統、瀏覽器、螢幕，加上這次開鏡頭量到的速度（AI 每格幾毫秒、每秒幾格、用哪個模型）
// 只組成文字，不會傳到任何地方；按鈕和複製在 js/pages/main.js、js/ui/copy.js

// info：
//   time：Date；device：js/platform/support.js 的 describeDevice()；screen：{ width, height, dpr }；ua：識別字串
//   compute：'GPU'、'CPU'；computeDetail：晶片名稱；model：AI 模型；aiMs：AI 每格幾毫秒（還沒量到是 null）
//   aiFps、cameraFps：每秒幾格（還沒算出來是 0 或 null）；cameraMax：鏡頭最多每秒幾格；size：鏡頭畫面大小（例如 640×480）
//   fpsSetting：每秒格數的設定（例如「自動，目前 30 格」）；luma：畫面亮度 0～255；wake：螢幕保持亮著的說明；baseline：個人校正
export function phoneReport(info) {
    const t = info.time;
    const stamp = t.getFullYear() + '/' + (t.getMonth() + 1) + '/' + t.getDate() + ' '
        + t.getHours() + ':' + String(t.getMinutes()).padStart(2, '0');
    const d = info.device || {};
    const lines = ['【手機資訊】' + stamp];
    lines.push('系統：' + [d.os, d.osVersion].filter(Boolean).join(' ') + ' · 瀏覽器：' + (d.browser || '不明'));
    if (info.screen) lines.push('螢幕：' + info.screen.width + '×' + info.screen.height + '（像素密度 ' + info.screen.dpr + '）');
    lines.push('運算：' + (info.compute || '不明') + (info.computeDetail ? '（' + info.computeDetail + '）' : ''));
    const speed = ['AI 模型 ' + (info.model || '不明')];
    speed.push(Number.isFinite(info.aiMs) ? 'AI 每格 ' + Math.round(info.aiMs) + ' 毫秒' : 'AI 每格還在量（開鏡頭約 10 秒後再按）');
    if (info.aiFps) speed.push('AI 每秒 ' + info.aiFps + ' 格');
    lines.push(speed.join(' · '));
    const cam = [];
    if (info.size) cam.push(info.size);
    if (info.cameraFps) cam.push('每秒 ' + info.cameraFps + ' 格' + (info.cameraMax ? '（最多 ' + info.cameraMax + '）' : ''));
    if (info.fpsSetting) cam.push('設定：' + info.fpsSetting);
    lines.push('鏡頭：' + (cam.length ? cam.join(' · ') : '還沒開'));
    const other = [];
    if (Number.isFinite(info.luma)) other.push('畫面亮度 ' + Math.round(info.luma));
    if (info.wake) other.push(info.wake);
    if (info.baseline) other.push('校正：站直膝 ' + info.baseline.knee + '°、手機傾斜 ' + Math.abs(info.baseline.tilt).toFixed(1) + '°');
    if (other.length) lines.push(other.join(' · '));
    lines.push('識別字串：' + (info.ua || ''));
    return lines.join('\n');
}
