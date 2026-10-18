import { angleAt } from './angles.js';
// 1) 極小長度：方向相同、只是縮小，夾角會不會爆掉？
for (const s of [100, 1, 1e-4, 1e-8]) {
  const a = angleAt({x: 0, y: -s, z: 0}, {x: 0, y: 0, z: 0}, {x: s * 0.5, y: s, z: 0});
  console.log(`長度約 ${s} → ${a.toFixed(4)}°`);
}
// 2) 真正的問題：線段很短時，1～2 像素的雜訊讓角度亂跳
const rnd = () => (Math.random() - 0.5) * 3;   // ±1.5 像素雜訊
for (const shin of [200, 40, 10, 3]) {
  const vals = [];
  for (let i = 0; i < 1000; i++) {
    const hip = {x: 320 + rnd(), y: 100 + rnd(), z: 0}, knee = {x: 320 + rnd(), y: 300 + rnd(), z: 0};
    const ankle = {x: 320 + rnd(), y: 300 + shin + rnd(), z: 0};   // 真實角度 180°
    vals.push(angleAt(hip, knee, ankle));
  }
  vals.sort((a, b) => a - b);
  console.log(`小腿在畫面上長 ${shin} 像素：角度落在 ${vals[50].toFixed(0)}°～${vals[949].toFixed(0)}°（90% 範圍）`);
}
