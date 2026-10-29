# 10/29 提案：加到手機主畫面（瀏覽器）
#  六頁都有 manifest、apple-touch-icon；manifest 讀得到、Chrome 看得懂（CDP Page.getAppManifest 沒有錯誤）、可以安裝（getInstallabilityErrors）；
#  圖示四張大小對、是 PNG；捷徑 ?workout= 打開首頁就選好那個動作；
#  「加到主畫面」按鈕：一開始藏起來；瀏覽器發 beforeinstallprompt 才出現，按了跳出安裝視窗、按鈕收起來；已經從主畫面打開（standalone）不出現；裝好了收起來
#  使用說明有步驟；首頁 320 寬不超出；axe-core；舊程式（加 old）沒有 manifest
# 用法：python3 check.py <網站資料夾> <port> [old]
import sys, os, json, struct, tempfile
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
def png_size(data):
    return struct.unpack('>II', data[16:24]) if data[:8] == b'\x89PNG\r\n\x1a\n' else None
FAKE_PROMPT = """(() => { const e = new Event('beforeinstallprompt', { cancelable: true }); window.__prompted = 0;
  e.prompt = () => { window.__prompted++; return Promise.resolve(); }; window.dispatchEvent(e); return e.defaultPrevented; })()"""
def installable(p, base):
    ctx = p.chromium.launch_persistent_context(tempfile.mkdtemp(), executable_path="/opt/pw-browsers/chromium")
    pg = ctx.new_page(); mock_network(pg)
    pg.goto(base + 'index.html'); pg.wait_for_timeout(2500)
    errs = ctx.new_cdp_session(pg).send('Page.getInstallabilityErrors').get('installabilityErrors')
    print('     installability：', errs)
    ctx.close()
    return errs == []
STANDALONE = [
    ('iPhone：navigator.standalone', "Object.defineProperty(navigator, 'standalone', { value: true });"),
    ('Android、電腦：display-mode', "(() => { const mm = window.matchMedia.bind(window); window.matchMedia = q => q.includes('display-mode: standalone') ? { matches: true, media: q, addEventListener() {}, removeEventListener() {} } : mm(q); })();"),
]
with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/opt/pw-browsers/chromium")
    pg = b.new_page(viewport={"width": 1280, "height": 900}); mock_network(pg); errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)))
    if OLD:
        pg.goto(base + "index.html"); pg.wait_for_timeout(500)
        check(pg.locator('link[rel=manifest]').count() == 0, '舊程式沒有 manifest')
        check(not installable(p, base), '舊程式不能安裝')
        b.close(); print('通過 |' if not fails else 'SOME FAIL', len(fails), fails[:5]); sys.exit()
    for page in ['index', 'replay', 'help', 'report', 'protractor', 'results']:
        pg.goto(base + page + '.html'); pg.wait_for_timeout(300)
        r = pg.evaluate("[document.querySelector('link[rel=manifest]')?.getAttribute('href'), document.querySelector('link[rel=apple-touch-icon]')?.getAttribute('href'), document.querySelector('meta[name=apple-mobile-web-app-title]')?.content]")
        check(r == ['manifest.webmanifest', 'icons/apple-touch-icon.png', 'AI 運動分析'], f'{page}.html 有 manifest、iPhone 主畫面圖示 {r}')
    # manifest 本身
    resp = pg.request.get(base + 'manifest.webmanifest')
    m = json.loads(resp.text())
    check(resp.status == 200 and m['display'] == 'standalone' and m['start_url'] == './' and m['scope'] == './' and m['short_name'] == 'AI 運動分析', f'manifest：從主畫面打開沒有網址列、從首頁開始 {m["display"]} {m["start_url"]}')
    for icon in m['icons'] + [{'src': 'icons/apple-touch-icon.png', 'sizes': '180x180'}]:
        r = pg.request.get(base + icon['src']); size = png_size(r.body())
        w, h = map(int, icon['sizes'].split('x'))
        check(r.status == 200 and size == (w, h), f'圖示 {icon["src"]} {size}（應該 {w}×{h}）{icon.get("purpose", "")}')
    check([s['url'] for s in m['shortcuts']] == ['./?workout=squat', './?workout=pushup', './?workout=plank', './?workout=lunge'], '長按圖示的捷徑：四個動作')
    # Chrome 讀得懂、可以安裝
    pg.goto(base + 'index.html'); pg.wait_for_timeout(2500)
    cdp = pg.context.new_cdp_session(pg)
    am = cdp.send('Page.getAppManifest')
    check(not am.get('errors') and am.get('url', '').endswith('manifest.webmanifest'), f'Chrome 讀 manifest 沒有錯誤 {am.get("errors")}')
    check(installable(p, base), 'Chrome 說可以安裝（不是無痕的視窗）')
    # 捷徑：打開首頁就選好那個動作
    for wk, name in [('pushup', '伏地挺身'), ('plank', '棒式')]:
        pg.goto(base + '?workout=' + wk); pg.wait_for_timeout(800)
        txt = pg.evaluate("document.getElementById('startBtn').textContent + '|' + (document.querySelector('[data-workout].picked, [aria-pressed=true][data-workout]')?.dataset.workout || '')")
        check(name in txt or wk in txt, f'捷徑 ?workout={wk}：首頁選好{name} {txt[:60]}')
    # 「加到主畫面」按鈕
    pg.goto(base + 'index.html'); pg.wait_for_timeout(800)
    check(pg.locator('#installBtn').is_hidden(), '一開始藏起來（瀏覽器還沒說可以安裝）')
    prevented = pg.evaluate(FAKE_PROMPT); pg.wait_for_timeout(200)
    check(prevented and pg.locator('#installBtn').is_visible(), '瀏覽器說可以安裝：先不讓它自己跳出來，頁尾出現按鈕')
    pg.locator('#installBtn').screenshot(path=os.path.join(HERE, 'install_btn.png'))
    pg.click('#installBtn'); pg.wait_for_timeout(200)
    check(pg.evaluate('window.__prompted') == 1 and pg.locator('#installBtn').is_hidden(), '按了跳出安裝視窗、按鈕收起來')
    pg.evaluate(FAKE_PROMPT); pg.wait_for_timeout(100)
    pg.evaluate("window.dispatchEvent(new Event('appinstalled'))"); pg.wait_for_timeout(100)
    check(pg.locator('#installBtn').is_hidden(), '裝好了（appinstalled）收起來')
    # 從主畫面打開（standalone）：不出現
    for how, script in STANDALONE:
        sp = b.new_page(); mock_network(sp); sp.add_init_script(script)
        sp.goto(base + 'index.html'); sp.wait_for_timeout(500)
        sp.evaluate(FAKE_PROMPT); sp.wait_for_timeout(200)
        check(sp.locator('#installBtn').is_hidden(), f'已經從主畫面打開（{how}）：不出現')
        sp.close()
    # 使用說明
    pg.goto(base + 'help.html#installFaq'); pg.wait_for_timeout(300)
    check(pg.evaluate("document.getElementById('installFaq').open"), '網址 #installFaq 直接打開這一題')
    t = pg.inner_text('#installFaq')
    check('加入主畫面' in t and '加到主畫面' in t and '分開存' in t, '使用說明：Android、iPhone、電腦的步驟，iPhone 的紀錄分開存')
    pg.add_script_tag(content=AXE)
    v = pg.evaluate("axe.run(document.getElementById('installFaq')).then(r => r.violations.map(x => x.id + ':' + x.nodes.length))")
    check(v == [], f'axe-core（使用說明這一題）{v}')
    check(not errs, f'沒有錯誤 {errs[:2]}')
    pg.close()
    # 首頁 320 寬：按鈕出現時不超出
    pg = b.new_page(viewport={"width": 320, "height": 640}); mock_network(pg)
    pg.goto(base + 'index.html'); pg.wait_for_timeout(800)
    pg.evaluate(FAKE_PROMPT); pg.wait_for_timeout(200)
    r = pg.evaluate("[Math.round(document.getElementById('installBtn').getBoundingClientRect().right), document.documentElement.scrollWidth]")
    check(max(r) <= 320, f'320 寬：按鈕不超出 {r}')
    pg.add_script_tag(content=AXE)
    v = pg.evaluate("axe.run(document.querySelector('footer')).then(r => r.violations.map(x => x.id + ':' + x.nodes.length))")
    check(v == [], f'axe-core（頁尾、按鈕）{v}')
    pg.close()
    b.close()
print('通過 |' if not fails else 'SOME FAIL', len(fails), fails[:5])
