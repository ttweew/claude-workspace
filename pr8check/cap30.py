# 每秒格數讓使用者選（30／60／90／120）：首頁選單、記住、鏡頭上限變灰、開著鏡頭切換、錄製中鎖住、網址指定
import sys, os, re, json
sys.path.insert(0, '..')
from audit_common import *
from playwright.sync_api import sync_playwright
ROOT = sys.argv[1]
base = serve(8818, ROOT)
OUT = os.path.dirname(os.path.abspath(__file__))
ok = True
def check(cond, msg):
    global ok
    print(('PASS ' if cond else 'FAIL ') + msg); ok = ok and cond
# 假鏡頭：照要求的每秒格數送畫面（最多 camMax），getCapabilities 回報上限（camMax 為 0 時不回報）
CAM = NO_COUNTDOWN + """
window.__constraints = [];
navigator.mediaDevices.getUserMedia = async (c) => {
  window.__constraints.push(JSON.stringify(c));
  const camMax = %d;
  const want = c && c.video && c.video.frameRate ? c.video.frameRate.ideal : 30;
  const fps = Math.min(want, camMax || 30);
  const im = new Image(); im.src = '/__test/pose.jpg'; await im.decode();
  const cv = document.createElement('canvas'); cv.width = 640; cv.height = 480;
  const g = cv.getContext('2d'); const s = Math.min(cv.width / im.width, cv.height / im.height);
  const dw = im.width * s, dh = im.height * s; let k = 0;
  const draw = () => { g.fillStyle = '#5a88b8'; g.fillRect(0, 0, cv.width, cv.height); g.drawImage(im, (cv.width - dw) / 2, (cv.height - dh) / 2, dw, dh); g.fillStyle = k++ %% 2 ? '#000' : '#111'; g.fillRect(0, 0, 2, 2); };
  draw(); setInterval(draw, 1000 / fps);
  const stream = cv.captureStream(fps);
  const tr = stream.getVideoTracks()[0]; const gs = tr.getSettings.bind(tr);
  tr.getSettings = () => ({ ...gs(), frameRate: fps });
  tr.getCapabilities = () => camMax ? { frameRate: { min: 1, max: camMax } } : {};
  return stream;
};"""
opts = lambda pg, sel: [o for o in pg.evaluate(f"[...document.querySelectorAll('{sel} option')].map(o => (o.disabled ? 'x ' : '') + o.textContent)") if not o.startswith('自動')]
# 首頁的每秒格數、AI 模型收進「進階設定」（PR #79）：測試一開始就打開
CAM += "\ndocument.addEventListener('DOMContentLoaded', () => { const d = document.getElementById('advanced'); if (d) d.open = true; });"
with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/opt/pw-browsers/chromium")
    for vw, vh in [(1280, 800), (320, 640), (390, 844)]:
        ctx = b.new_context(viewport={"width": vw, "height": vh}); pg = ctx.new_page(); errs = []
        pg.on("pageerror", lambda e: errs.append(str(e)))
        mock_network(pg); pg.add_init_script(CAM % 30)
        pg.goto(base + "index.html"); pg.wait_for_function(READY, timeout=60000)
        check(pg.is_hidden("#fpsHint"), f'{vw} 開鏡頭前沒有說明')
        pg.click("#startBtn"); pg.wait_for_timeout(3000); pg.click("#perfBtn"); pg.wait_for_timeout(1200)
        badge = pg.inner_text("#perfBtn")
        check(re.search(r'鏡頭 640×480，每秒 (29|30|31) 格（最多 30）', badge) is not None, f'{vw} 點開標籤寫出鏡頭解析度和上限：' + badge)
        pg.click("#perfBtn")
        check(opts(pg, '#fpsSelect')[1:] == ['x 每秒 60 格（鏡頭最多 30）', 'x 每秒 90 格（鏡頭最多 30）', 'x 每秒 120 格（鏡頭最多 30）'], f'{vw} 60 以上變灰')
        pg.click("#stopBtn") if pg.locator("#stopBtn").count() else None
        pg.wait_for_timeout(500)
        hint = pg.inner_text("#fpsHint") if pg.is_visible("#fpsHint") else ''
        check(hint.startswith('這顆鏡頭最多每秒 30 格'), f'{vw} 關鏡頭後首頁說明原因：' + hint)
        r = pg.evaluate("() => [document.getElementById('fpsHint').getBoundingClientRect().right, document.documentElement.scrollWidth]")
        check(r[0] <= vw and r[1] == vw, f'{vw} 說明在畫面內 {r}')
        pg.locator(".start-card").screenshot(path=f"start_{vw}.png")
        # 先前選了 120（鏡頭最多 30）：實驗提醒＋原因都寫
        pg.evaluate("localStorage.setItem('cameraFps','120')"); pg.reload(); pg.wait_for_function(READY, timeout=60000)
        pg.click("#startBtn"); pg.wait_for_timeout(3000); pg.click("#perfBtn"); pg.wait_for_timeout(1200)
        badge = pg.inner_text("#perfBtn")
        check(re.search(r'鏡頭 (29|30|31) · AI', badge) is not None and '鏡頭 640×480，最多 30 格' in badge, f'{vw} 選 120 點開標籤：' + badge)
        r = pg.evaluate("() => [document.getElementById('perfBtn').getBoundingClientRect().right, document.documentElement.scrollWidth]")
        check(r[0] <= vw and r[1] == vw, f'{vw} 標籤在畫面內 {r}')
        pg.screenshot(path=f"live_{vw}.png"); pg.click("#perfBtn"); pg.click("#stopBtn") if pg.locator("#stopBtn").count() else None; pg.wait_for_timeout(500)
        hint = pg.inner_text("#fpsHint")
        check(hint.startswith('實驗中') and '這顆鏡頭最多每秒 30 格' in hint, f'{vw} 選 120 時兩段都寫')
        check(not errs, f'{vw} 沒有錯誤 ' + str(errs[:3]))
        ctx.close()
print('ALL PASS' if ok else 'SOME FAIL')
