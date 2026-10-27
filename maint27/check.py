# 10/27 保養：重播分析用同一套「每一下」圖表（瀏覽器端到端）
#  首頁鏡頭畫面錄一段假的深蹲（goal25 的假 AI 4 下）→ 下載 JSON → 關鏡頭看總結的圖 →
#  重播分析讀同一個檔：動作分析下面有同樣的圖（標題、圖例、每一條的角度、深度顏色、秒數都一樣），沒有重複的表格
#  圖的每一條和重播頁原本的表格（最小角度、判斷）對得起來；換動作（棒式、伏地挺身）沒有可畫的就收起來，換回來又出現
#  合成示範資料（側面深蹲，沒有記錄動作）選了深蹲才有圖；320／390 寬不超出；axe-core；舊程式（加 old）重播頁沒有圖
# 用法：python3 check.py <網站資料夾> <port> [old]（假的 AI 用 ../goal25 的 fake_squat.mjs）
import sys, os, re, json
sys.path.insert(0, '..')
from audit_common import *
from playwright.sync_api import sync_playwright
ROOT, PORT = sys.argv[1], int(sys.argv[2])
OLD = 'old' in sys.argv
HERE = os.path.dirname(os.path.abspath(__file__))
FAKES = os.path.join(HERE, '..', 'goal25')
base = serve(PORT, ROOT)
AXE = open(os.path.join(HERE, '..', 'a11y', 'node_modules', 'axe-core', 'axe.min.js')).read()
fails = []
def check(ok, msg):
    print(('PASS ' if ok else 'FAIL ') + msg)
    if not ok: fails.append(msg)
def fake_cdn(route):
    rel = route.request.url[len(CDN):].split("?")[0]
    hdr = {"Access-Control-Allow-Origin": "*"}
    if rel == '/vision_bundle.mjs': route.fulfill(path=f"{FAKES}/fake_squat.mjs", content_type="text/javascript", headers=hdr)
    elif rel == '/vision_bundle_real.mjs': route.fulfill(path=PKG + '/vision_bundle.mjs', content_type="text/javascript", headers=hdr)
    elif rel == '/vision_bundle.js': route.fulfill(path=f"{FAKES}/fake_squat.js", content_type="text/javascript", headers=hdr)
    elif rel == '/vision_bundle_real.js': route.fulfill(path=PKG + '/vision_bundle.js', content_type="text/javascript", headers=hdr)
    else: route.fulfill(path=PKG + rel, content_type="application/wasm" if rel.endswith(".wasm") else "text/javascript", headers=hdr)
INIT = "try { localStorage.setItem('voiceMode', 'off'); localStorage.setItem('recordCountdown', '0'); } catch (e) {}"
# 圖表的內容（首頁、重播頁共用）
CHART = """() => { const box = document.getElementById('repChart'); if (!box) return null;
  const figs = [...box.querySelectorAll('figure')].map(f => ({ title: f.querySelector('.rep-title').textContent,
    legend: [...f.querySelectorAll('.rep-key')].map(k => k.textContent), label: f.querySelector('svg').getAttribute('aria-label'),
    bars: [...f.querySelectorAll('.rep-mark')].map(m => m.getAttribute('class').replace('rep-mark ', '')),
    titles: [...f.querySelectorAll('.rep-bar title')].map(t => t.textContent),
    refs: f.querySelectorAll('.rep-ref').length, peak: (f.querySelector('.rep-peak') || {}).textContent }));
  return { hidden: box.hidden, figs, tables: box.querySelectorAll('.rep-table').length }; }"""
# 重播頁原本的表格：第幾下、最小角度、判斷
TABLE = """() => [...document.querySelectorAll('#squatTable tbody tr')].map(tr => [...tr.children].map(td => td.textContent))"""
def angles(fig):   # 「第 1 下：85°，到位」→ (1, 85, '到位')
    out = []
    for t in fig['titles']:
        m = re.match(r'第 (\d+) 下：(\d+)°，([^，]+)', t)
        out.append((int(m.group(1)), int(m.group(2)), m.group(3)) if m else t)
    return out
def seconds(fig):  # 「第 1 下：2.3 秒」→ (1, 2.3)
    return [(int(m.group(1)), float(m.group(2))) for m in (re.match(r'第 (\d+) 下：([\d.]+) 秒', t) for t in fig['titles']) if m]
with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/opt/pw-browsers/chromium")
    def page(vw=1280, vh=900, mobile=False):
        ctx = b.new_context(viewport={"width": vw, "height": vh}, is_mobile=mobile, has_touch=mobile, accept_downloads=True)
        pg = ctx.new_page(); pg.errs = []
        pg.on("pageerror", lambda e: pg.errs.append(str(e)))
        pg.route(CDN + "/**", fake_cdn)
        pg.route(MODEL, lambda r: r.fulfill(path=MP + "/pose_landmarker_lite.task", headers={"Access-Control-Allow-Origin": "*"}))
        pg.route("**/__test/pose.jpg", lambda r: r.fulfill(path=MP + "/pose.jpg", content_type="image/jpeg"))
        pg.add_init_script(cam_script(640, 480))
        pg.add_init_script(INIT)
        return ctx, pg
    def open_replay(pg, path):
        pg.goto(base + "replay.html"); pg.wait_for_timeout(500)
        pg.set_input_files("#fileInput", path)
        pg.wait_for_function("!document.getElementById('result').hidden || document.getElementById('loadStatus').classList.contains('error')", timeout=60000)
        pg.wait_for_timeout(800)
    # ---------- 首頁：錄一段假的深蹲、下載 JSON、關鏡頭看總結的圖 ----------
    ctx, pg = page()
    pg.goto(base + "index.html?workout=squat"); pg.wait_for_function(READY, timeout=60000)
    pg.click('#startBtn'); pg.wait_for_function("!document.getElementById('stage').hidden", timeout=10000)
    # 假的 AI 一開始站直 2 秒：在這之前開始錄（不倒數），4 下都錄得到
    pg.click("#dataBtn"); pg.click("#recordBtn"); pg.click("#dataBtn")
    pg.wait_for_function("document.getElementById('hudReps').textContent === '4'", timeout=60000)
    pg.wait_for_timeout(1500)
    pg.click("#dataBtn"); pg.click("#recordBtn"); pg.wait_for_timeout(300)
    with pg.expect_download() as d:
        pg.click("#jsonBtn")
    rec_path = os.path.join(HERE, 'rec_squat.json')
    d.value.save_as(rec_path)
    rec = json.load(open(rec_path))
    print('    錄製檔', len(rec['frames']), '格，動作', rec['meta'].get('workout'))
    pg.click("#dataBtn"); pg.click('#stopBtn'); pg.wait_for_timeout(800)
    home = pg.evaluate(CHART)
    print('    首頁', json.dumps(home, ensure_ascii=False)[:600])
    check(home and not home['hidden'] and len(home['figs']) == 2, '首頁：關鏡頭後有兩張圖（錄影那一段）')
    check(not pg.errs, f'首頁沒有錯誤 {pg.errs[:2]}')
    ctx.close()
    # ---------- 重播分析：讀同一個檔 ----------
    ctx, pg = page()
    open_replay(pg, rec_path)
    if OLD:
        check(pg.evaluate("!document.getElementById('repChart')"), '舊程式：重播頁沒有每一下的圖表')
        b.close(); print('通過 |' if not fails else 'SOME FAIL', len(fails), fails[:5]); sys.exit()
    rp = pg.evaluate(CHART)
    tbl = pg.evaluate(TABLE)
    print('    重播', json.dumps(rp, ensure_ascii=False)[:600])
    print('    重播表格', tbl)
    check(pg.evaluate("document.getElementById('workoutPick').value") == 'auto' and pg.is_visible('#squatCard') and not rp['hidden'] and len(rp['figs']) == 2,
          '重播頁：動作分析（錄製時選的深蹲）下面有兩張圖')
    check(rp['tables'] == 0, '重播頁的圖下面不再附「每一下的數字」（原本的表格比較詳細）')
    hd, hs = home['figs'][0], home['figs'][1]
    rd, rs = rp['figs'][0], rp['figs'][1]
    check([rd['title'], rs['title']] == [hd['title'], hs['title']] and rd['legend'] == hd['legend'], f'標題、圖例和首頁一樣 {rd["title"]} {rd["legend"]}')
    check(angles(rd) == angles(hd) and rd['bars'] == hd['bars'] and rd['peak'] == hd['peak'],
          f'每一下的角度、深度（顏色）、最深的數字和首頁一樣 {angles(rd)} / {angles(hd)}')
    sr, sh = seconds(rs), seconds(hs)
    diff = max(abs(a[1] - c[1]) for a, c in zip(sr, sh)) if len(sr) == len(sh) and sr else 99
    check(len(sr) == len(sh) == 4 and diff <= 0.1 and rs['legend'] == hs['legend'],
          f'每一下的秒數、平均線和首頁一樣（最多差 0.1 秒：錄製檔的時間是整數毫秒）差 {diff:.2f} {sr} / {sh} {rs["legend"]} {hs["legend"]}')
    print('    秒數完全一樣' if sr == sh else '    秒數有差（在 0.1 以內）')
    check(len(tbl) == len(rd['titles']) and all(int(r[0]) == a[0] and r[2] == str(a[1]) + '°' and a[2] in r[3] for r, a in zip(tbl, angles(rd))),
          '圖的每一條和下面的表格（第幾下、最小角度、判斷：表格寫「蹲到位」、圖寫「到位」）對得起來')
    # 換動作：棒式、伏地挺身沒有可以畫的 → 收起來；換回來又出現
    for w in ['plank', 'pushup']:
        pg.select_option('#workoutPick', w); pg.wait_for_timeout(800)
        c = pg.evaluate(CHART)
        check(c['hidden'] and not c['figs'], f'換成 {w}（這段是深蹲，沒有可畫的）：圖收起來')
    pg.select_option('#workoutPick', 'squat'); pg.wait_for_timeout(800)
    c = pg.evaluate(CHART)
    check(not c['hidden'] and angles(c['figs'][0]) == angles(hd), '換回深蹲：圖又出現、數字一樣')
    pg.locator('#squatCard').screenshot(path=os.path.join(HERE, 'replay_card_1280.png'))
    pg.add_script_tag(content=AXE)
    v = pg.evaluate("axe.run(document.getElementById('squatCard')).then(r => r.violations.map(x => x.id + ':' + x.nodes.length))")
    check(v == [], f'axe-core（動作分析、圖表）{v}')
    check(not pg.errs, f'重播頁沒有錯誤 {pg.errs[:2]}')
    # 合成示範資料：也有圖
    pg.goto(base + "replay.html"); pg.wait_for_timeout(500)
    pg.click('#demoSide')
    pg.wait_for_function("!document.getElementById('result').hidden", timeout=60000); pg.wait_for_timeout(800)
    # 示範資料沒有記錄動作：「錄製時沒有選動作」時沒有圖，選了深蹲才有
    c = pg.evaluate(CHART)
    check(c['hidden'] and not c['figs'], '合成示範資料沒有記錄動作：選動作之前沒有圖')
    pg.select_option('#workoutPick', 'squat'); pg.wait_for_timeout(800)
    c = pg.evaluate(CHART); tbl = pg.evaluate(TABLE)
    print('    示範', json.dumps(c, ensure_ascii=False)[:300])
    check(not c['hidden'] and len(c['figs']) == 2 and len(c['figs'][0]['titles']) == len(tbl) > 0 and c['tables'] == 0,
          f'合成示範資料（側面深蹲）：有圖、條數和表格一樣 {len(tbl)}')
    check(not pg.errs, f'沒有錯誤 {pg.errs[:2]}')
    ctx.close()
    # ---------- 版面：手機 ----------
    for w, h in [(320, 640), (390, 844)]:
        ctx, pg = page(w, h, mobile=True)
        open_replay(pg, rec_path)
        r = pg.evaluate("(() => { const b = document.getElementById('repChart').getBoundingClientRect(), c = document.getElementById('squatCard').getBoundingClientRect(); return [Math.round(b.right), Math.round(c.right), document.documentElement.scrollWidth, ...[...document.querySelectorAll('#repChart svg')].map(s => Math.round(s.getBoundingClientRect().right))]; })()")
        check(max(r) <= w and r[0] <= r[1], f'{w} 寬：圖在動作分析的框裡、整頁不超出 {r}')
        pg.locator('#squatCard').screenshot(path=os.path.join(HERE, f'replay_card_{w}.png'))
        check(not pg.errs, f'沒有錯誤 {pg.errs[:2]}')
        ctx.close()
    b.close()
print('通過 |' if not fails else 'SOME FAIL', len(fails), fails[:5])
