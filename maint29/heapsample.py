# 找記憶體一直多出來的地方：開鏡頭 1 分鐘後開始取樣（Chrome 的 sampling heap profiler），N 分鐘後看「還活著的」配置是在哪個函式產生的
# 用法：python3 heapsample.py <網站資料夾> <port> [分鐘]
import sys, os, json, time
sys.path.insert(0, '..')
from audit_common import *
from playwright.sync_api import sync_playwright
ROOT, PORT = sys.argv[1], int(sys.argv[2])
MIN = float(sys.argv[3]) if len(sys.argv) > 3 else 6
HERE = os.path.dirname(os.path.abspath(__file__))
base = serve(PORT, ROOT)
def fake_cdn(route):
    rel = route.request.url[len(CDN):].split("?")[0]
    hdr = {"Access-Control-Allow-Origin": "*"}
    if rel == '/vision_bundle.mjs': route.fulfill(path=HERE + '/fake_loop.mjs', content_type="text/javascript", headers=hdr)
    elif rel == '/vision_bundle_real.mjs': route.fulfill(path=PKG + '/vision_bundle.mjs', content_type="text/javascript", headers=hdr)
    elif rel == '/vision_bundle.js': route.fulfill(path=HERE + '/fake_loop.js', content_type="text/javascript", headers=hdr)
    elif rel == '/vision_bundle_real.js': route.fulfill(path=PKG + '/vision_bundle.js', content_type="text/javascript", headers=hdr)
    else: route.fulfill(path=PKG + rel, content_type="application/wasm" if rel.endswith(".wasm") else "text/javascript", headers=hdr)
INIT = """(() => { const synth = { speaking: false, pending: false, getVoices: () => [{ lang: 'zh-TW', name: 'fake-zh' }], addEventListener() {},
    speak(u) { setTimeout(() => { if (u.onend) u.onend({}); }, 200); }, cancel() {} };
  Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: synth });
  window.SpeechSynthesisUtterance = function (text) { this.text = text; this.volume = 1; this.lang = ''; this.voice = null; this.rate = 1; };
  try { localStorage.setItem('voiceMode', 'full'); } catch (e) {} })();"""
with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/opt/pw-browsers/chromium")
    ctx = b.new_context(viewport={"width": 1280, "height": 800})
    pg = ctx.new_page()
    pg.route(CDN + "/**", fake_cdn)
    pg.route(MODEL, lambda r: r.fulfill(path=MP + "/pose_landmarker_lite.task", headers={"Access-Control-Allow-Origin": "*"}))
    pg.route("**/__test/pose.jpg", lambda r: r.fulfill(path=MP + "/pose.jpg", content_type="image/jpeg"))
    pg.add_init_script(cam_script(640, 480)); pg.add_init_script(INIT)
    pg.goto(base + "index.html?workout=squat"); pg.wait_for_function(READY, timeout=60000)
    cdp = ctx.new_cdp_session(pg)
    pg.click('#startBtn'); pg.wait_for_timeout(60000)
    cdp.send("HeapProfiler.enable")
    cdp.send("HeapProfiler.collectGarbage")
    cdp.send("HeapProfiler.startSampling", {"samplingInterval": 4096})
    # 每個函式（含呼叫它的那一層）還活著的配置加總；取兩次（一半、全部），看哪些一直變多
    def snap():
        cdp.send("HeapProfiler.collectGarbage")
        prof = cdp.send("HeapProfiler.getSamplingProfile")['profile']
        tot = {}
        def walk(n, parent):
            cf = n['callFrame']
            name = (cf['functionName'] or '(anon)') + ' ' + cf['url'].split('/')[-1].split('?')[0] + ':' + str(cf['lineNumber'] + 1)
            key = name + '  ←  ' + parent
            tot[key] = tot.get(key, 0) + n['selfSize']
            for c in n.get('children', []): walk(c, name)
        walk(prof['head'], '')
        return tot, int(pg.text_content('#hudReps'))
    pg.wait_for_timeout(int(MIN * 30000))
    a, ra = snap()
    pg.wait_for_timeout(int(MIN * 30000))
    z, rz = snap()
    cdp.send("HeapProfiler.stopSampling")
    print(f'前半（{MIN / 2} 分鐘、{ra} 下）還活著 {sum(a.values()) / 1024:.0f} KB；全部（{MIN} 分鐘、{rz} 下）{sum(z.values()) / 1024:.0f} KB')
    print('最多的：')
    for k, v in sorted(z.items(), key=lambda x: -x[1])[:12]: print(f'{v / 1024:8.1f} KB（前半 {a.get(k, 0) / 1024:6.1f}）  {k}')
    print('後半變多的：')
    grow = sorted(((z.get(k, 0) - a.get(k, 0), k) for k in set(a) | set(z)), reverse=True)
    for d, k in grow[:12]: print(f'{d / 1024:+8.1f} KB  {k}')
    b.close()
