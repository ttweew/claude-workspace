import sys, os, json
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'stab'))
from common import *
ROOT = sys.argv[1]; PORT = int(sys.argv[2])
serve(ROOT, PORT)
SCENE = """
window.__scene = 'person';
navigator.mediaDevices.getUserMedia = async () => {
  const im = new Image(); im.src = '/__test/pose.jpg'; await im.decode();
  const c = document.createElement('canvas'); c.width = im.width; c.height = im.height;
  const g = c.getContext('2d'); let k = 0;
  const draw = () => { if (window.__scene === 'person') g.drawImage(im, 0, 0); else { g.fillStyle = '#334'; g.fillRect(0, 0, c.width, c.height); } g.fillStyle = k++ % 2 ? '#000' : '#111'; g.fillRect(0, 0, 2, 2); };
  draw(); setInterval(draw, 33);
  return c.captureStream(30);
};
window.__tones = [];
const _AC = window.AudioContext;
window.AudioContext = class extends _AC {
  createOscillator() { const o = super.createOscillator(); const s = o.start.bind(o); o.start = t => { window.__tones.push({ f: o.frequency.value, at: Math.round(performance.now()), g: window.__lastGain }); return s(t); }; return o; }
  createGain() { const g = super.createGain(); const r = g.gain.exponentialRampToValueAtTime.bind(g.gain); g.gain.exponentialRampToValueAtTime = (v, t) => { if (v > 0.001) window.__lastGain = v; return r(v, t); }; return g; }
};"""
def tones(pg, since=0): return pg.evaluate(f"window.__tones.filter(t => t.at >= {since}).map(t => t.f + '@' + t.g)")
def now(pg): return pg.evaluate("Math.round(performance.now())")
with sync_playwright() as p:
    b = launch(p)
    pg = b.new_page(viewport={"width": 1280, "height": 720})
    errs = []; pg.on("pageerror", lambda e: errs.append(str(e)[:150]))
    pg.route(CDN + "/**", cdn)
    pg.route("https://storage.googleapis.com/**", lambda r: r.fulfill(path=MP + "/pose_landmarker_lite.task", headers={"Access-Control-Allow-Origin": "*"}))
    pg.route("**/__test/pose.jpg", lambda r: r.fulfill(path=MP + "/pose.jpg", content_type="image/jpeg"))
    pg.add_init_script(SCENE)
    pg.goto(f"http://127.0.0.1:{PORT}/index.html")
    pg.wait_for_function("document.getElementById('modelStatus').textContent.match(/已就緒|失敗/)", timeout=60000)
    print('button at start:', pg.inner_text('#soundBtn'), pg.get_attribute('#soundBtn', 'aria-label'))
    pg.click('#startBtn')
    pg.wait_for_function("document.getElementById('poseStatus').textContent === '已偵測到全身'", timeout=30000)
    pg.wait_for_timeout(2000)
    print('1 站好了:', tones(pg))
    t0 = now(pg); pg.evaluate("window.__scene = 'empty'"); pg.wait_for_timeout(3500)
    print('2 離開 3.5 秒:', tones(pg, t0))
    pg.wait_for_timeout(5500)
    print('3 離開 9 秒:', tones(pg, t0))
    t1 = now(pg); pg.evaluate("window.__scene = 'person'"); pg.wait_for_timeout(3000)
    print('4 回來:', tones(pg, t1), '| 狀態', pg.inner_text('#poseStatus'))
    t2 = now(pg)
    for i in range(4):
        pg.click('#soundBtn'); pg.wait_for_timeout(400)
        print(f'5.{i} 按音量 →', pg.inner_text('#soundBtn').replace('\n', ' '), '| aria', pg.get_attribute('#soundBtn', 'aria-label'), '| muted', pg.evaluate("document.getElementById('soundBtn').classList.contains('muted')"), '| 試聽', tones(pg, t2)); t2 = now(pg)
    # 現在是「中」→ 再按到「關」
    pg.click('#soundBtn'); pg.click('#soundBtn'); pg.click('#soundBtn'); pg.wait_for_timeout(300)
    print('6 設成:', pg.inner_text('#soundBtn'), 'localStorage', pg.evaluate("localStorage.getItem('soundLevel')"))
    t3 = now(pg); pg.evaluate("window.__scene = 'empty'"); pg.wait_for_timeout(3000); pg.evaluate("window.__scene = 'person'"); pg.wait_for_timeout(3000)
    print('7 關掉時離開又回來:', tones(pg, t3))
    pg.reload(); pg.wait_for_function("document.getElementById('modelStatus').textContent.match(/已就緒|失敗/)", timeout=60000)
    print('8 重新整理後按鈕:', pg.inner_text('#soundBtn'))
    print('errors', errs)
    b.close()
