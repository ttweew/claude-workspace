# 10/24 主線：腳跟離地改成和站直時比（鏡頭畫面端到端，假的 AI 播放深蹲 4 下：前 2 下腳跟貼地，後 2 下腳跟往上移小腿長的 25%）
#  - 前 2 下沒有錯誤；後 2 下每一下的提示寫腳跟離地；紅字說出原因「腳跟比站直時高 xx%，超過 14% 算腳跟離地」
#  - 連續兩下才講：第 4 下講「腳跟踩穩」；關鏡頭的總結：腳跟離地 2 下；背景執行緒和主畫面兩種
# 用法：python3 check.py <網站資料夾>；先跑 node make_fake.mjs <網站資料夾>
import sys, os, re
sys.path.insert(0, '..')
from audit_common import *
from playwright.sync_api import sync_playwright
ROOT = sys.argv[1]
HERE = os.path.dirname(os.path.abspath(__file__))
base = serve(8841, ROOT)
fails = []
def check(ok, msg):
    print(('PASS ' if ok else 'FAIL ') + msg)
    if not ok: fails.append(msg)
def fake_cdn(route):
    rel = route.request.url[len(CDN):].split("?")[0]
    hdr = {"Access-Control-Allow-Origin": "*"}
    if rel == '/vision_bundle.mjs': route.fulfill(path=f"{HERE}/fake_heel.mjs", content_type="text/javascript", headers=hdr)
    elif rel == '/vision_bundle_real.mjs': route.fulfill(path=PKG + '/vision_bundle.mjs', content_type="text/javascript", headers=hdr)
    elif rel == '/vision_bundle.js': route.fulfill(path=f"{HERE}/fake_heel.js", content_type="text/javascript", headers=hdr)
    elif rel == '/vision_bundle_real.js': route.fulfill(path=PKG + '/vision_bundle.js', content_type="text/javascript", headers=hdr)
    else: route.fulfill(path=PKG + rel, content_type="application/wasm" if rel.endswith(".wasm") else "text/javascript", headers=hdr)
SPEECH = """(() => {
  const log = window.__speech = [];
  const synth = { speaking: false, pending: false, getVoices: () => [{ lang: 'zh-TW', name: 'fake-zh' }], addEventListener() {},
    speak(u) { log.push(u.text); setTimeout(() => { if (u.onend) u.onend({}); }, 200); }, cancel() {} };
  Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: synth });
  window.SpeechSynthesisUtterance = function (text) { this.text = text; this.volume = 1; this.lang = ''; this.voice = null; this.rate = 1; };
  try { localStorage.setItem('voiceMode', 'full'); } catch (e) {}
})();"""
WATCH = """window.__toasts = []; window.__reps = []; window.__green = false;
  new MutationObserver(() => {
    const t = document.getElementById('repToast'); const tt = t && t.textContent;
    if (t && !t.hidden && window.__toasts[window.__toasts.length - 1] !== tt) window.__toasts.push(tt);
    const r = document.getElementById('hudReps'); if (r && window.__reps[window.__reps.length - 1] !== r.textContent) window.__reps.push(r.textContent);
    const box = document.getElementById('hudRepsBox'); if (box && box.classList.contains('holding')) window.__green = true;
  }).observe(document, { subtree: true, childList: true, characterData: true, attributes: true });"""
with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/opt/pw-browsers/chromium")
    for worker in ['', '&worker=0']:
        tag = '（主畫面）' if worker else ''
        ctx = b.new_context(viewport={"width": 1280, "height": 800})
        pg = ctx.new_page(); errs = []
        pg.on("pageerror", lambda e: errs.append(str(e)))
        pg.route(CDN + "/**", fake_cdn)
        pg.route(MODEL, lambda r: r.fulfill(path=MP + "/pose_landmarker_lite.task", headers={"Access-Control-Allow-Origin": "*"}))
        pg.route("**/__test/pose.jpg", lambda r: r.fulfill(path=MP + "/pose.jpg", content_type="image/jpeg"))
        pg.add_init_script(cam_script(640, 480)); pg.add_init_script(SPEECH); pg.add_init_script(WATCH)
        pg.goto(base + "index.html?workout=squat" + worker); pg.wait_for_function(READY, timeout=60000)
        pg.evaluate("""() => { window.__whys = []; new MutationObserver(() => { const w = document.getElementById('formWhy');
          if (w && !w.hidden && w.textContent && window.__whys[window.__whys.length - 1] !== w.textContent) window.__whys.push(w.textContent); })
          .observe(document, { subtree: true, childList: true, characterData: true, attributes: true }); }""")
        pg.click("#startBtn"); pg.wait_for_timeout(19000)
        toasts = pg.evaluate("window.__toasts"); said = pg.evaluate("window.__speech"); whys = pg.evaluate("window.__whys")
        print('   ', toasts); print('   ', [x for x in said if x.strip()]); print('   ', whys)
        check(len(toasts) == 4 and not any('腳跟離地' in t for t in toasts[:2]) and all('腳跟離地' in t for t in toasts[2:]), f'{tag}每一下：前 2 下沒錯、後 2 下腳跟離地 {toasts}')
        check(whys and all(re.match(r'腳跟比站直時高 (\d+)%，超過 14% 算腳跟離地$', w) and 20 <= int(re.match(r'腳跟比站直時高 (\d+)%', w).group(1)) <= 30 for w in whys), f'{tag}說出原因：{whys}')
        check(any('腳跟踩穩' in x for x in said) and not any('腳跟踩穩' in x for x in said if x.startswith(('1 下', '2 下', '3 下'))), f'{tag}連續兩下才講（第 4 下）：{[x for x in said if x.strip()]}')
        pg.click("#stopBtn"); pg.wait_for_timeout(600)
        lines = pg.evaluate("[...document.querySelectorAll('#summaryLines li')].map(li => li.textContent)")
        check(any('腳跟離地 2 下' in l for l in lines), f'{tag}總結：{lines}')
        check(not errs, f'{tag}沒有錯誤 {errs[:2]}')
        ctx.close()
print('通過 |' if not fails else 'SOME FAIL', len(fails), fails[:5])
