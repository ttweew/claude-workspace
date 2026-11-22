// 首頁開著鏡頭時，鏡頭畫面上幾個位置點下去會點到什麼
import { launch, serve, open, script, rep } from '/tmp/claude-0/-home-user-claude-workspace/06177a5d-45ba-5b18-b395-0fd8d80e2079/scratchpad/wt_all/tests/browser/harness.mjs';
const stand = (id, frames) => ({ id, depth: 0, frames });
const SQUAT = script([stand('squat', 200)]);
const site = await serve('/tmp/claude-0/-home-user-claude-workspace/06177a5d-45ba-5b18-b395-0fd8d80e2079/scratchpad/wt_all');
const browser = await launch();
const { context, page } = await open(browser, SQUAT, { yoloOthers: [{ dx: 0.35, scale: 0.7, score: 0.95 }] });
await page.goto(site.base + 'index.html?model=yolo-n&workout=squat');
await page.waitForFunction(() => /已就緒/.test(document.getElementById('poseStatus').textContent), null, { timeout: 60000 });
await page.click('#startBtn');
await page.waitForTimeout(2500);
for (const [x, y] of [[0.05, 0.05], [0.15, 0.3], [0.1, 0.5], [0.2, 0.85], [0.83, 0.6], [0.5, 0.45]]) {
  const r = await page.evaluate(([x, y]) => {
    const stage = document.getElementById('stage'), video = document.querySelector('video');
    const b = stage.getBoundingClientRect();
    const scale = Math.min(stage.clientWidth / video.videoWidth, stage.clientHeight / video.videoHeight);
    const w = video.videoWidth * scale, h = video.videoHeight * scale;
    const left = (stage.clientWidth - w) / 2, top = (stage.clientHeight - h) / 2;
    const u = video.classList.contains('mirrored') ? 1 - x : x;
    const px = b.left + left + u * w, py = b.top + top + y * h;
    const el = document.elementFromPoint(px, py);
    const path = []; for (let e = el; e && path.length < 4; e = e.parentElement) path.push(e.tagName.toLowerCase() + (e.id ? '#' + e.id : '') + (e.className && typeof e.className === 'string' ? '.' + e.className.split(' ')[0] : ''));
    return { px: Math.round(px), py: Math.round(py), path: path.join(' < '), mirrored: video.classList.contains('mirrored') };
  }, [x, y]);
  console.log(x, y, JSON.stringify(r));
}
await context.close(); await browser.close(); await site.close();
