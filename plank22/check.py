# 10/22 主線：棒式趴好就算開始、一直線才計時（鏡頭畫面端到端，假的 AI 播放屁股一直翹著 10 秒再起身）
#  - 屁股翹著時秒數停在 0:00、不變綠；紅字屁股太高、講「屁股太高」
#  - 起身後記一次：提示「第 1 次 · 撐了 0:00 · 屁股太高」，講「這次身體沒有一直線，沒有計時」（不講「撐了 0 秒」）
#  - 關鏡頭的總結：棒式 1 次、屁股太高 1 次；背景執行緒和主畫面兩種都跑
# 用法：python3 check.py <網站資料夾>；先跑 node make_fake.mjs <網站資料夾>
import sys, os, re
sys.path.insert(0, '..')
from audit_common import *
from playwright.sync_api import sync_playwright
ROOT = sys.argv[1]
HERE = os.path.dirname(os.path.abspath(__file__))
base = serve(8829, ROOT)
fails = []
def check(ok, msg):
    print(('PASS ' if ok else 'FAIL ') + msg)
    if not ok: fails.append(msg)
def fake_cdn(route):
    rel = route.request.url[len(CDN):].split("?")[0]
    hdr = {"Access-Control-Allow-Origin": "*"}
    if rel == '/vision_bundle.mjs': route.fulfill(path=f"{HERE}/fake_pike.mjs", content_type="text/javascript", headers=hdr)
    elif rel == '/vision_bundle_real.mjs': route.fulfill(path=PKG + '/vision_bundle.mjs', content_type="text/javascript", headers=hdr)
    elif rel == '/vision_bundle.js': route.fulfill(path=f"{HERE}/fake_pike.js", content_type="text/javascript", headers=hdr)
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
        pg.goto(base + "index.html?workout=plank" + worker); pg.wait_for_function(READY, timeout=60000)
        pg.click("#startBtn"); pg.wait_for_timeout(8000)
        tip = pg.text_content("#formTipText")
        check(pg.text_content("#hudReps") == '0:00' and tip.startswith('屁股太高'), f'{tag}屁股翹著：秒數 {pg.text_content("#hudReps")}、紅字「{tip}」')
        pg.wait_for_timeout(10000)
        toasts = pg.evaluate("window.__toasts"); said = pg.evaluate("window.__speech"); reps = pg.evaluate("window.__reps")
        # 一開始 HTML 裡是 0（還沒換成棒式的 0:00）
        check(set(reps) - {'0'} == {'0:00'} and not pg.evaluate("window.__green"), f'{tag}整段秒數都是 0:00、沒有變綠 {reps}')
        check(any(re.match(r'第 1 次 · 撐了 0:00 · 屁股太高$', t) for t in toasts), f'{tag}起身後記一次：{toasts}')
        check('這次身體沒有一直線，沒有計時' in said and not any('撐了 0 秒' in s for s in said) and any('屁股' in s for s in said),
              f'{tag}講的話：{[s for s in said if s.strip()]}')
        pg.click("#stopBtn"); pg.wait_for_timeout(600)
        lines = pg.evaluate("[...document.querySelectorAll('#summaryLines li')].map(li => li.textContent)")
        check(pg.is_visible("#summary") and lines[:2] == ['棒式 1 次，最久 0:00，總共 0:00', '要注意：屁股太高 1 次'], f'{tag}總結：{lines}')
        check(not errs, f'{tag}沒有錯誤 {errs[:2]}')
        ctx.close()
print('通過 |' if not fails else 'SOME FAIL', len(fails), fails[:5])
