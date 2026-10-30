# 10/30 主線：動作穩定度（瀏覽器端到端，假的 AI）
#  sway（6 下，後 3 下前後晃 ±13 像素）：總結「重心前後晃動平均…（示範動畫 2.3%），最多的是第 x 下；前段（第 1～2 下）2.3% → 後段（第 5～6 下）…」
#    每一下的表格多一欄「晃動」（前 3 下 2.3%、後 3 下比較大），平均是表格的平均
#  plank（26 秒，後半髖部上下晃）：「髖部上下晃動 ±…（第 1 次，撐 … 秒）；前段 ±0° → 後段 ±2～3°…」，表格「晃動」
#  pushup：沒有穩定度（那一句收起來、表格沒有「晃動」）
#  320 寬不超出；axe-core；舊程式（加 old）沒有穩定度
# 用法：python3 check.py <網站資料夾> <port> [old]（先跑 make_fake.mjs）
import sys, os, re, json
sys.path.insert(0, '..')
from audit_common import *
from playwright.sync_api import sync_playwright
ROOT, PORT = sys.argv[1], int(sys.argv[2])
OLD = 'old' in sys.argv
HERE = os.path.dirname(os.path.abspath(__file__))
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
  const synth = { speaking: false, pending: false, getVoices: () => [{ lang: 'zh-TW', name: 'fake-zh' }], addEventListener() {},
    speak(u) { setTimeout(() => { if (u.onend) u.onend({}); }, 200); }, cancel() {} };
  Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: synth });
  window.SpeechSynthesisUtterance = function (text) { this.text = text; this.volume = 1; this.lang = ''; this.voice = null; this.rate = 1; };
})();"""
INFO = """() => { const sb = document.getElementById('stabilityBox');
  const head = [...document.querySelectorAll('#repChart .rep-table thead th')].map(th => th.textContent);
  return { exists: !!sb, hidden: sb ? sb.hidden : null, line: sb ? sb.textContent : '', head,
    rows: [...document.querySelectorAll('#repChart .rep-table tbody tr')].map(tr => [...tr.children].map(td => td.textContent)) }; }"""
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
    SIX = "document.getElementById('hudReps').textContent === '6'"
    if OLD:
        ctx, pg = run('squat', HERE + '/fake_sway', SIX)
        check(pg.evaluate("!document.getElementById('stabilityBox')"), '舊程式沒有動作穩定度')
        ctx.close()
        # 320 寬打開表格：舊程式本來就要左右捲動嗎、axe-core（只印出來，不算通過或失敗）
        ctx, pg = run('squat', HERE + '/fake_sway', SIX, 320, 640, True)
        pg.locator('details.rep-table summary').click(); pg.wait_for_timeout(200)
        r = pg.evaluate("(() => { const w = document.querySelector('#repChart .table-wrap'); return [w.scrollWidth, w.clientWidth]; })()")
        pg.add_script_tag(content=AXE)
        v = pg.evaluate("axe.run(document.getElementById('summary')).then(r => r.violations.map(x => x.id + ':' + x.nodes.length))")
        print('     舊程式 320 寬的表格（內容寬、框寬）', r, 'axe-core', v)
        ctx.close()
        b.close(); print('通過 |' if not fails else 'SOME FAIL', len(fails), fails[:5]); sys.exit()
    # ---------- 深蹲 6 下，後 3 下前後晃 ----------
    ctx, pg = run('squat', HERE + '/fake_sway', SIX)
    f = pg.evaluate(INFO)
    print('    ', json.dumps(f, ensure_ascii=False)[:900])
    col = f['head'].index('晃動') if '晃動' in f['head'] else -1
    check(f['head'] == ['第幾下', '最低角度', '深度', '秒數', '順不順', '晃動', '錯誤'], f'每一下的表格多一欄「晃動」{f["head"]}')
    sw = [float(r[col].rstrip('%')) for r in f['rows']] if col >= 0 else []
    # 前 3 下是示範動畫的動作：底部停 0.5 秒（15 格）時 node 用同樣的格子算是 2.1%（停得越久越小，見 ../main30/ref3.mjs）
    check(len(sw) == 6 and max(sw[:3]) - min(sw[:3]) <= 0.2 and all(abs(v - 2.1) <= 0.2 for v in sw[:3]) and min(sw[3:]) >= 5, f'前 3 下約 2.1%（示範動畫、底部停 0.5 秒）、後 3 下晃得多 {sw}')
    m = re.fullmatch(r'動作穩定度：重心前後晃動平均 ([\d.]+)%（小腿長 100%；示範動畫 2\.3%），最多的是第 (\d) 下（([\d.]+)%）；前段（第 1～2 下）([\d.]+)% → 後段（第 5～6 下）([\d.]+)%', f['line'])
    check(not f['hidden'] and m is not None, '總結那一句｜' + f['line'])
    if m and len(sw) == 6:
        avg = round(sum(sw) / 6 + 1e-9, 1)
        check(float(m.group(1)) == avg, f'平均就是表格的平均 {m.group(1)} {avg}')
        check(float(m.group(3)) == max(sw) and sw[int(m.group(2)) - 1] == max(sw), f'最多的那一下和表格一樣 第 {m.group(2)} 下 {m.group(3)}')
        check(float(m.group(4)) == round((sw[0] + sw[1]) / 2 + 1e-9, 1) and float(m.group(5)) == round((sw[4] + sw[5]) / 2 + 1e-9, 1), f'前段是第 1、2 下的平均、後段是第 5、6 下的平均 {m.group(4)} → {m.group(5)}')
    pg.locator('details.rep-table summary').click(); pg.wait_for_timeout(200)
    pg.locator('#summary').screenshot(path=os.path.join(HERE, 'sway_1280.png'))
    pg.add_script_tag(content=AXE)
    v = pg.evaluate("axe.run(document.getElementById('summary')).then(r => r.violations.map(x => x.id + ':' + x.nodes.length))")
    check(v == [], f'axe-core（總結、穩定度、打開的表格）{v}')
    check(not pg.errs, f'沒有錯誤 {pg.errs[:2]}')
    ctx.close()
    # ---------- 320 寬 ----------
    ctx, pg = run('squat', HERE + '/fake_sway', SIX, 320, 640, True)
    pg.locator('details.rep-table summary').click(); pg.wait_for_timeout(200)
    r = pg.evaluate("""() => { const sb = document.getElementById('stabilityBox'), w = document.querySelector('#repChart .table-wrap');
      return [Math.round(sb.getBoundingClientRect().right), document.documentElement.scrollWidth, sb.scrollWidth <= sb.clientWidth, w.scrollWidth, w.clientWidth]; }""")
    print('     320：', r)
    check(r[0] <= 320 and r[1] <= 320 and r[2], f'320 寬：穩定度那一句換行、整頁不超出 {r[:3]}')
    pg.locator('#summary').screenshot(path=os.path.join(HERE, 'sway_320.png'))
    pg.add_script_tag(content=AXE)
    v = pg.evaluate("axe.run(document.getElementById('summary')).then(r => r.violations.map(x => x.id + ':' + x.nodes.length))")
    # 表格比框寬時，框要能用鍵盤選到（scrollable-region-focusable）：舊程式 320 寬就有（表格 296 寬、框 212，加 old 時印出來），
    # 今天的保養（無障礙）修；這裡只允許這一個，其他的都要 0 個
    check(v in ([], ['scrollable-region-focusable:1']), f'axe-core（320 寬，打開的表格；表格的框是舊程式就有的，保養修）{v}')
    check(not pg.errs, f'沒有錯誤 {pg.errs[:2]}')
    ctx.close()
    # ---------- 棒式 ----------
    ctx, pg = run('plank', HERE + '/fake_plank', "document.getElementById('hudReps').textContent === '0:24'")
    f = pg.evaluate(INFO)
    print('    ', json.dumps(f, ensure_ascii=False)[:600])
    m = re.fullmatch(r'動作穩定度：髖部上下晃動 ±([\d.]+)°（第 1 次，撐 (\d+) 秒）；前段 ±([\d.]+)° → 後段 ±([\d.]+)°；髖部的位置 前段(.+) → 後段(.+)', f['line'])
    check(m is not None, '棒式那一句｜' + f['line'])
    if m:
        check(float(m.group(3)) <= 0.2 and 2 <= float(m.group(4)) <= 3.2, f'前段撐得穩、後段晃 ±4.8 像素 {m.group(3)} → {m.group(4)}')
    check(f['head'] == ['第幾次', '秒數', '晃動', '錯誤'] and len(f['rows']) == 1 and m and f['rows'][0][2] == '±' + m.group(1) + '°' and m.group(2) == f['rows'][0][1],
          f'表格「晃動」和那一句一樣 {f["rows"]}')
    check(not pg.errs, f'沒有錯誤 {pg.errs[:2]}')
    ctx.close()
    # ---------- 伏地挺身 ----------
    ctx, pg = run('pushup', HERE + '/fake_pushup', "document.getElementById('hudReps').textContent === '3'")
    f = pg.evaluate(INFO)
    check(f['hidden'] and not f['line'] and '晃動' not in f['head'] and len(f['rows']) == 3, f'伏地挺身：沒有穩定度 {f["head"]}')
    check(not pg.errs, f'沒有錯誤 {pg.errs[:2]}')
    ctx.close()
    b.close()
print('通過 |' if not fails else 'SOME FAIL', len(fails), fails[:5])
