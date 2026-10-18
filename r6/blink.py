# AI 偶爾漏掉一兩格：畫面會不會閃（橫幅跳出、骨架消失）？人真的離開時，提示還是要出現
import sys
sys.path.insert(0, '..')
from audit_common import *
from playwright.sync_api import sync_playwright
base = serve(8901, sys.argv[1] if len(sys.argv) > 1 else '/home/user/claude-workspace')
CAM = """
navigator.mediaDevices.getUserMedia = async () => {
  const im = new Image(); im.src = '/__test/pose.jpg'; await im.decode();
  const c = document.createElement('canvas'); c.width = 640; c.height = 480;
  const g = c.getContext('2d'); let n = 0; window.__gone = false;
  const draw = () => { n++; g.fillStyle = '#5a88b8'; g.fillRect(0, 0, 640, 480);
    const blank = window.__gone || (window.__blink && n % 30 < 2);   // 每秒有 2 格是空的
    if (!blank) { const s = Math.min(640 / im.width, 480 / im.height); g.drawImage(im, (640 - im.width * s) / 2, (480 - im.height * s) / 2, im.width * s, im.height * s); } };
  draw(); setInterval(draw, 33);
  return c.captureStream(30);
};
window.__mon = { banner: 0, blankCanvas: 0, samples: 0, lastBanner: false };
setInterval(() => {
  const b = document.getElementById('banner'), o = document.getElementById('overlay');
  if (!b || !o || document.getElementById('stage').hidden || !window.__blink) return;
  const on = !b.hidden && b.textContent.includes('未偵測到人體');
  if (on && !window.__mon.lastBanner) window.__mon.banner++;
  window.__mon.lastBanner = on;
  // 畫布上有沒有東西：取中間一條看有沒有不透明的像素
  const d = o.getContext('2d').getImageData(0, 0, o.width, o.height).data; let any = false;
  for (let i = 3; i < d.length; i += 4 * 97) if (d[i]) { any = true; break; }
  window.__mon.samples++; if (!any) window.__mon.blankCanvas++;
}, 16);
"""
with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/opt/pw-browsers/chromium", args=["--use-fake-ui-for-media-stream"])
    for q in ('', '?worker=0'):
        pg = b.new_page(viewport={"width": 390, "height": 844}); errs = []
        pg.on("pageerror", lambda e: errs.append(str(e)[:100]))
        mock_network(pg); pg.add_init_script(CAM)
        pg.route("**/__test/pose.jpg", lambda r: r.fulfill(path=MP + "/pose.jpg", content_type="image/jpeg"))
        pg.goto(base + "index.html" + q); pg.wait_for_function(READY, timeout=90000)
        pg.click('#startBtn'); pg.wait_for_timeout(3000)
        pg.evaluate("window.__blink = true"); pg.wait_for_timeout(10000)
        m = pg.evaluate("window.__mon")
        # 人真的離開 → 提示要出現；回來 → 恢復
        pg.evaluate("window.__blink = false; window.__gone = true"); pg.wait_for_timeout(2000)
        gone = pg.inner_text('#banner') if pg.is_visible('#banner') else pg.inner_text('#poseStatus')
        blank_after = pg.evaluate("(() => { const o = document.getElementById('overlay'); const d = o.getContext('2d').getImageData(0,0,o.width,o.height).data; for (let i = 3; i < d.length; i += 4*97) if (d[i]) return false; return true; })()")
        pg.evaluate("window.__gone = false"); pg.wait_for_timeout(2500)
        print(q or '(背景)', f"10 秒內：橫幅跳出 {m['banner']} 次、骨架消失 {100*m['blankCanvas']/max(1,m['samples']):.0f}% 的時間 | 人離開 2 秒後：{gone}，骨架清掉 {blank_after} | 回來：{pg.inner_text('#poseStatus')} | errors {errs}")
        pg.close()
    b.close()
