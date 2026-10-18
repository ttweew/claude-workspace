import { PoseSmoother } from './smooth.js';
const pt = x => Array.from({ length: 33 }, () => ({ x, y: 0.5, z: 0, visibility: 0.9 }));
const sm = new PoseSmoother();
let t = 0;
const log = (label, out) => console.log(label.padEnd(22), 'x =', out[0].x);
log('第 1 格 正常 0.5', sm.smooth(pt(0.5), t += 33));
log('第 2 格 正常 0.5', sm.smooth(pt(0.5), t += 33));
log('第 3 格 毒蘋果 NaN', sm.smooth(pt(NaN), t += 33));
for (let i = 4; i <= 63; i++) { const o = sm.smooth(pt(0.5), t += 33); if (i === 4 || i === 33 || i === 63) log(`第 ${i} 格 正常 0.5（${((i - 3) * 33)} ms 後）`, o); }
