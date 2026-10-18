import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'stab'))
from common import *
ROOT = sys.argv[1]; PORT = int(sys.argv[2]); OUT = sys.argv[3]
serve(ROOT, PORT)
SCENE = """
navigator.mediaDevices.getUserMedia = async () => {
  const im = new Image(); im.src = '/__test/pose.jpg'; await im.decode();
  const c = document.createElement('canvas'); c.width = im.width; c.height = im.height;
  const g = c.getContext('2d'); let k = 0;
  const draw = () => { g.drawImage(im, 0, 0); g.fillStyle = k++ % 2 ? '#000' : '#111'; g.fillRect(0, 0, 2, 2); };
  draw(); setInterval(draw, 33);
  return c.captureStream(30);
};"""
REAR = "const _gs = MediaStreamTrack.prototype.getSettings; MediaStreamTrack.prototype.getSettings = function () { return { ..._gs.call(this), facingMode: 'environment' }; };"
with sync_playwright() as p:
    b = launch(p)
    for tag, vw, vh, mobile, rear, query in [('land_front', 1280, 720, False, False, ''), ('land_rear', 1280, 720, False, True, ''),
                                     ('port_front', 390, 844, True, False, ''), ('port_lab', 390, 844, True, False, '?lab=squat'),
                                     ('land_lab', 1280, 720, False, False, '?lab=squat'), ('port_se', 320, 568, True, False, '?lab=squat')]:
        pg = b.new_page(viewport={"width": vw, "height": vh}, is_mobile=mobile, has_touch=mobile, device_scale_factor=2)
        errs = []; pg.on("pageerror", lambda e: errs.append(str(e)[:150]))
        pg.route(CDN + "/**", cdn)
        pg.route("https://storage.googleapis.com/**", lambda r: r.fulfill(path=MP + "/pose_landmarker_lite.task", headers={"Access-Control-Allow-Origin": "*"}))
        pg.route("**/__test/pose.jpg", lambda r: r.fulfill(path=MP + "/pose.jpg", content_type="image/jpeg"))
        pg.add_init_script(SCENE)
        if rear: pg.add_init_script(REAR)
        pg.goto(f"http://127.0.0.1:{PORT}/index.html{query}")
        pg.wait_for_function("document.getElementById('modelStatus').textContent.match(/已就緒|失敗/)", timeout=60000)
        pg.click('#startBtn')
        pg.wait_for_function("[...document.querySelectorAll('#hud .metric-value')].some(e => /\\d/.test(e.textContent))", timeout=30000)
        pg.wait_for_timeout(1500)
        info = pg.evaluate("""() => [...document.querySelectorAll('#hud .hud-side')].map(s => { const r = s.getBoundingClientRect();
            return { side: s.dataset.side, dim: s.classList.contains('dim'), x: Math.round(r.left), r: Math.round(r.right), y: Math.round(r.top), b: Math.round(r.bottom),
                     text: [...s.querySelectorAll('.metric')].filter(m => !m.hidden).map(m => m.innerText.replace(/\\n/g, ' ')).join(' | ') }; })""")
        mir = pg.evaluate("document.getElementById('video').classList.contains('mirrored')") if pg.query_selector('#video') else None
        print(tag, 'mirrored=', mir, 'vw=', vw, info, errs)
        pg.screenshot(path=f"{OUT}/{tag}.png")
        pg.close()
    b.close()
