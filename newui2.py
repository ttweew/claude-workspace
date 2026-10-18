from playwright.sync_api import sync_playwright
from audit_common import *
import sys
url = serve(int(sys.argv[1]), sys.argv[2]); PREFIX = sys.argv[3]
FAR = """navigator.mediaDevices.getUserMedia = async () => {
  const im = new Image(); im.src = '/__test/pose.jpg'; await im.decode();
  const c = document.createElement('canvas'); c.width = 640; c.height = 480; const g = c.getContext('2d');
  const draw = () => { g.fillStyle = '#5a88b8'; g.fillRect(0,0,640,480); g.drawImage(im, 380, 200, 260, 347, 0, 0, 640, 854); };
  draw(); setInterval(draw, 33); return c.captureStream(30); };"""
with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/opt/pw-browsers/chromium", args=["--use-fake-ui-for-media-stream"])
    for name, vw, vh, script in [("laptop", 1366, 768, cam_script(640,480)), ("laptop_warn", 1366, 768, FAR), ("phone_warn", 390, 844, FAR), ("phone_land", 844, 390, cam_script(640,480))]:
        pg = b.new_page(viewport={"width": vw, "height": vh}, device_scale_factor=2); mock_network(pg); pg.add_init_script(script)
        errs=[]; pg.on("pageerror", lambda e: errs.append(str(e)))
        pg.goto(url); pg.wait_for_function(READY, timeout=60000); pg.wait_for_timeout(1600)
        if name == "laptop": pg.screenshot(path=f"{PREFIX}_home_laptop.png")
        pg.click("#startBtn"); pg.wait_for_timeout(2500); pg.screenshot(path=f"{PREFIX}_cam_{name}.png")
        if PREFIX == "new": print(name, "| 橫幅:", pg.is_visible("#banner") and pg.inner_text("#banner"), "| 小標籤顯示", pg.is_visible("#poseStatus"), "| HUD", pg.inner_text("#hud").replace("\n"," "), "| 進度條隱藏", pg.evaluate("document.getElementById('modelProgress').hidden"), errs)
        pg.close()
    b.close()
