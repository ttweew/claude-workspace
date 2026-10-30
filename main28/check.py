# 10/28 主線：疲勞分析（瀏覽器端到端，假的 AI）
#  tired（6 下 85°＋6 下只蹲到約 102°、比較慢）：關鏡頭後「疲勞分析」寫變慢、變淺，表格前段第 1～4 下、後段第 9～12 下，
#    超過門檻的列寫「可能累了」；表格的數字和每一下的表格對得起來（平均）；運動中第 8 下講「8 下，越來越淺了」、
#    畫面提示也寫，整組只一次；只講錯誤時講「越來越淺了」
#  steady（8 下一樣）：差不多、不提醒；goal25 的 4 下深蹲：寫「做 6 下以上才比」；棒式：沒有疲勞分析
#  320、390 寬不超出；axe-core；舊程式（加 old）沒有疲勞分析
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
  try { localStorage.setItem('voiceMode', %s); } catch (e) {}
  window.__toasts = [];
  document.addEventListener('DOMContentLoaded', () => {
    const t = document.getElementById('repToast');
    new MutationObserver(() => { if (!t.hidden) window.__toasts.push(t.textContent); }).observe(t, { childList: true, characterData: true, subtree: true, attributes: true });
  });
})();"""
FAT = """() => { const box = document.getElementById('fatigueBox'); if (!box) return null;
  return { hidden: box.hidden, line: (box.querySelector('.fatigue-line') || {}).textContent || '',
    range: (box.querySelector('.fatigue-range') || {}).textContent || '',
    rows: [...box.querySelectorAll('.fatigue-list li')].map(li => ({ tired: li.classList.contains('tired'), name: li.querySelector('.fatigue-name').textContent.replace(/：$/, ''),
      text: li.childNodes[1].textContent, tag: (li.querySelector('.tired-tag') || {}).textContent || '' })),
    reps: [...document.querySelectorAll('#repChart .rep-table tbody tr')].map(tr => [...tr.children].map(td => td.textContent)),
    summary: [...document.querySelectorAll('#summaryLines li')].map(li => li.textContent) }; }"""
# 一樣的 8 下：每一項都是「一樣」（相似度可能差 1、2 分：每一下各自比對）
def rows_text_same(rows):
    return all(r['text'].endswith('（一樣）') for r in rows if r['name'] != '相似度')
with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/opt/pw-browsers/chromium")
    def run(workout, fake, done, vw=1280, vh=900, mode="'full'", mobile=False):
        FAKE['path'] = fake
        ctx = b.new_context(viewport={"width": vw, "height": vh}, is_mobile=mobile, has_touch=mobile)
        pg = ctx.new_page(); pg.errs = []
        pg.on("pageerror", lambda e: pg.errs.append(str(e)))
        pg.route(CDN + "/**", fake_cdn)
        pg.route(MODEL, lambda r: r.fulfill(path=MP + "/pose_landmarker_lite.task", headers={"Access-Control-Allow-Origin": "*"}))
        pg.route("**/__test/pose.jpg", lambda r: r.fulfill(path=MP + "/pose.jpg", content_type="image/jpeg"))
        pg.add_init_script(cam_script(640, 480))
        pg.add_init_script(INIT % mode)
        pg.goto(base + "index.html?workout=" + workout); pg.wait_for_function(READY, timeout=60000)
        pg.click('#startBtn'); pg.wait_for_function("!document.getElementById('stage').hidden", timeout=10000)
        pg.wait_for_function(done, timeout=120000)
        pg.wait_for_timeout(1500)
        pg.click('#stopBtn'); pg.wait_for_timeout(800)
        return ctx, pg
    if OLD:
        ctx, pg = run('squat', G25 + '/fake_squat', "document.getElementById('hudReps').textContent === '4'")
        check(pg.evaluate("!document.getElementById('fatigueBox')"), '舊程式沒有疲勞分析')
        b.close(); print('通過 |' if not fails else 'SOME FAIL', len(fails), fails[:5]); sys.exit()
    # ---------- 累了：6 下正常＋6 下又慢又淺 ----------
    ctx, pg = run('squat', HERE + '/fake_tired', "document.getElementById('hudReps').textContent === '12'")
    f = pg.evaluate(FAT); said = pg.evaluate("window.__speech"); toasts = pg.evaluate("window.__toasts")
    print('    ', json.dumps(f, ensure_ascii=False)[:1200]); print('     講的：', said)
    rows = {r['name']: r for r in f['rows']}
    check(not f['hidden'] and f['line'].startswith('疲勞分析：後段（第 9～12 下）比前段（第 1～4 下）變慢 ') and '變淺 ' in f['line'] and f['line'].endswith('可能累了'),
          '總結：後段比前段變慢、變淺，可能累了｜' + f['line'])
    check(f['range'] == '前段（第 1～4 下）→ 後段（第 9～12 下）' and list(rows) == ['每下幾秒', '最低的角度', '有錯誤的', '相似度']
          and [n for n, r in rows.items() if r['tired']] == ['每下幾秒', '最低的角度'] and all((r['tag'] == '可能累了') == r['tired'] for r in rows.values()),
          '每一項：前段 → 後段；變慢、變淺的那兩項寫「可能累了」')
    m1 = re.search(r'變慢 (\d+)%', f['line']); m2 = re.search(r'變淺 (\d+)°', f['line'])
    check(m1 and rows['每下幾秒']['text'].endswith('（慢 ' + m1.group(1) + '%）') and m2 and rows['最低的角度']['text'].endswith('（淺 ' + m2.group(1) + '°）'),
          '那一句的數字和下面每一項一樣 ' + str([rows['每下幾秒']['text'], rows['最低的角度']['text']]))
    # 前段、後段的平均＝每一下的表格（第 1～4 下、第 9～12 下）的平均，照畫面的位數四捨五入
    reps = f['reps']
    avg = lambda xs: sum(xs) / len(xs)
    rnd1 = lambda x: int(x * 10 + 0.5) / 10
    fs, bs = rnd1(avg([float(r[3]) for r in reps[:4]])), rnd1(avg([float(r[3]) for r in reps[8:12]]))
    fa, ba = int(avg([int(r[1].rstrip('°')) for r in reps[:4]]) + 0.5), int(avg([int(r[1].rstrip('°')) for r in reps[8:12]]) + 0.5)
    check(len(reps) == 12 and rows['每下幾秒']['text'].startswith(f'{fs} 秒 → {bs} 秒（') and rows['最低的角度']['text'].startswith(f'{fa}° → {ba}°（'),
          f'前段、後段的平均和每一下的表格對得起來 {fs}/{bs} 秒 {fa}/{ba}°')
    tired_said = [t for t in said if '越來越淺' in t]
    check(tired_said == ['8 下，越來越淺了'], f'運動中第 8 下講「8 下，越來越淺了」，整組只一次 {tired_said}')
    tired_toasts = sorted(set(t for t in toasts if '越來越淺' in t))
    check(len(tired_toasts) == 1 and tired_toasts[0].startswith('第 8 下'), f'畫面提示：第 8 下寫「越來越淺了」{tired_toasts}')
    pg.locator('#summary').screenshot(path=os.path.join(HERE, 'tired_1280.png'))
    pg.add_script_tag(content=AXE)
    v = pg.evaluate("axe.run(document.getElementById('summary')).then(r => r.violations.map(x => x.id + ':' + x.nodes.length))")
    check(v == [], f'axe-core（總結、疲勞分析）{v}')
    check(not pg.errs, f'沒有錯誤 {pg.errs[:2]}')
    ctx.close()
    # ---------- 只講錯誤＋320 寬 ----------
    ctx, pg = run('squat', HERE + '/fake_tired', "document.getElementById('hudReps').textContent === '12'", 320, 640, "'errors'", True)
    said = pg.evaluate("window.__speech")
    check([t for t in said if '越來越淺' in t] == ['越來越淺了'], f'只講錯誤時也講「越來越淺了」（不講次數）{[t for t in said if "淺" in t]}')
    r = pg.evaluate("(() => { const b = document.getElementById('fatigueBox'); return [Math.round(b.getBoundingClientRect().right), document.documentElement.scrollWidth, b.scrollWidth, b.clientWidth]; })()")
    check(r[0] <= 320 and r[1] <= 320 and r[2] <= r[3], f'320 寬：疲勞分析在框裡、字自己換行不超出、整頁不左右捲動 {r}')
    pg.locator('#fatigueBox').screenshot(path=os.path.join(HERE, 'tired_320.png'))
    check(not pg.errs, f'沒有錯誤 {pg.errs[:2]}')
    ctx.close()
    # ---------- 一樣的 8 下（390 寬）----------
    ctx, pg = run('squat', HERE + '/fake_steady', "document.getElementById('hudReps').textContent === '8'", 390, 844, mobile=True)
    f = pg.evaluate(FAT); said = pg.evaluate("window.__speech")
    check(f['line'] == '疲勞分析：前段（第 1～2 下）和後段（第 7～8 下）差不多，沒有看到疲勞的跡象' and len(f['rows']) == 4 and not any(r['tired'] or r['tag'] for r in f['rows'])
          and rows_text_same(f['rows']),
          '一樣的 8 下：差不多，沒有「可能累了」｜' + f['line'])
    check(not [t for t in said if '淺' in t or '慢' in t], '一樣的 8 下：運動中不提醒')
    r = pg.evaluate("[Math.round(document.getElementById('fatigueBox').getBoundingClientRect().right), document.documentElement.scrollWidth]")
    check(max(r) <= 390, f'390 寬不超出 {r}')
    pg.locator('#fatigueBox').screenshot(path=os.path.join(HERE, 'steady_390.png'))
    check(not pg.errs, f'沒有錯誤 {pg.errs[:2]}')
    ctx.close()
    # ---------- 4 下（不夠 6 下）、棒式 ----------
    ctx, pg = run('squat', G25 + '/fake_squat', "document.getElementById('hudReps').textContent === '4'")
    f = pg.evaluate(FAT)
    check(not f['hidden'] and f['line'] == '疲勞分析：做 6 下以上才比前段和後段（這次 4 下）' and not f['rows'], '4 下：寫要做 6 下以上，沒有表格｜' + f['line'])
    ctx.close()
    ctx, pg = run('plank', G25 + '/fake_plank', "document.getElementById('hudReps').textContent === '0:21'")
    f = pg.evaluate(FAT)
    check(f['hidden'] and not f['line'] and len(f['summary']) > 0, '棒式：沒有疲勞分析（總結照常）')
    check(not pg.errs, f'沒有錯誤 {pg.errs[:2]}')
    ctx.close()
    b.close()
print('通過 |' if not fails else 'SOME FAIL', len(fails), fails[:5])
