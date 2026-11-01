// 成長曲線的雲端檢查用：6 次深蹲的紀錄（網站同一套 summarize 算的合成資料）＋預期的那一句
const W = process.argv[2];
const { summarize } = await import(W + '/js/analysis/session.js');
const { growthSeries, growthLine, mergeRecords } = await import(W + '/js/analysis/growth.js');
const at = (m, d, h = 20) => new Date(2026, m - 1, d, h).getTime();
const squat = (date, mins) => summarize('squat', mins.map((min, i) => ({ n: i + 1, min, depth: min <= 90 ? 'good' : min <= 110 ? 'close' : 'shallow', start: i * 3, end: i * 3 + 2, errors: i === 1 ? ['lean'] : [], similarity: 88 + i })), date, date + 60000);
const records = [squat(at(10, 18), [85, 95]), squat(at(10, 19), [85, 85, 100]), squat(at(10, 21), [85, 85, 85, 85]),
    squat(at(10, 24), [85, 85, 85, 85, 85]), squat(at(10, 27), [85, 85, 85, 85, 85, 85]), squat(at(10, 30), [85, 85, 85, 85, 85, 85, 85])];
const line = (list, m) => growthLine(growthSeries(list, 'squat', m));
console.log(JSON.stringify({ records, all: line(records, 'count'), allGood: line(records, 'good'), last2: line(records.slice(-2), 'count') }));
