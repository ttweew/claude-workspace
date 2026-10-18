# 用三種畫面（全身／頭到胸／只有頭）測 MediaPipe 對「畫面外的點」回報的 visibility 與 presence
from playwright.sync_api import sync_playwright
from audit_common import *
import json
url = serve(8798)
HTML = """<!doctype html><script type=module>
import { loadPoseModel } from '/js/ai/pose.js';
const pose = await loadPoseModel(() => {});
const im = new Image(); im.src = '/__test/pose.jpg'; await im.decode();
const crops = { full: [0,0,1000,667, 640,480], chest: [380,200,260,347, 480,640], head: [430,225,120,160, 480,640] };
const out = {};
let t = performance.now() + 1000;
for (const [name, [sx,sy,sw,sh,w,h]] of Object.entries(crops)) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d'); g.fillStyle = '#5a88b8'; g.fillRect(0,0,w,h);
  const s = Math.min(w/sw, h/sh); g.drawImage(im, sx,sy,sw,sh, (w-sw*s)/2,(h-sh*s)/2, sw*s, sh*s);
  let r; for (let i = 0; i < 15; i++) r = pose.landmarker.detectForVideo(c, t += 33);
  out[name] = r.landmarks.length ? r.landmarks[0].map(p => [+(p.visibility ?? -1).toFixed(2), +(p.presence ?? -1).toFixed(2), +p.x.toFixed(2), +p.y.toFixed(2)]) : null;
}
window.OUT = out;
</script>"""
with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/opt/pw-browsers/chromium")
    pg = b.new_page(); mock_network(pg)
    pg.route("**/__test/probe.html", lambda r: r.fulfill(body=HTML, content_type="text/html"))
    pg.on("pageerror", lambda e: print("ERR", e))
    pg.goto(url + "__test/probe.html"); pg.wait_for_function("window.OUT", timeout=60000)
    out = pg.evaluate("window.OUT")
    names = {0:"鼻",11:"左肩",12:"右肩",13:"左肘",14:"右肘",15:"左腕",16:"右腕",19:"左食指",23:"左髖",24:"右髖",25:"左膝",26:"右膝",27:"左踝",28:"右踝"}
    for k, v in out.items():
        print("==", k)
        if not v: print("  沒偵測到人"); continue
        print("  " + "  ".join(f"{names[i]}:v{v[i][0]} ({v[i][2]},{v[i][3]})" for i in names))
    b.close()
