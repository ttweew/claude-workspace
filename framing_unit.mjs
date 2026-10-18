import { framingAdvice } from '/home/user/claude-workspace/js/analysis/framing.js';
import { P } from '/home/user/claude-workspace/js/skeleton/landmarks.js';
// 側面站立：左側（靠鏡頭）全部看得到，右側被身體擋住（visibility 低）
const lm = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, z: 0, visibility: 0.3 }));
const set = (k, x, y) => { lm[P[k]] = { x, y, z: 0, visibility: 0.95 }; };
set('NOSE', 0.5, 0.15); set('LEFT_SHOULDER', 0.5, 0.25); set('LEFT_HIP', 0.5, 0.5); set('LEFT_KNEE', 0.5, 0.7); set('LEFT_ANKLE', 0.5, 0.9);
console.log('側面（只看得到左側）：', framingAdvice(lm).text);
lm[P.LEFT_ANKLE].visibility = 0.2;
console.log('側面但腳踝看不到：', framingAdvice(lm).text);
