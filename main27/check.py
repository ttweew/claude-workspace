# 10/27 主線：運動總結的「每一下」圖表（瀏覽器端到端）
#  深蹲（goal25 的假 AI 4 下）：關鏡頭後總結下面兩張圖（深度、秒數）＋表格；長條 4 條、顏色＝深度、說明（title）、
#    最深的數字、到位線、平均線；表格的數字和總結的文字一樣（最低角度、每下秒數）
#  棒式（目標 18 秒）：每一次撐幾秒＋目標線；自由模式沒有圖
#  版面：320、390、1280 寬不超出、拍照；axe-core；舊程式（加 old）沒有圖
# 用法：python3 check.py <網站資料夾> <port> [old]（假的 AI 用 ../goal25 的 fake_*.mjs，先跑那裡的 make_fake.mjs）
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
FAKE = {'name': 'squat'}
def fake_cdn(route):
    rel = route.request.url[len(CDN):].split("?")[0]
    hdr = {"Access-Control-Allow-Origin": "*"}
    n = FAKE['name']
    if rel == '/vision_bundle.mjs': route.fulfill(path=f"{FAKES}/fake_{n}.mjs", content_type="text/javascript", headers=hdr)
    elif rel == '/vision_bundle_real.mjs': route.fulfill(path=PKG + '/vision_bundle.mjs', content_type="text/javascript", headers=hdr)
    elif rel == '/vision_bundle.js': route.fulfill(path=f"{FAKES}/fake_{n}.js", content_type="text/javascript", headers=hdr)
    elif rel == '/vision_bundle_real.js': route.fulfill(path=PKG + '/vision_bundle.js', content_type="text/javascript", headers=hdr)
    else: route.fulfill(path=PKG + rel, content_type="application/wasm" if rel.endswith(".wasm") else "text/javascript", headers=hdr)
INIT = """try { localStorage.setItem('voiceMode', 'off'); %s } catch (e) {}"""
CHART = """() => { const box = document.getElementById('repChart'); if (!box) return null;
  const figs = [...box.querySelectorAll('figure')].map(f => ({ title: f.querySelector('.rep-title').textContent,
    legend: [...f.querySelectorAll('.rep-key')].map(k => k.textContent), label: f.querySelector('svg').getAttribute('aria-label'),
    bars: [...f.querySelectorAll('.rep-mark')].map(m => m.getAttribute('class').replace('rep-mark ', '')),
    titles: [...f.querySelectorAll('.rep-bar title')].map(t => t.textContent),
    refs: f.querySelectorAll('.rep-ref').length, peak: (f.querySelector('.rep-peak') || {}).textContent, peakY: Number((f.querySelector('.rep-peak') || { getAttribute: () => NaN }).getAttribute('y')),
    width: Math.round(f.querySelector('svg').getBoundingClientRect().width) }));
  const rows = [...box.querySelectorAll('.rep-table tbody tr')].map(tr => [...tr.children].map(td => td.textContent));
  return { hidden: box.hidden, figs, rows, summary: [...document.querySelectorAll('#summaryLines li')].map(li => li.textContent) }; }"""
with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/opt/pw-browsers/chromium")
    def run(workout, vw=1280, vh=800, extra='', wait=None, mobile=False):
        ctx = b.new_context(viewport={"width": vw, "height": vh}, is_mobile=mobile, has_touch=mobile)
        pg = ctx.new_page(); errs = []
        pg.on("pageerror", lambda e: errs.append(str(e)))
        pg.route(CDN + "/**", fake_cdn)
        pg.route(MODEL, lambda r: r.fulfill(path=MP + "/pose_landmarker_lite.task", headers={"Access-Control-Allow-Origin": "*"}))
        pg.route("**/__test/pose.jpg", lambda r: r.fulfill(path=MP + "/pose.jpg", content_type="image/jpeg"))
        pg.add_init_script(cam_script(640, 480))
        pg.add_init_script(INIT % extra)
        pg.goto(base + "index.html?workout=" + workout); pg.wait_for_function(READY, timeout=60000)
        pg.click('#startBtn'); pg.wait_for_function("!document.getElementById('stage').hidden", timeout=10000)
        if wait: pg.wait_for_function(wait, timeout=60000)
        pg.wait_for_timeout(500)
        pg.click('#stopBtn'); pg.wait_for_timeout(800)
        return ctx, pg, errs
    if OLD:
        ctx, pg, errs = run('squat', wait="document.getElementById('hudReps').textContent === '4'")
        check(pg.evaluate("!document.getElementById('repChart')"), '舊程式沒有每一下的圖表')
        b.close(); print('通過 |' if not fails else 'SOME FAIL', len(fails), fails[:5]); sys.exit()
    # ---------- 深蹲 4 下 ----------
    ctx, pg, errs = run('squat', wait="document.getElementById('hudReps').textContent === '4'")
    c = pg.evaluate(CHART)
    print('   ', json.dumps(c, ensure_ascii=False)[:900])
    d, sp = c['figs'][0], c['figs'][1]
    check(not c['hidden'] and len(c['figs']) == 2, '關鏡頭後總結下面有兩張圖（深度、秒數）')
    check(d['title'] == '每一下最低的膝蓋角度' and d['legend'] == ['到位 ≤ 90°', '再低一點 ≤ 110°', '太淺'] and d['refs'] == 1, f'深度圖的標題、圖例、到位線 {d["title"]} {d["legend"]} {d["refs"]}')
    check(all(12 <= f['peakY'] <= 110 for f in c['figs']), f'最深、最慢的數字寫在圖裡（不跑到圖外面）{[f["peakY"] for f in c["figs"]]}')
    check(d['bars'] == ['good'] * 4 and len(d['titles']) == 4 and d['titles'][0].startswith('第 1 下：') and '到位' in d['titles'][0], f'4 條、顏色＝到位、每條有說明 {d["titles"][:1]}')
    m = re.search(r'最低 (\d+)°、平均 (\d+)°，每下約 ([\d.]+) 秒', ' '.join(c['summary']))
    check(m and d['peak'] == m.group(1) + '°', f'最深的數字和總結的「最低」一樣 {d["peak"]} {m and m.group(0)}')
    check(m and sp['legend'] == ['平均 ' + m.group(3) + ' 秒'] and sp['refs'] == 1 and len(sp['bars']) == 4 and set(sp['bars']) == {'time'}, f'秒數圖：平均線和總結的「每下約幾秒」一樣 {sp["legend"]}')
    check(len(c['rows']) == 4 and all(r[2] == '到位' for r in c['rows']) and min(int(r[1].rstrip('°')) for r in c['rows']) == int(m.group(1)), f'表格 4 列、和圖一樣 {c["rows"][:2]}')
    check(abs(sum(float(r[3]) for r in c['rows']) / 4 - float(m.group(3))) <= 0.05, '表格的秒數平均和總結一樣（差 0.05 以內：每一下各自四捨五入）')
    pg.screenshot(path=os.path.join(HERE, 'summary_1280.png'), full_page=False, clip={'x': 0, 'y': 0, 'width': 1280, 'height': 800})
    pg.locator('#summary').screenshot(path=os.path.join(HERE, 'summary_box_1280.png'))
    pg.click('.rep-table summary'); pg.wait_for_timeout(200)
    pg.add_script_tag(content=AXE)
    v = pg.evaluate("axe.run(document.getElementById('summary')).then(r => r.violations.map(x => x.id + ':' + x.nodes.length))")
    check(v == [], f'axe-core（總結、圖表、表格）{v}')
    check(not errs, f'沒有錯誤 {errs[:2]}')
    ctx.close()
    # ---------- 棒式，目標 18 秒 ----------
    FAKE['name'] = 'plank'
    ctx, pg, errs = run('plank', extra="localStorage.setItem('workoutGoals', JSON.stringify({ plank: 18 }));", wait="document.getElementById('hudReps').textContent === '0:21'")
    c = pg.evaluate(CHART)
    print('   ', json.dumps(c, ensure_ascii=False)[:500])
    f = c['figs'][0] if c['figs'] else {}
    check(len(c['figs']) == 1 and f['title'] == '每一次撐幾秒' and f['legend'] == ['目標 18 秒'] and f['refs'] == 1 and f['bars'] == ['time'], f'棒式：一張圖、目標線 {f.get("title")} {f.get("legend")}')
    check(f.get('peak') == c['rows'][0][1] + ' 秒' and any(c['rows'][0][1] in t for t in [' '.join(c['summary'])]) if c['rows'] else False, f'最久的秒數和表格、總結一樣 {f.get("peak")} {c["rows"]}')
    check(not errs, f'沒有錯誤 {errs[:2]}')
    ctx.close()
    # ---------- 版面：手機 ----------
    FAKE['name'] = 'squat'
    for w, h in [(320, 640), (390, 844)]:
        ctx, pg, errs = run('squat', w, h, wait="document.getElementById('hudReps').textContent === '4'", mobile=True)
        r = pg.evaluate("(() => { const b = document.getElementById('repChart').getBoundingClientRect(); return [Math.round(b.right), document.documentElement.scrollWidth, ...[...document.querySelectorAll('#repChart svg')].map(s => Math.round(s.getBoundingClientRect().right))]; })()")
        check(max(r) <= w, f'{w} 寬：圖表不超出 {r}')
        pg.click('.rep-table summary'); pg.wait_for_timeout(200)
        pg.locator('#summary').screenshot(path=os.path.join(HERE, f'summary_box_{w}.png'))
        tw = pg.evaluate("(() => { const w = document.querySelector('.rep-table .table-wrap'); return [w.clientWidth, w.scrollWidth, document.documentElement.scrollWidth]; })()")
        check(tw[2] <= w, f'{w} 寬：表格在自己的框裡（整頁不左右捲動）{tw}')
        check(not errs, f'沒有錯誤 {errs[:2]}')
        ctx.close()
    b.close()
print('通過 |' if not fails else 'SOME FAIL', len(fails), fails[:5])
