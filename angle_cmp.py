# 同一張照片：比較用 2D 畫面座標與 3D 公尺座標算出的角度
from playwright.sync_api import sync_playwright
from audit_common import *
url = serve(8827)
HTML = """<!doctype html><meta charset=utf-8><script type=module>
import { loadPoseModel } from '/js/ai/pose.js';
import { angleAt, ANGLES } from '/js/analysis/angles.js';
import { P } from '/js/skeleton/landmarks.js';
const pose = await loadPoseModel(() => {});
const im = new Image(); im.src = '/__test/pose.jpg'; await im.decode();
const c = document.createElement('canvas'); c.width = 1000; c.height = 667; c.getContext('2d').drawImage(im, 0, 0);
let r, t = performance.now() + 1000; for (let i = 0; i < 10; i++) r = pose.landmarker.detectForVideo(c, t += 33);
const lm = r.landmarks[0], w = r.worldLandmarks[0];
const px = p => ({ x: p.x * 1000, y: p.y * 667, z: 0 });
window.OUT = ANGLES.map(([k, n, pts]) => { const ids = pts.map(q => P[q]);
  return [n, Math.round(angleAt(...ids.map(i => px(lm[i])))), Math.round(angleAt(...ids.map(i => w[i])))]; });
</script>"""
with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/opt/pw-browsers/chromium")
    pg = b.new_page(); mock_network(pg)
    pg.route("**/__test/a.html", lambda r: r.fulfill(body=HTML, content_type="text/html; charset=utf-8"))
    pg.goto(url + "__test/a.html"); pg.wait_for_function("window.OUT", timeout=60000)
    print("關節   2D畫面  3D公尺")
    for n, a2, a3 in pg.evaluate("window.OUT"): print(f"{n}   {a2:4d}°   {a3:4d}°")
    b.close()
