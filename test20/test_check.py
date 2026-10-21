# 10/20 提案：實測模式（js/data/test-mode.js、js/ui/test-bar.js）＋使用說明的主持人卡、受測者卡（假鏡頭＋一直重複的假 AI）
#  1. 首頁進階設定：預設關；打開、代號整理（b → B）、標題寫出來、重新整理還在；存的值被改壞時照常
#  2. 深蹲：鏡頭畫面上方三組按鈕 → 按「故意上身前傾」→ 倒數 → 錄製中（時間在跑）→「這組做完」→ 自動下載
#     檔名 test_B_squat_lean_…、檔案裡 meta.test、網站算幾下和畫面上的次數一樣、這組打勾
#  3. 倒數中按取消：不下載、不打勾、回到選組；鍵盤操作焦點不會掉
#  4. 錄製中直接按「結束」關鏡頭：照樣下載
#  5. 數據面板的「下載 JSON」也用實測的檔名；數據面板自己錄的（不是實測的一組）不自動下載，這時按組會說明
#  6. 棒式：秒數的組、不寫「網站算幾下」；自由模式、實測模式關掉時沒有控制列
#  7. 版面：320／390／844 橫拿／1280，控制列在畫面內、按鈕夠大、不蓋到工具列和大字儀表板；大字在狀態列下面
#  8. 重播分析讀實測的檔案：摘要寫出是哪一組
#  9. 使用說明：受測者卡每一組的字和鏡頭畫面的按鈕一樣；主持人卡打勾照常
# 10. axe-core：首頁（進階設定打開）、鏡頭畫面（控制列在選組、錄製中）、使用說明 0 個問題
# 用法：python3 test_check.py [網站資料夾]
import sys, os, re, json, time
sys.path.insert(0, '..')
from audit_common import *
from playwright.sync_api import sync_playwright
ROOT = sys.argv[1] if len(sys.argv) > 1 else '/home/user/claude-workspace'
S = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LOOP = S + '/audit2'
OUT = os.path.dirname(os.path.abspath(__file__))
AXE = S + '/a11y/node_modules/axe-core/axe.min.js'
base = serve(8877, ROOT)
ok = True
def check(cond, msg):
    global ok
    print(('PASS ' if cond else 'FAIL ') + msg); ok = ok and cond
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
QUIET = """(() => {
  Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: { speaking: false, pending: false, getVoices: () => [], addEventListener() {}, cancel() {}, speak() {} } });
  window.SpeechSynthesisUtterance = function (t) { this.text = t; };
})();"""
def axe(pg, label):
    pg.add_script_tag(path=AXE)
    res = pg.evaluate("""async () => { const r = await axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] } });
        return r.violations.map(v => ({ id: v.id, impact: v.impact, n: v.nodes.length, help: v.help, targets: v.nodes.slice(0, 4).map(n => n.target.join(' ')) })); }""")
    for v in res: print(f"    - {v['id']}（{v['impact']}，{v['n']} 處）{v['help']}：{v['targets']}")
    check(not res, f'axe {label}：{len(res)} 種問題')
BAR = """() => { const q = s => document.querySelector(s); const vis = el => el && !el.hidden && el.getClientRects().length > 0;
  return { shown: vis(q('#testBar')), title: q('#testTitle').textContent, state: q('#testState').textContent, clock: q('#testClock').textContent,
    picks: [...document.querySelectorAll('#testPicks button')].filter(vis).map(b => b.textContent), done: [...document.querySelectorAll('#testPicks button.done')].map(b => b.dataset.condition),
    action: vis(q('#testAction')) ? q('#testAction').textContent : null, file: vis(q('#testFile')) ? q('#testFile').textContent : null }; }"""
# 10/20 晚上起每一組預設先存進「錄製檔」；這裡打開「每組做完也馬上下載」測下載（只存不下載在 lib20/check.py）
ON = "localStorage.setItem('testMode', JSON.stringify({ on: true, subject: 'B', autoDownload: true }));"

with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/opt/pw-browsers/chromium")
    def context(kind, init=None, vw=1280, vh=800, mobile=False):
        ctx = b.new_context(viewport={"width": vw, "height": vh}, accept_downloads=True, is_mobile=mobile, has_touch=mobile)
        ctx.route(CDN + "/**", fake_cdn(kind))
        ctx.route(MODEL, lambda r: r.fulfill(path=MP + "/pose_landmarker_lite.task", headers={"Access-Control-Allow-Origin": "*"}))
        ctx.route("**/__test/pose.jpg", lambda r: r.fulfill(path=MP + "/pose.jpg", content_type="image/jpeg"))
        ctx.add_init_script(cam_script(640, 480)); ctx.add_init_script(QUIET)
        if init: ctx.add_init_script(init)
        return ctx
    def page(ctx, q='?workout=squat'):
        pg = ctx.new_page(); pg.errs = []
        pg.on("pageerror", lambda e: pg.errs.append(str(e)))
        pg.goto(base + "index.html" + q); pg.wait_for_function(READY, timeout=60000)
        return pg
    def reps(pg):
        t = pg.text_content('#hudReps')
        return int(t) if t.isdigit() else t

    # ---------- 1. 首頁進階設定 ----------
    ctx = context('squat_mix')
    pg = page(ctx)
    check(pg.evaluate("document.getElementById('testToggle').checked") is False and pg.input_value('#testSubject') == 'A' and not pg.is_checked('#testAutoDownload'),
          '預設：實測模式關、代號 A、每組做完不馬上下載（先存進錄製檔）')
    pg.click('#advanced > summary')
    pg.check('#testToggle'); pg.fill('#testSubject', ' b '); pg.press('#testSubject', 'Enter'); pg.wait_for_timeout(200)
    title = pg.text_content('#testOnNote')
    check(pg.input_value('#testSubject') == 'B' and '實測模式開著 · 受測者 B' in title, f'打開、代號整理成 B，首頁最上面的提醒：{title}')
    pg.reload(); pg.wait_for_function(READY, timeout=60000)
    check(pg.evaluate("document.getElementById('testToggle').checked") and pg.input_value('#testSubject') == 'B' and '受測者 B' in pg.text_content('#testOnNote'), '重新整理還在')
    pg.click('#advanced > summary')
    pg.screenshot(path=f'{OUT}/home_1280.png', full_page=True)
    axe(pg, '首頁（進階設定打開、實測模式開著）')
    pg.set_viewport_size({"width": 320, "height": 640}); pg.wait_for_timeout(300)
    sw = pg.evaluate("document.documentElement.scrollWidth")
    r = pg.evaluate("(() => { const b = document.getElementById('testSubject').getBoundingClientRect(); return [b.left, b.right, b.height]; })()")
    check(sw == 320 and r[1] <= 320 and r[2] >= 40, f'首頁 320 寬：沒有左右捲動（{sw}）、代號欄在畫面內 {[round(x) for x in r]}')
    pg.screenshot(path=f'{OUT}/home_320.png', full_page=True)
    pg.set_viewport_size({"width": 1280, "height": 800})
    for bad, want in [('{壞掉', (False, 'A')), ('{"on":true,"subject":{"x":1}}', (True, 'A')), ('{"on":"true","subject":"王小明"}', (False, 'A'))]:
        pg.evaluate("v => localStorage.setItem('testMode', v)", bad); pg.reload(); pg.wait_for_function(READY, timeout=60000)
        got = (pg.evaluate("document.getElementById('testToggle').checked"), pg.input_value('#testSubject'))
        check(got == want and not pg.errs, f'存的值被改壞 {bad} → {got}')
    check(not pg.errs, '首頁沒有錯誤 ' + str(pg.errs[:2]))
    ctx.close()

    # ---------- 2～5. 深蹲：一組一組錄 ----------
    ctx = context('squat_mix', ON + "localStorage.setItem('recordCountdown', '3');")
    pg = page(ctx)
    pg.click('#startBtn'); pg.wait_for_function("document.getElementById('poseStatus').textContent.includes('全身')", timeout=20000)
    bar = pg.evaluate(BAR)
    check(bar['shown'] and bar['title'] == '實測 · 受測者 B · 深蹲' and bar['picks'] == ['做對 10 下', '故意上身前傾 5 下', '故意腳跟離地 5 下'] and bar['action'] is None,
          f"控制列：{bar['title']} {bar['picks']}")
    check(pg.evaluate("getComputedStyle(document.getElementById('advice')).display") == 'none', '實測時不跳速度建議')
    axe(pg, '鏡頭畫面（實測控制列：選組）')
    # 2. 故意上身前傾：倒數 → 錄製 → 這組做完 → 下載
    pg.click('#testPicks button[data-condition="lean"]')
    pg.wait_for_timeout(300)
    bar = pg.evaluate(BAR)
    check(bar['state'].startswith('倒數中：故意上身前傾 5 下') and bar['action'] == '✕ 取消' and bar['picks'] == [] and pg.is_visible('#countdown'), f"倒數中：{bar['state']} / {bar['action']}")
    pg.wait_for_function("document.getElementById('testState').textContent.startsWith('● 錄製中')", timeout=6000)
    start_reps = reps(pg)
    pg.wait_for_timeout(1500)
    bar = pg.evaluate(BAR)
    check(bar['action'] == '■ 這組做完' and re.match(r'0:0[1-2]$', bar['clock']) is not None and pg.evaluate("document.getElementById('dataBtn').textContent").endswith('●'),
          f"錄製中：{bar['state']} {bar['clock']}，數據按鈕 {pg.text_content('#dataBtn')}")
    axe(pg, '鏡頭畫面（實測控制列：錄製中）')
    pg.wait_for_timeout(12000)
    end_reps = reps(pg)
    with pg.expect_download(timeout=10000) as dl:
        pg.click('#testAction')
    after_reps = reps(pg)   # 按下去的同一刻剛好又做完一下也算對：網站算的在按之前和之後的次數之間
    d = dl.value
    name = d.suggested_filename
    data = json.load(open(d.path(), encoding='utf-8'))
    pg.wait_for_function("document.getElementById('testState').textContent.startsWith('✓')", timeout=5000)
    bar = pg.evaluate(BAR)
    got_n = re.search(r'網站算 (\d+) 下', bar['state'])
    got_n = int(got_n.group(1)) if got_n else None
    n = got_n if got_n is not None and end_reps - start_reps <= got_n <= after_reps - start_reps else None
    check(re.match(r'^test_B_squat_lean_\d{8}_\d{6}\.json$', name) is not None, '下載的檔名 ' + name)
    check(data['meta'].get('test') == {'subject': 'B', 'condition': 'lean', 'reps': 5} and data['meta']['workout'] == 'squat' and len(data['frames']) > 300,
          f"檔案裡：{data['meta'].get('test')}、{len(data['frames'])} 格")
    check(bar['state'] == f'✓ 已存好、已下載：故意上身前傾 5 下（網站算 {n} 下）' and n and n >= 2 and bar['file'] == name and bar['done'] == ['lean'] and '✓' in bar['picks'][1],
          f"做完：{bar['state']}（畫面上 {start_reps} → {end_reps}／{after_reps} 下）{bar['picks']}")
    check(pg.text_content('#recordBtn') == '● 錄下一段' and pg.text_content('#dataBtn').strip().endswith('數據'), '錄製按鈕回到「錄下一段」（上一組存進錄製檔了）、數據按鈕沒有紅點')
    # 5a. 數據面板的「下載 JSON」也用實測的檔名
    pg.click('#dataBtn')
    with pg.expect_download(timeout=10000) as dl2:
        pg.click('#jsonBtn')
    check(dl2.value.suggested_filename == name, '數據面板再下載一次：' + dl2.value.suggested_filename)
    pg.click('#dataBtn')
    # 3. 倒數中取消：不下載、不打勾；用鍵盤
    downloads = []
    pg.on('download', lambda x: downloads.append(x.suggested_filename))
    pg.focus('#testPicks button[data-condition="good"]'); pg.keyboard.press('Enter'); pg.wait_for_timeout(300)
    focus1 = pg.evaluate("document.activeElement.id")
    pg.keyboard.press('Enter'); pg.wait_for_timeout(300)
    bar = pg.evaluate(BAR)
    focus2 = pg.evaluate("document.activeElement.dataset.condition || document.activeElement.id")
    pg.wait_for_timeout(3500)
    check(focus1 == 'testAction' and bar['state'].startswith('已取消') and bar['done'] == ['lean'] and not pg.is_visible('#countdown') and not downloads
          and pg.text_content('#recordBtn') == '● 錄下一段', f"倒數中取消（鍵盤）：焦點 {focus1} → {focus2}，{bar['state']}，下載 {downloads}")
    check(focus2 in ('good', 'heel'), '取消後焦點回到還沒錄的組：' + str(focus2))
    # 5b. 數據面板自己錄（不是實測的一組）：按組會說明；停止不自動下載
    pg.click('#dataBtn'); pg.select_option('#countdownSelect', '0'); pg.click('#recordBtn'); pg.wait_for_timeout(800)
    pg.click('#dataBtn')
    pg.click('#testPicks button[data-condition="heel"]'); pg.wait_for_timeout(300)
    bar = pg.evaluate(BAR)
    check(bar['state'].startswith('正在錄製（不是實測的一組）') and bar['action'] is None, '數據面板自己在錄時按組：' + bar['state'])
    pg.click('#dataBtn'); pg.click('#recordBtn'); pg.wait_for_timeout(1500)
    check(not downloads and pg.is_visible('#jsonBtn'), '自己錄的停止後不自動下載 ' + str(downloads))
    with pg.expect_download(timeout=10000) as dl3:
        pg.click('#jsonBtn')
    check(re.match(r'^pose_\d{8}_\d{6}\.json$', dl3.value.suggested_filename) is not None, '自己錄的檔名照舊：' + dl3.value.suggested_filename)
    pg.click('#dataBtn')
    check(not pg.is_visible('#dataPanel'), '數據面板收起來了')
    # 4. 錄製中直接按「結束」：照樣下載（倒數已經改成不倒數）
    pg.click('#testPicks button[data-condition="heel"]')
    pg.wait_for_function("document.getElementById('testState').textContent.startsWith('● 錄製中')", timeout=3000)
    pg.wait_for_timeout(2000)
    with pg.expect_download(timeout=10000) as dl4:
        pg.click('#stopBtn')
    data4 = json.load(open(dl4.value.path(), encoding='utf-8'))
    check(re.match(r'^test_B_squat_heel_\d{8}_\d{6}\.json$', dl4.value.suggested_filename) is not None and data4['meta']['test']['condition'] == 'heel' and pg.is_visible('#summary'),
          '錄製中按「結束」：' + dl4.value.suggested_filename + '，回到首頁有總結')
    check(not pg.errs, '深蹲沒有錯誤 ' + str(pg.errs[:2]))
    saved = d.path()
    replay_file = OUT + '/sample_' + name
    import shutil; shutil.copy(saved, replay_file)
    ctx.close()

    # ---------- 6. 棒式、自由模式、關掉時 ----------
    ctx = context('plank', ON + "localStorage.setItem('recordCountdown', '0');")
    pg = page(ctx, '?workout=plank')
    pg.click('#startBtn'); pg.wait_for_timeout(2500)
    bar = pg.evaluate(BAR)
    check(bar['picks'] == ['做對 30 秒', '故意塌腰 10 秒', '故意屁股太高 10 秒'] and bar['title'].endswith('棒式'), '棒式的組：' + str(bar['picks']))
    pg.click('#testPicks button[data-condition="sag"]'); pg.wait_for_timeout(3000)
    with pg.expect_download(timeout=10000) as dl5:
        pg.click('#testAction')
    pg.wait_for_function("document.getElementById('testState').textContent.startsWith('✓')", timeout=5000)
    st = pg.text_content('#testState')
    m5 = json.load(open(dl5.value.path(), encoding='utf-8'))['meta']['test']
    check(st == '✓ 已存好、已下載：故意塌腰 10 秒' and m5 == {'subject': 'B', 'condition': 'sag', 'seconds': 10} and dl5.value.suggested_filename.startswith('test_B_plank_sag_'),
          f'棒式：{st}、{m5}、{dl5.value.suggested_filename}')
    check(not pg.errs, '棒式沒有錯誤 ' + str(pg.errs[:2]))
    ctx.close()
    ctx = context('squat_mix', ON)
    pg = page(ctx, '?workout=free')
    pg.click('#startBtn'); pg.wait_for_timeout(1500)
    check(not pg.evaluate(BAR)['shown'], '自由模式沒有實測的控制列')
    ctx.close()
    ctx = context('squat_mix')
    pg = page(ctx)
    pg.click('#startBtn'); pg.wait_for_timeout(1500)
    check(not pg.evaluate(BAR)['shown'] and pg.evaluate("document.getElementById('stage').style.getPropertyValue('--below-info')") != '', '實測模式關掉時沒有控制列')
    ctx.close()

    # ---------- 7. 版面 ----------
    LAYOUT = """() => { const r = s => { const e = document.querySelector(s); if (!e || e.hidden || !e.getClientRects().length) return null; const b = e.getBoundingClientRect(); return [b.left, b.top, b.right, b.bottom]; };
      const btns = [...document.querySelectorAll('#testPicks button, #testAction')].filter(b => !b.hidden && b.getClientRects().length).map(b => b.getBoundingClientRect().height);
      const hud = [...document.querySelectorAll('.hud-side')].map(e => { const b = e.getBoundingClientRect(); return [b.left, b.top, b.right, b.bottom]; });
      return { card: r('.test-card'), demo: r('#demoBtn'), toolbar: r('#toolbar'), banner: r('#banner'), formTip: r('#formTip'), info: r('#infobar'), hud, reps: r('#hudRepsBox'), btns, sw: document.documentElement.scrollWidth }; }"""
    overlap = lambda a, c: a and c and a[0] < c[2] - 1 and c[0] < a[2] - 1 and a[1] < c[3] - 1 and c[1] < a[3] - 1
    for vw, vh, mob in [(320, 640, True), (390, 844, True), (844, 390, True), (1280, 800, False)]:
        ctx = context('squat_mix', ON + "localStorage.setItem('recordCountdown', '0');", vw, vh, mob)
        pg = page(ctx)
        pg.click('#startBtn'); pg.wait_for_timeout(2500)
        L = pg.evaluate(LAYOUT)
        c = L['card']
        inside = c and c[0] >= 0 and c[2] <= vw + 0.5 and c[3] <= vh + 0.5
        check(inside and L['sw'] == vw and min(L['btns']) >= 44 and not overlap(c, L['toolbar']) and not overlap(c, L['demo']) and not any(overlap(c, h) for h in L['hud']) and not overlap(c, L['reps']),
              f'{vw}x{vh} 選組：控制列 {[round(x) for x in c] if c else c} 在畫面內、按鈕高 {min(L["btns"]):.0f}、不蓋工具列和大字儀表板')
        pg.screenshot(path=f'{OUT}/cam_{vw}x{vh}_pick.png')
        # 大字（入鏡提示）叫出來：要在狀態列下面（直拿時控制列在狀態列裡）
        # 網站在人站好時會自己把入鏡提示收起來：同一刻叫出來、量好、再收回去
        L = pg.evaluate("() => { const el = document.getElementById('banner'); const was = el.hidden; el.textContent = '請往後退'; el.hidden = false; const L = (" + LAYOUT + ")(); el.hidden = was; return L; }")
        check(L['banner'] and L['banner'][1] >= L['info'][3] - 0.5 and not overlap(L['banner'], L['card']), f'{vw}x{vh} 入鏡提示 {[round(x) for x in L["banner"]]} 不被控制列蓋住（狀態列下緣 {round(L["info"][3])}）')
        pg.click('#testPicks button[data-condition="good"]'); pg.wait_for_timeout(1200)
        L = pg.evaluate(LAYOUT)
        c = L['card']
        check(c and c[3] <= vh + 0.5 and min(L['btns']) >= 44 and not overlap(c, L['toolbar']) and not any(overlap(c, h) for h in L['hud']), f'{vw}x{vh} 錄製中：控制列 {[round(x) for x in c] if c else c}')
        pg.screenshot(path=f'{OUT}/cam_{vw}x{vh}_rec.png')
        with pg.expect_download(timeout=10000):
            pg.click('#testAction')
        check(not pg.errs, f'{vw}x{vh} 沒有錯誤 ' + str(pg.errs[:2]))
        ctx.close()

    # ---------- 8. 重播分析讀實測的檔案 ----------
    ctx = context('squat_mix')
    pg = ctx.new_page(); pg.errs = []
    pg.on("pageerror", lambda e: pg.errs.append(str(e)))
    pg.goto(base + 'replay.html')
    pg.set_input_files('#fileInput', replay_file)
    pg.wait_for_function("document.getElementById('summary') && document.getElementById('summary').textContent.includes('長度')", timeout=60000)
    txt = pg.inner_text('#summary')
    check('實測' in txt and '受測者 B · 深蹲 · 故意上身前傾 5 下' in txt, '重播分析的摘要：' + txt.split('\n')[0:2].__repr__())
    check(not pg.errs, '重播沒有錯誤 ' + str(pg.errs[:2]))
    ctx.close()

    # ---------- 9. 使用說明：受測者卡、主持人卡 ----------
    ctx = context('squat_mix')
    pg = ctx.new_page(); pg.errs = []
    pg.on("pageerror", lambda e: pg.errs.append(str(e)))
    pg.goto(base + 'help.html')
    card = pg.evaluate("[...document.querySelectorAll('#subjectCard .subject-list strong')].map(s => s.textContent)")
    sets = pg.evaluate("""async () => { const m = await import('./js/data/test-mode.js'); return ['squat', 'pushup', 'lunge', 'plank'].flatMap(id => m.conditionsFor(id).map(c => c.name + ' ' + c.amount + ' ' + c.unit)); }""")
    want = [x.replace(' ', '') for x in sets]
    got = [x.replace(' ', '') for x in card]
    check(got == want, f'受測者卡和鏡頭畫面的按鈕一樣（{len(got)} 組）' + ('' if got == want else f'\n      卡片 {got}\n      按鈕 {want}'))
    boxes = pg.evaluate("document.querySelectorAll('#taskCard input[data-task]').length")
    pg.check('#taskCard input[data-task="prep-test"]'); pg.reload()
    check(pg.is_checked('#taskCard input[data-task="prep-test"]') and pg.evaluate("document.querySelectorAll('#subjectCard input').length") == 0,
          f'主持人卡 {boxes} 項可以打勾、重新整理還在；受測者卡沒有勾選框')
    pg.set_viewport_size({"width": 320, "height": 640})
    sw = pg.evaluate("document.documentElement.scrollWidth")
    check(sw == 320, f'320 寬沒有左右捲動（{sw}）')
    pg.screenshot(path=f'{OUT}/help_320.png', full_page=True)
    pg.set_viewport_size({"width": 1280, "height": 800})
    axe(pg, '使用說明（主持人卡、受測者卡）')
    check(not pg.errs, '使用說明沒有錯誤 ' + str(pg.errs[:2]))
    ctx.close()
print('ALL PASS' if ok else 'SOME FAIL')
