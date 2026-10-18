# 錄製中手機轉向：畫面 640x480 → 480x640
import sys
sys.path.insert(0, '..')
from audit_common import *
from playwright.sync_api import sync_playwright
base = serve(8900, sys.argv[1] if len(sys.argv) > 1 else '/home/user/claude-workspace')
CAM = """
navigator.mediaDevices.getUserMedia = async () => {
  const im = new Image(); im.src = '/__test/pose.jpg'; await im.decode();
  const c = document.createElement('canvas'); c.width = 640; c.height = 480;
  const g = c.getContext('2d');
  window.__rotate = () => { c.width = 480; c.height = 640; };
  const draw = () => { g.fillStyle = '#5a88b8'; g.fillRect(0, 0, c.width, c.height); const s = Math.min(c.width / im.width, c.height / im.height);
    g.drawImage(im, (c.width - im.width * s) / 2, (c.height - im.height * s) / 2, im.width * s, im.height * s); };
  draw(); setInterval(draw, 33);
  return c.captureStream(30);
};"""
with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/opt/pw-browsers/chromium", args=["--use-fake-ui-for-media-stream"])
    for q in ('', '?worker=0'):
        pg = b.new_page(viewport={"width": 390, "height": 844}); errs = []
        pg.on("pageerror", lambda e: errs.append(str(e)[:100]))
        mock_network(pg); pg.add_init_script(NO_COUNTDOWN); pg.add_init_script(CAM)
        pg.route("**/__test/pose.jpg", lambda r: r.fulfill(path=MP + "/pose.jpg", content_type="image/jpeg"))
        pg.goto(base + "index.html" + q); pg.wait_for_function(READY, timeout=90000)
        pg.click('#startBtn'); pg.wait_for_timeout(3000)
        pg.click('#dataBtn'); pg.click('#recordBtn'); pg.wait_for_timeout(3000)
        pg.evaluate("window.__rotate()"); pg.wait_for_timeout(3000)
        size = pg.evaluate("document.getElementById('video').videoWidth + 'x' + document.getElementById('video').videoHeight")
        print(q or '(背景)', '畫面', size, '| 錄製', pg.inner_text('#recordInfo'), '| 錄製鈕', pg.inner_text('#recordBtn'), '| CSV 鈕', pg.is_visible('#csvBtn'), '| 偵測', pg.inner_text('#poseStatus'), '| errors', errs)
        pg.close()
    b.close()
