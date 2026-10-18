# 入鏡提示測試：不同的站位（太近、看不到腳、全身、太遠、偏一邊、沒有人），檢查提示文字與顏色
from playwright.sync_api import sync_playwright
from audit_common import *
import sys
SITE = sys.argv[1] if len(sys.argv) > 1 else "/home/user/claude-workspace"
# 畫面寬高、原圖裁切範圍 (sx, sy, sw, sh)、貼到畫面上的位置 (dx, dy, dw, dh)
S = {
  "只有頭（太近）":   (480, 640, (430, 225, 120, 160), (0, 0, 480, 640)),
  "頭到大腿":         (480, 640, (380, 200, 260, 347), (0, 0, 480, 640)),
  "全身":             (640, 480, (150, 200, 700, 467), (0, 0, 640, 427)),
  "很遠":             (640, 480, (0, 0, 1000, 667), (180, 150, 330, 220)),
  "偏右邊":           (640, 480, (240, 230, 520, 410), (380, 140, 250, 197)),
  "沒有人":           (640, 480, (0, 0, 300, 200), (0, 0, 640, 480)),
}
def cam(w, h, s, d):
    return """navigator.mediaDevices.getUserMedia = async () => {
  const im = new Image(); im.src = '/__test/pose.jpg'; await im.decode();
  const c = document.createElement('canvas'); c.width = %d; c.height = %d; const g = c.getContext('2d');
  const draw = () => { g.fillStyle = '#5a88b8'; g.fillRect(0, 0, c.width, c.height); g.drawImage(im, %d, %d, %d, %d, %d, %d, %d, %d); };
  draw(); setInterval(draw, 33); return c.captureStream(30); };""" % ((w, h) + s + d)
url = serve(8809, SITE)
with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/opt/pw-browsers/chromium", args=["--use-fake-ui-for-media-stream"])
    for name, (w, h, s, d) in S.items():
        pg = b.new_page(viewport={"width": int(__import__("os").environ.get("VW", 390)), "height": 760}); mock_network(pg); pg.add_init_script(cam(w, h, s, d))
        errs = []; pg.on("pageerror", lambda e: errs.append(str(e)))
        pg.goto(url); pg.wait_for_function(READY, timeout=60000); pg.click("#startBtn"); pg.wait_for_timeout(3000)
        seen = set()
        for i in range(10):
            seen.add(pg.evaluate("poseStatus.textContent + ' [' + (poseStatus.dataset.kind || '') + ']'")); pg.wait_for_timeout(200)
        pg.screenshot(path=f"frame_{name}.png")
        print(f"{name:10s} → {' / '.join(sorted(seen))} {errs if errs else ''}"); pg.close()
    b.close()
