// 一下的資料（tracker.items 的每一個）在記憶體裡大約多大：照計次時真的會有的欄位做 1000 個，量 heap 差多少
const before = (globalThis.gc && gc(), process.memoryUsage().heapUsed);
const keep = [];
for (let i = 0; i < 1000; i++) {
    keep.push({ n: i + 1, start: 12.345 + i, bottom: 13.1 + i, end: 14.2 + i, min: 85.12345, minAux: 70.5, depth: 'good', oblique: false,
        minKnee: 85.12345, minHip: 70.5, errors: i % 10 === 3 ? ['lean'] : [], peaks: i % 10 === 3 ? { lean: 55 } : {}, similarity: 95, stalls: 0 });
}
globalThis.gc && gc();
console.log('每一下約', ((process.memoryUsage().heapUsed - before) / 1000).toFixed(0), 'bytes', keep.length);
