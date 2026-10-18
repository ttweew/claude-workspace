import sys
sys.path.insert(0, '../stab')
from common import *
serve(SP + "/ghost2/site_before", 8861); serve("/home/user/claude-workspace", 8862)
SCN = sys.argv[1]
CAM = {
"panout": """navigator.mediaDevices.getUserMedia = async () => {
  const im = new Image(); im.src = '/__test/portrait.jpg'; await im.decode();
  const c = document.createElement('canvas'); c.width = 480; c.height = 640; const g = c.getContext('2d');
  const t0 = performance.now(); const W = 820, H = 1024, sw = H * 0.75;
  const draw = () => { const i = (performance.now() - t0) / 33.33; const t = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / 240);
    g.fillStyle = '#777'; g.fillRect(0, 0, 480, 640); g.drawImage(im, (W - sw) / 2 + (W * 0.75 - (W - sw) / 2) * t, 0, sw, H, 0, 0, 480, 640); };
  draw(); setInterval(draw, 33); return c.captureStream(30); };""",
"close": """navigator.mediaDevices.getUserMedia = async () => {
  const im = new Image(); im.src = '/__test/pose.jpg'; await im.decode();
  const c = document.createElement('canvas'); c.width = 480; c.height = 640; const g = c.getContext('2d');
  const n = document.createElement('canvas'); n.width = 480; n.height = 640; const ng = n.getContext('2d'); const d = ng.createImageData(480, 640);
  for (let i = 0; i < d.data.length; i += 4) { const v = Math.random() * 255; d.data[i] = d.data[i+1] = d.data[i+2] = v; d.data[i+3] = 255; } ng.putImageData(d, 0, 0);
  const t0 = performance.now();
  const draw = () => { const i = (performance.now() - t0) / 33.33; const t = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / 240); const sh = 160 + 200 * t, sw = sh * 0.75;
    g.fillStyle = '#777'; g.fillRect(0, 0, 480, 640); g.drawImage(im, 490 - sw / 2 + (Math.random() - .5) * 6, 210 + (Math.random() - .5) * 6, sw, sh, 0, 0, 480, 640);
    g.globalAlpha = 0.06; g.globalCompositeOperation = 'overlay'; g.drawImage(n, (Math.random() * 40) | 0, (Math.random() * 40) | 0); g.globalAlpha = 1; g.globalCompositeOperation = 'source-over'; };
  draw(); setInterval(draw, 33); return c.captureStream(30); };"""}
with sync_playwright() as p:
    b = launch(p)
    for tag, port in [("before", 8861), ("after", 8862)]:
        pg = b.new_page(viewport={"width":360,"height":640}, device_scale_factor=1)
        pg.route(CDN+"/**", cdn)
        pg.route("https://storage.googleapis.com/**", lambda r: r.fulfill(path=MP+"/pose_landmarker_lite.task", headers={"Access-Control-Allow-Origin":"*"}))
        pg.route("**/__test/pose.jpg", lambda r: r.fulfill(path=MP+"/pose.jpg", content_type="image/jpeg")); pg.route("**/__test/portrait.jpg", lambda r: r.fulfill(path=SP+"/ghost2/portrait.jpg", content_type="image/jpeg"))
        pg.add_init_script(CAM[SCN])
        pg.goto(f"http://127.0.0.1:{port}/index.html")
        pg.wait_for_function("document.getElementById('modelStatus').textContent.match(/已就緒/)", timeout=60000)
        pg.click("#startBtn"); pg.wait_for_timeout(500)
        for k in range(16):
            pg.wait_for_timeout(500); pg.screenshot(path=f"vis_{SCN}_{tag}_{k}.png")
        pg.close()
    b.close()
