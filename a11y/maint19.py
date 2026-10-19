# 10/19 保養：首頁改版的連帶檢查
#  1. axe-core 自動檢查無障礙（首頁第一次來／上次選深蹲、使用說明、重播分析）：列出 WCAG A、AA 的問題
#  2. 鍵盤：只用 Tab、Enter 從首頁開鏡頭、結束；焦點的順序和畫面上一樣；結束後焦點回到上次的動作
#  3. 整條流程：首頁 → 鏡頭（伏地挺身）→ 總結 → 問雲端同步 → 打開 → 已同步 → 再做一組 → 和上一次比較、雲端 2 筆 → 「雲端同步是什麼？」打開說明那一題
# 用法：先開 Firebase 模擬器；cd a11y && python3 maint19.py
import sys, os, json, urllib.request
sys.path.insert(0, '..')
from audit_common import *
from playwright.sync_api import sync_playwright
ROOT = '/home/user/claude-workspace'
S = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FB = S + '/fb/node_modules/firebase'
LOOP = S + '/audit2'
AXE = os.path.dirname(os.path.abspath(__file__)) + '/node_modules/axe-core/axe.min.js'
SDK = 'https://www.gstatic.com/firebasejs/12.19.0'
base = serve(8873, ROOT)
ok = True
def check(cond, msg):
    global ok
    print(('PASS ' if cond else 'FAIL ') + msg); ok = ok and cond

def emu(method, path, body=None):
    req = urllib.request.Request('http://127.0.0.1:8080' + path, method=method, data=None if body is None else json.dumps(body).encode(),
                                 headers={'Content-Type': 'application/json', 'Authorization': 'Bearer owner'})
    with urllib.request.urlopen(req, timeout=20) as r: return json.loads(r.read().decode() or '{}')
def cloud_count():
    res = emu('POST', '/v1/projects/demo-sport/databases/(default)/documents:runQuery', {'structuredQuery': {'from': [{'collectionId': 'sessions', 'allDescendants': True}]}})
    return len([d for d in res if 'document' in d])
def fake_cdn(kind):
    def h(route):
        rel = route.request.url[len(CDN):].split("?")[0]
        hdr = {"Access-Control-Allow-Origin": "*"}
        if rel == '/vision_bundle.mjs': route.fulfill(path=f"{LOOP}/loop_{kind}.mjs", content_type="text/javascript", headers=hdr)
        elif rel == '/vision_bundle_real.mjs': route.fulfill(path=PKG + '/vision_bundle.mjs', content_type="text/javascript", headers=hdr)
        elif rel == '/vision_bundle.js': route.fulfill(path=f"{LOOP}/loop_{kind}.js", content_type="text/javascript", headers=hdr)
        elif rel == '/vision_bundle_real.js': route.fulfill(path=PKG + '/vision_bundle.js', content_type="text/javascript", headers=hdr)
        else: route.fulfill(path=PKG + rel, content_type="application/wasm" if rel.endswith(".wasm") else "text/javascript", headers=hdr)
    return h
def sdk(route):
    name = route.request.url[len(SDK) + 1:].split('?')[0]
    route.fulfill(path=f'{FB}/{name}', content_type='text/javascript', headers={'Access-Control-Allow-Origin': '*'})
SPY = """Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: { speaking: false, pending: false, getVoices: () => [], addEventListener() {}, cancel() {}, speak() {} } });"""
def context(b, init=None, vw=1280, vh=800):
    ctx = b.new_context(viewport={"width": vw, "height": vh})
    ctx.errs = []
    ctx.route(CDN + "/**", fake_cdn('pushup_err'))
    ctx.route(MODEL, lambda r: r.fulfill(path=MP + "/pose_landmarker_lite.task", headers={"Access-Control-Allow-Origin": "*"}))
    ctx.route("**/__test/pose.jpg", lambda r: r.fulfill(path=MP + "/pose.jpg", content_type="image/jpeg"))
    ctx.route(SDK + '/**', sdk)
    ctx.add_init_script(cam_script(640, 480)); ctx.add_init_script(SPY)
    if init: ctx.add_init_script(init)
    return ctx
def page(ctx, path='index.html?cloud=emulator', ready=True):
    pg = ctx.new_page()
    pg.on("pageerror", lambda e: ctx.errs.append(str(e)))
    pg.on("dialog", lambda d: d.accept())
    pg.goto(base + path)
    if ready: pg.wait_for_function(READY, timeout=60000)
    else: pg.wait_for_timeout(1000)
    return pg
def axe(pg, label):
    pg.add_script_tag(path=AXE)
    res = pg.evaluate("""async () => { const r = await axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] } });
        return r.violations.map(v => ({ id: v.id, impact: v.impact, n: v.nodes.length, help: v.help, targets: v.nodes.slice(0, 4).map(n => n.target.join(' ')) })); }""")
    print(f'  axe {label}：{len(res)} 種問題')
    for v in res: print(f"    - {v['id']}（{v['impact']}，{v['n']} 處）{v['help']}：{v['targets']}")
    return res

with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/opt/pw-browsers/chromium")
    emu('DELETE', '/emulator/v1/projects/demo-sport/databases/(default)/documents')

    # 1. axe-core
    found = {}
    for label, init, path, ready in [('首頁（第一次來）', None, 'index.html', True),
                                     ('首頁（上次深蹲）', "try { localStorage.setItem('workout', 'squat'); } catch (e) {}", 'index.html', True),
                                     ('使用說明', None, 'help.html', False), ('重播分析', None, 'replay.html', False)]:
        ctx = context(b, init); pg = page(ctx, path, ready)
        if path == 'index.html': pg.click('#advanced summary')
        found[label] = axe(pg, label)
        ctx.close()
    new_home = [v for v in found['首頁（第一次來）'] + found['首頁（上次深蹲）'] if any(k in ' '.join(v['targets']) for k in ['workout', 'startBtn', 'freeBtn', 'Toggle', 'cloudAsk', 'pickTitle', 'switch'])]
    check(not new_home, '首頁改版新加的元件沒有無障礙問題 ' + json.dumps(new_home, ensure_ascii=False)[:300])
    task = [v for v in found['使用說明'] if any('task' in t for t in v['targets'])]
    check(not task, '實測任務卡沒有無障礙問題 ' + json.dumps(task, ensure_ascii=False)[:300])

    # 2. 鍵盤
    ctx = context(b, "try { localStorage.setItem('workout', 'pushup'); } catch (e) {}"); pg = page(ctx)
    order = []
    pg.focus('body')
    for _ in range(40):
        pg.keyboard.press('Tab')
        f = pg.evaluate("(() => { const e = document.activeElement; return e ? (e.id || e.dataset.workout || e.textContent.trim().slice(0, 8)) : ''; })()")
        order.append(f)
        if f == 'cloudToggle': break
    grid = [x for x in order if x in ('squat', 'startBtn', 'plank', 'lunge')]
    check(grid == ['squat', 'startBtn', 'plank', 'lunge'] and order.index('lunge') < order.index('freeBtn') < order.index('voiceToggle') < order.index('cloudToggle'),
          f'Tab 的順序和畫面一樣（深蹲 → 伏地挺身（上次）→ 棒式 → 弓箭步 → 只看骨架 → 語音 → 雲端）：{order[-12:]}')
    pg.focus('#workoutGrid button[data-workout="squat"]'); pg.keyboard.press('Enter')
    pg.wait_for_selector('#stage:not([hidden])', timeout=20000); pg.wait_for_timeout(1500)
    check(pg.evaluate("document.activeElement.id") == 'stopBtn' and pg.text_content('#hudRepsName') == '深蹲', '鍵盤按 Enter 開深蹲；焦點在「結束」：' + pg.evaluate("document.activeElement.id"))
    pg.keyboard.press('Enter'); pg.wait_for_selector('#stage', state='hidden', timeout=10000); pg.wait_for_timeout(500)
    a = pg.evaluate("(() => { const e = document.activeElement; return [e.id, e.textContent.trim()]; })()")
    check(a[0] == 'startBtn' and a[1].startswith('深蹲'), f'結束後焦點回到首頁的「深蹲（上次）」：{a}')
    # 開關用空白鍵切換
    pg.focus('#voiceToggle'); pg.keyboard.press('Space')
    check(not pg.is_checked('#voiceToggle') and pg.evaluate("document.getElementById('voiceToggle').getAttribute('role')") == 'switch', '語音提醒開關：空白鍵切換、螢幕閱讀器會唸「開關」')
    check(not ctx.errs, '沒有程式錯誤 ' + str(ctx.errs[:2]))
    ctx.close()

    # 3. 整條流程
    ctx = context(b); pg = page(ctx)
    pg.click('#workoutGrid button[data-workout="pushup"]'); pg.wait_for_selector('#stage:not([hidden])'); pg.wait_for_timeout(13000)
    n1 = int(pg.text_content('#hudReps')); pg.click('#stopBtn'); pg.wait_for_timeout(800)
    lines = pg.evaluate("[...document.querySelectorAll('#summaryLines li')].map(li => li.textContent)")
    check(lines and lines[0].startswith('伏地挺身 ' + str(n1)) and pg.is_visible('#cloudAsk'), f'第一組 {n1} 下：總結「{lines[:1]}」、問雲端同步')
    pg.click('#cloudAskYes')
    pg.wait_for_function("document.getElementById('cloudStatus').textContent.includes('已同步：這台裝置的 1 筆')", timeout=30000)
    check(cloud_count() == 1, '打開雲端同步：雲端 1 筆')
    pg.click('#startBtn'); pg.wait_for_selector('#stage:not([hidden])'); pg.wait_for_timeout(13000)
    check(pg.text_content('#hudRepsName') == '伏地挺身', '首頁「伏地挺身（上次）」再做一組')
    pg.click('#stopBtn'); pg.wait_for_timeout(800)
    lines = pg.evaluate("[...document.querySelectorAll('#summaryLines li')].map(li => li.textContent)")
    pg.wait_for_function("document.getElementById('cloudStatus').textContent.includes('已同步：這台裝置的 2 筆')", timeout=30000)
    check(any('上次' in l for l in lines) and pg.is_hidden('#cloudAsk') and cloud_count() == 2 and '2 次' in pg.inner_text('#historyBox summary'),
          f'第二組：和上一次比較、不再問、雲端 2 筆、運動紀錄 2 次：{[l for l in lines if "上次" in l][:1]}')
    pg.click('.switch-more a'); pg.wait_for_load_state(); pg.wait_for_timeout(800)
    check(pg.url.endswith('help.html#cloudFaq') and pg.evaluate("document.getElementById('cloudFaq').open"), '「雲端同步是什麼？」→ 使用說明那一題直接打開')
    check(not ctx.errs, '沒有程式錯誤 ' + str(ctx.errs[:2]))
    ctx.close()
    b.close()
print('ALL PASS' if ok else 'SOME FAIL')
