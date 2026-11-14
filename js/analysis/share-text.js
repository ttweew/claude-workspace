// 分享這次的結果（11/14）：把首頁「這次運動」寫的那幾行整理成一段文字，貼到 LINE、筆記都可以
// 只有文字和數字（沒有影像、骨架、帳號），使用者按了「分享這次的結果」才會送出去（js/ui/share.js）
// 這個檔案只組文字；內容都是畫面上已經寫的，數字和總結一字不差

// 一則訊息不要太長（LINE 一則訊息看得完）：超過就只留前面的，最後一行寫網址
export const SHARE_MAX = 900;

const two = n => String(n).padStart(2, '0');
// 日期時間照這台裝置的時區：「11/14 17:30」
export function shareDate(ms) {
    const d = new Date(ms);
    if (!Number.isFinite(d.getTime())) return '';
    return (d.getMonth() + 1) + '/' + d.getDate() + ' ' + two(d.getHours()) + ':' + two(d.getMinutes());
}

// parts：{ date（這次運動開始的時間，毫秒）, list（做了哪幾個動作那一句，沒有是 ''）, lines（總結每一行）,
//   ai（AI 評分那一句等，陣列）, advice（教練建議每一句）, url（網站的網址） }
// 每一段都可能是空的；不是字串的不寫（畫面上的字理論上都是字串，保險）
export function shareText({ date, list = '', lines = [], ai = [], advice = [], url = '' } = {}) {
    const text = v => (typeof v === 'string' ? v.trim() : '');
    const when = shareDate(date);
    const out = ['AI 智慧運動分析系統' + (when ? '｜' + when : '')];
    if (text(list)) out.push(text(list));
    for (const line of lines) if (text(line)) out.push(text(line));
    for (const line of ai) if (text(line)) out.push(text(line));
    const tips = advice.map(text).filter(Boolean);
    if (tips.length) out.push('教練建議：' + tips.join(''));
    const tail = text(url);
    // 太長：從後面的行開始拿掉（最重要的次數、到位在前面），網址一定留著
    const room = SHARE_MAX - (tail ? tail.length + 1 : 0);
    while (out.length > 1 && out.join('\n').length > room) out.pop();
    let body = out.join('\n');
    if (body.length > room) body = body.slice(0, Math.max(0, room));
    return tail ? body + '\n' + tail : body;
}
