// 老師 11/18 白板上的四個指標：精確率、召回率、準確率、F1（把「這一下有沒有做錯」當成是非題）
// 先數四格（混淆矩陣）：
//   tp 抓到：真的做錯、網站也報了那種錯        fn 漏掉：真的做錯、網站沒報那種錯
//   fp 誤報：做對的、網站報了錯                tn 沒事：做對的、網站沒報錯
// 11/18 用 10/20 真人實測手算過一次（抓到 49、漏掉 1、誤報 7、沒事 43 → 87.5%、98%、92%、92.5%）；
// 實測報表（js/pages/report.js）、研究成果頁（results.html，測試會核對）都用這裡算，數字才會一樣

// 四格的數字：不是數字、負的（程式算錯或被改過的資料）當作 0，畫面上不會出現 NaN
export function cleanCounts(c) {
    const n = v => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 0);
    return { tp: n(c && c.tp), fn: n(c && c.fn), fp: n(c && c.fp), tn: n(c && c.tn) };
}

// 兩組加起來（例如每個動作加成全部）
export function addCounts(a, b) {
    const x = cleanCounts(a), y = cleanCounts(b);
    return { tp: x.tp + y.tp, fn: x.fn + y.fn, fp: x.fp + y.fp, tn: x.tn + y.tn };
}

// 四個指標（0～1）；分母是 0 算不出來的是 null（畫面寫「—」）
//   精確率 = 抓到 ÷（抓到＋誤報）：網站說「做錯」的，有幾成真的做錯（越高越少冤枉人）
//   召回率 = 抓到 ÷（抓到＋漏掉）：真的做錯的，網站抓到幾成（越高越少漏掉）
//   準確率 =（抓到＋沒事）÷ 全部：全部的判斷裡對的比例
//   F1 = 2 × 抓到 ÷（2 × 抓到＋誤報＋漏掉）：和「2 × 精確率 × 召回率 ÷（精確率＋召回率）」一樣，
//        但一下都沒報時精確率算不出來，這個寫法還是算得出 0（真的做錯的全部漏掉）
export function scores(counts) {
    const { tp, fn, fp, tn } = cleanCounts(counts);
    const ratio = (a, b) => (b > 0 ? a / b : null);
    return {
        precision: ratio(tp, tp + fp),
        recall: ratio(tp, tp + fn),
        accuracy: ratio(tp + tn, tp + fn + fp + tn),
        f1: ratio(2 * tp, 2 * tp + fp + fn)
    };
}

// 百分比的字：四捨五入到小數一位，整數不寫 .0（87.5%、98%）；算不出來寫「—」
export function percentText(x) {
    if (typeof x !== 'number' || !Number.isFinite(x)) return '—';
    const v = Math.round(x * 1000) / 10;
    return (Number.isInteger(v) ? String(v) : v.toFixed(1)) + '%';
}
