# 模擬手機直拿、離鏡頭很近：全身／頭到胸／只有頭，比較改前改後畫出來的點
from playwright.sync_api import sync_playwright
from audit_common import *
import sys
CROPS = {"full": (0,0,1000,667), "chest": (380,200,260,347), "head": (430,225,120,160)}
def cam(crop):
    sx,sy,sw,sh = crop
    return """navigator.mediaDevices.getUserMedia = async () => {
  const im = new Image(); im.src = '/__test/pose.jpg'; await im.decode();
  const c = document.createElement('canvas'); c.width = 480; c.height = 640; const g = c.getContext('2d');
  const s = Math.min(480/%d, 640/%d);
  const draw = () => { g.fillStyle = '#5a88b8'; g.fillRect(0,0,480,640); g.drawImage(im, %d,%d,%d,%d, (480-%d*s)/2, (640-%d*s)/2, %d*s, %d*s); };
  draw(); setInterval(draw, 33); return c.captureStream(30); };""" % (sw,sh,sx,sy,sw,sh,sw,sh,sw,sh)
with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/opt/pw-browsers/chromium", args=["--use-fake-ui-for-media-stream"])
    for tag, d, port in [("before", "before_pb", 8801), ("after", "/home/user/claude-workspace", 8802)]:
        u = serve(port, d)
        for name, crop in CROPS.items():
            pg = b.new_page(viewport={"width": 390, "height": 760}); mock_network(pg); pg.add_init_script(cam(crop))
            errs = []; pg.on("pageerror", lambda e: errs.append(str(e)))
            pg.goto(u + "?debug"); pg.wait_for_function(READY, timeout=60000); pg.click("#startBtn"); pg.wait_for_timeout(2500)
            pg.screenshot(path=f"ghost_{tag}_{name}.png")
            print(tag, name, pg.inner_text("#poseStatus"), errs); pg.close()
    b.close()
