# 10/29 主線：動作流暢度（瀏覽器端到端，假的 AI）
#  stall（6 下，第 3 下下去到一半停 0.5 秒）：第 3 下的提示寫「卡了一下」、其他下沒有；總結「節奏穩（6 下有 6 下…）；1 下中途卡了一下（第 3 下）」
#    （第 3 下停了 0.5 秒，2.8 秒，和平均 2.4 秒差不到 2 成）；每一下的表格多一欄「順不順」（第 3 下「卡了 1 次」、其他「順」），深度圖第 3 條的說明寫「中途卡了一下」；不講話（只有提示）
#  goal25 的 4 下深蹲：「做 5 下以上才看節奏；每一下都很順」；棒式：沒有流暢度
#  320 寬不超出；axe-core；舊程式（加 old）沒有流暢度
# 用法：python3 check.py <網站資料夾> <port> [old]（先跑 make_fake.mjs；4 下深蹲、棒式用 ../goal25 的假 AI）
import sys, os, re, json
sys.path.insert(0, '..')
from audit_common import *
from playwright.sync_api import sync_playwright
ROOT, PORT = sys.argv[1], int(sys.argv[2])
OLD = 'old' in sys.argv
HERE = os.path.dirname(os.path.abspath(__file__))
G25 = os.path.join(HERE, '..', 'goal25')
base = serve(PORT, ROOT)
AXE = open(os.path.join(HERE, '..', 'a11y', 'node_modules', 'axe-core', 'axe.min.js')).read()
fails = []
def check(ok, msg):
    print(('PASS ' if ok else 'FAIL ') + msg)
    if not ok: fails.append(msg)
FAKE = {'path': ''}
def fake_cdn(route):
    rel = route.request.url[len(CDN):].split("?")[0]
    hdr = {"Access-Control-Allow-Origin": "*"}
    if rel == '/vision_bundle.mjs': route.fulfill(path=FAKE['path'] + '.mjs', content_type="text/javascript", headers=hdr)
    elif rel == '/vision_bundle_real.mjs': route.fulfill(path=PKG + '/vision_bundle.mjs', content_type="text/javascript", headers=hdr)
    elif rel == '/vision_bundle.js': route.fulfill(path=FAKE['path'] + '.js', content_type="text/javascript", headers=hdr)
    elif rel == '/vision_bundle_real.js': route.fulfill(path=PKG + '/vision_bundle.js', content_type="text/javascript", headers=hdr)
    else: route.fulfill(path=PKG + rel, content_type="application/wasm" if rel.endswith(".wasm") else "text/javascript", headers=hdr)
INIT = """(() => {
  const log = window.__speech = [];
  const synth = { speaking: false, pending: false, getVoices: () => [{ lang: 'zh-TW', name: 'fake-zh' }], addEventListener() {},
    speak(u) { log.push(u.text); setTimeout(() => { if (u.onend) u.onend({}); }, 200); }, cancel() {} };
  Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: synth });
  window.SpeechSynthesisUtterance = function (text) { this.text = text; this.volume = 1; this.lang = ''; this.voice = null; this.rate = 1; };
  try { localStorage.setItem('voiceMode', 'full'); } catch (e) {}
  window.__toasts = [];
  document.addEventListener('DOMContentLoaded', () => {
    const t = document.getElementById('repToast');
    new MutationObserver(() => { if (!t.hidden) window.__toasts.push(t.textContent); }).observe(t, { childList: true, characterData: true, subtree: true, attributes: true });
  });
})();"""
INFO = """() => { const fb = document.getElementById('fluencyBox');
  const head = [...document.querySelectorAll('#repChart .rep-table thead th')].map(th => th.textContent);
  return { exists: !!fb, hidden: fb ? fb.hidden : null, line: fb ? fb.textContent : '', head,
    rows: [...document.querySelectorAll('#repChart .rep-table tbody tr')].map(tr => [...tr.children].map(td => td.textContent)),
    titles: [...(document.querySelector('#repChart figure') || document.createElement('i')).querySelectorAll('.rep-bar title')].map(t => t.textContent),
    summary: [...document.querySelectorAll('#summaryLines li')].map(li => li.textContent).join(' ') }; }"""
with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/opt/pw-browsers/chromium")
    def run(workout, fake, done, vw=1280, vh=900, mobile=False):
        FAKE['path'] = fake
        ctx = b.new_context(viewport={"width": vw, "height": vh}, is_mobile=mobile, has_touch=mobile)
        pg = ctx.new_page(); pg.errs = []
        pg.on("pageerror", lambda e: pg.errs.append(str(e)))
        pg.route(CDN + "/**", fake_cdn)
        pg.route(MODEL, lambda r: r.fulfill(path=MP + "/pose_landmarker_lite.task", headers={"Access-Control-Allow-Origin": "*"}))
        pg.route("**/__test/pose.jpg", lambda r: r.fulfill(path=MP + "/pose.jpg", content_type="image/jpeg"))
        pg.add_init_script(cam_script(640, 480))
        pg.add_init_script(INIT)
        pg.goto(base + "index.html?workout=" + workout); pg.wait_for_function(READY, timeout=60000)
        pg.click('#startBtn'); pg.wait_for_function("!document.getElementById('stage').hidden", timeout=10000)
        pg.wait_for_function(done, timeout=120000)
        pg.wait_for_timeout(1500)
        pg.click('#stopBtn'); pg.wait_for_timeout(800)
        return ctx, pg
    if OLD:
        ctx, pg = run('squat', HERE + '/fake_stall', "document.getElementById('hudReps').textContent === '6'")
        check(pg.evaluate("!document.getElementById('fluencyBox')"), '舊程式沒有動作流暢度')
        b.close(); print('通過 |' if not fails else 'SOME FAIL', len(fails), fails[:5]); sys.exit()
    # ---------- 6 下，第 3 下卡一下 ----------
    ctx, pg = run('squat', HERE + '/fake_stall', "document.getElementById('hudReps').textContent === '6'")
    f = pg.evaluate(INFO); toasts = sorted(set(pg.evaluate("window.__toasts"))); said = pg.evaluate("window.__speech")
    print('    ', json.dumps(f, ensure_ascii=False)[:800]); print('     提示：', toasts); print('     講的：', said)
    check(not f['hidden'] and re.fullmatch(r'動作流暢度：節奏穩（6 下有 6 下和平均的 [\d.]+ 秒差不到 2 成）；1 下中途卡了一下（第 3 下）', f['line']), '總結：節奏穩、第 3 下卡了一下｜' + f['line'])
    m1 = re.search(r'每下約 ([\d.]+) 秒', f['summary']); m2 = re.search(r'和平均的 ([\d.]+) 秒', f['line'])
    check(m1 and m2 and m1.group(1) == m2.group(1), f'節奏的平均和總結的「每下約幾秒」一樣 {m1 and m1.group(0)} {m2 and m2.group(0)}')
    stall_toasts = [t for t in toasts if '卡了一下' in t]
    check(len(stall_toasts) == 1 and stall_toasts[0].startswith('第 3 下'), f'畫面提示：只有第 3 下寫「卡了一下」{stall_toasts}')
    # 10/31 起關鏡頭後的「教練建議：…」會提到卡住的是第幾下，那不是運動中的提醒，不算
    check(not any('卡' in s and not s.startswith('教練建議：') for s in said), '不講話（卡一下只寫在提示）')
    # 10/30 起「順不順」後面多一欄「晃動」（動作穩定度）
    check(f['head'] == ['第幾下', '最低角度', '深度', '秒數', '順不順', '晃動', '錯誤'] and [r[4] for r in f['rows']] == ['順', '順', '卡了 1 次', '順', '順', '順'],
          f'每一下的表格：「順不順」第 3 下卡了 1 次 {[r[4] for r in f["rows"]]}')
    check('中途卡了一下' in f['titles'][2] and not any('卡' in t for i, t in enumerate(f['titles']) if i != 2), f'深度圖第 3 條的說明寫「中途卡了一下」{f["titles"][2]}')
    pg.locator('#summary').screenshot(path=os.path.join(HERE, 'stall_1280.png'))
    pg.add_script_tag(content=AXE)
    v = pg.evaluate("axe.run(document.getElementById('summary')).then(r => r.violations.map(x => x.id + ':' + x.nodes.length))")
    check(v == [], f'axe-core（總結、動作流暢度）{v}')
    check(not pg.errs, f'沒有錯誤 {pg.errs[:2]}')
    ctx.close()
    # ---------- 320 寬 ----------
    ctx, pg = run('squat', HERE + '/fake_stall', "document.getElementById('hudReps').textContent === '6'", 320, 640, True)
    r = pg.evaluate("[Math.round(document.getElementById('fluencyBox').getBoundingClientRect().right), document.documentElement.scrollWidth, document.getElementById('fluencyBox').scrollWidth <= document.getElementById('fluencyBox').clientWidth]")
    check(r[0] <= 320 and r[1] <= 320 and r[2], f'320 寬：流暢度那一句換行、不超出 {r}')
    pg.locator('#summary').screenshot(path=os.path.join(HERE, 'stall_320.png'))
    check(not pg.errs, f'沒有錯誤 {pg.errs[:2]}')
    ctx.close()
    # ---------- 4 下、棒式 ----------
    ctx, pg = run('squat', G25 + '/fake_squat', "document.getElementById('hudReps').textContent === '4'")
    f = pg.evaluate(INFO)
    check(f['line'] == '動作流暢度：做 5 下以上才看節奏；每一下都很順，沒有卡住', '4 下：' + f['line'])
    ctx.close()
    ctx, pg = run('plank', G25 + '/fake_plank', "document.getElementById('hudReps').textContent === '0:21'")
    f = pg.evaluate(INFO)
    check(f['hidden'] and not f['line'], '棒式：沒有動作流暢度')
    check(not pg.errs, f'沒有錯誤 {pg.errs[:2]}')
    ctx.close()
    b.close()
print('通過 |' if not fails else 'SOME FAIL', len(fails), fails[:5])
