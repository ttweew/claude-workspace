# 10/19 首頁改版的瀏覽器測試（假鏡頭＋假 AI；雲端同步用 Firebase 本機模擬器，?cloud=emulator，不碰真的專案）
#  1. 第一次來：四個大按鈕、自由模式是最下面的小字（#startBtn）、進階設定的標題
#  2. 四個按鈕各開對動作；按完回首頁，#startBtn 換到那個動作的位置、標「上次」，出現「只看骨架」小字
#  3. 「只看骨架」開自由模式；首頁卡片「開始伏地挺身」照樣能用；網址 ?workout= 和上次記住的動作
#  4. 運動完問雲端同步：不用了 → 不再問；打開 → 開關打開、已同步；自己先打開 → 不問；自由模式沒有總結 → 不問
#  5. 語音提醒開關在外面，關掉會記住
#  6. 使用說明：實測任務卡打勾、重新整理還在、全部取消；勾選被改壞不會出錯；#cloudFaq 直接打開那一題
#  7. 手機 320、390、844×390：沒有左右捲動，按鈕都在畫面內
import sys, os, json, urllib.request
sys.path.insert(0, '..')
from audit_common import *
from playwright.sync_api import sync_playwright
ROOT = '/home/user/claude-workspace'
S = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FB = S + '/fb/node_modules/firebase'
LOOP = S + '/audit2'
SDK = 'https://www.gstatic.com/firebasejs/12.19.0'
OUT = os.path.dirname(os.path.abspath(__file__))
base = serve(8872, ROOT)
ok = True
def check(cond, msg):
    global ok
    print(('PASS ' if cond else 'FAIL ') + msg); ok = ok and cond

def emu(method, path, body=None):
    req = urllib.request.Request('http://127.0.0.1:8080' + path, method=method, data=None if body is None else json.dumps(body).encode(),
                                 headers={'Content-Type': 'application/json', 'Authorization': 'Bearer owner'})
    with urllib.request.urlopen(req, timeout=20) as r: return json.loads(r.read().decode() or '{}')
def reset():
    emu('DELETE', '/emulator/v1/projects/demo-sport/databases/(default)/documents')
    emu('PUT', '/emulator/v1/projects/demo-sport:securityRules', {'rules': {'files': [{'name': 'firestore.rules', 'content': open(ROOT + '/firestore.rules', encoding='utf8').read()}]}})

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

def context(b, vw=1280, vh=800, mobile=False, init=None):
    ctx = b.new_context(viewport={"width": vw, "height": vh}, is_mobile=mobile, has_touch=mobile)
    ctx.errs = []
    ctx.route(CDN + "/**", fake_cdn('pushup_err'))
    ctx.route(MODEL, lambda r: r.fulfill(path=MP + "/pose_landmarker_lite.task", headers={"Access-Control-Allow-Origin": "*"}))
    ctx.route("**/__test/pose.jpg", lambda r: r.fulfill(path=MP + "/pose.jpg", content_type="image/jpeg"))
    ctx.route(SDK + '/**', sdk)
    ctx.add_init_script(cam_script(640, 480)); ctx.add_init_script(SPY)
    if init: ctx.add_init_script(init)
    return ctx
def page(ctx, q='?cloud=emulator'):
    pg = ctx.new_page()
    pg.on("pageerror", lambda e: ctx.errs.append(str(e)))
    pg.on("dialog", lambda d: d.accept())
    pg.goto(base + 'index.html' + q); pg.wait_for_function(READY, timeout=60000)
    return pg
def home_state(pg):
    return pg.evaluate("""() => {
        const s = document.getElementById('startBtn');
        return { place: s.parentElement.id, cls: s.className, text: s.textContent.trim(),
                 grid: [...document.querySelectorAll('#workoutGrid > button')].filter(b => !b.hidden).map(b => b.id === 'startBtn' ? '*' + b.textContent.trim() : b.dataset.workout),
                 freeBtn: !document.getElementById('freeBtn').hidden };
    }""")
def open_and_close(pg, click, secs=2):
    pg.click(click); pg.wait_for_selector('#stage:not([hidden])', timeout=20000); pg.wait_for_timeout(secs * 1000)
    name = pg.text_content('#hudRepsName') if pg.is_visible('#hudRepsBox') else '（自由）'
    pg.click('#stopBtn'); pg.wait_for_selector('#stage', state='hidden', timeout=10000); pg.wait_for_timeout(500)
    return name
def workout(pg, click, secs=13):
    pg.click(click); pg.wait_for_selector('#stage:not([hidden])', timeout=20000); pg.wait_for_timeout(secs * 1000)
    n = int(pg.text_content('#hudReps'))
    pg.click('#stopBtn'); pg.wait_for_timeout(800)
    return n
status = lambda pg: pg.inner_text('#cloudStatus')
def wait_status(pg, text, timeout=30000):
    try:
        pg.wait_for_function("t => document.getElementById('cloudStatus').textContent.includes(t)", arg=text, timeout=timeout); return True
    except Exception:
        return False

with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/opt/pw-browsers/chromium")
    reset()

    # 1. 第一次來
    ctx = context(b); pg = page(ctx)
    st = home_state(pg)
    check(st['place'] == 'freeLine' and st['cls'] == 'free-start' and '只看骨架' in st['text'] and st['grid'] == ['squat', 'pushup', 'plank', 'lunge'] and not st['freeBtn'],
          f'第一次來：四個大按鈕＋最下面「只看骨架」：{st}')
    check(pg.inner_text('#advancedTitle') == '進階設定（畫面流暢度、AI 模型，一般不用改）', '進階設定的標題：' + pg.inner_text('#advancedTitle'))
    check(pg.is_visible('#voiceToggle') and pg.is_visible('#cloudToggle') and not pg.evaluate("document.getElementById('advanced').open"),
          '語音提醒、雲端同步的開關不用點開進階設定就看得到')
    # 第一個畫面就看得到四個大按鈕（筆電 1280×800）
    r = pg.evaluate("[...document.querySelectorAll('#workoutGrid > button')].map(b => Math.round(b.getBoundingClientRect().bottom))")
    check(max(r) <= 800, f'筆電第一個畫面就看得到四個按鈕（最下面 {max(r)}px）')

    # 2. 四個按鈕各開對動作
    names = {}
    for wid, label in [('squat', '深蹲'), ('pushup', '伏地挺身'), ('plank', '棒式'), ('lunge', '弓箭步')]:
        sel = f'#workoutGrid > button[data-workout="{wid}"]:not([hidden])'
        if not pg.is_visible(sel): sel = '#startBtn'   # 上一輪選的就是它：在 #startBtn 的位置
        names[wid] = open_and_close(pg, sel)
        st = home_state(pg)
        check(names[wid] == label and st['place'] == 'workoutGrid' and st['cls'] == 'workout-btn current' and st['text'].startswith(label) and st['text'].endswith('上次') and st['freeBtn'],
              f'按「{label}」：開的是 {names[wid]}；回首頁 #startBtn 在{label}的位置、標上次，出現「只看骨架」：{st}')
    check(home_state(pg)['grid'] == ['squat', 'pushup', 'plank', '*弓箭步計次 · 看膝蓋上次'], '順序不變，上次的動作在原本的位置：' + str(home_state(pg)['grid']))

    # 3. 只看骨架、首頁卡片、網址、記住
    name = open_and_close(pg, '#freeBtn')
    st = home_state(pg)
    check(name == '（自由）' and st['place'] == 'freeLine' and not st['freeBtn'], f'「只看骨架」開自由模式（不計次）；回首頁又是第一次來的樣子：{st}')
    name = open_and_close(pg, '.exercises [data-exercise="pushup"] .start-workout')
    check(name == '伏地挺身' and home_state(pg)['text'].startswith('伏地挺身'), '首頁卡片「開始伏地挺身」照樣能用：' + name)
    pg.reload(); pg.wait_for_function(READY, timeout=60000)
    check(home_state(pg)['text'].startswith('伏地挺身'), '重新整理：記得上次的伏地挺身')
    check(not ctx.errs, '沒有程式錯誤 ' + str(ctx.errs[:2]))
    ctx.close()
    ctx = context(b); pg = page(ctx, '?workout=lunge&cloud=emulator')
    check(home_state(pg)['text'].startswith('弓箭步'), '網址 ?workout=lunge：#startBtn 是弓箭步')
    ctx.close()

    # 4. 運動完問雲端同步
    ctx = context(b); pg = page(ctx)
    n = workout(pg, '#workoutGrid > button[data-workout="pushup"]')
    check(pg.is_visible('#summary') and pg.is_visible('#cloudAsk') and not pg.is_checked('#cloudToggle'), f'第一次運動完（{n} 下）：總結下面問要不要打開雲端同步')
    pg.click('#cloudAskNo')
    check(pg.is_hidden('#cloudAsk') and pg.evaluate("localStorage.getItem('cloudAsked')") == '1' and not pg.is_checked('#cloudToggle'), '按「不用了」：收起來、記住、雲端還是關的')
    workout(pg, '#startBtn', 8)
    check(pg.is_hidden('#cloudAsk'), '之後運動完不再問')
    pg.reload(); pg.wait_for_function(READY, timeout=60000)
    workout(pg, '#startBtn', 8)
    check(pg.is_hidden('#cloudAsk'), '重新整理之後也不再問')
    check(not ctx.errs, '沒有程式錯誤 ' + str(ctx.errs[:2]))
    ctx.close()

    reset()
    ctx = context(b); pg = page(ctx)
    workout(pg, '#workoutGrid > button[data-workout="pushup"]')
    pg.click('#cloudAskYes')
    check(pg.is_checked('#cloudToggle') and pg.is_hidden('#cloudAsk') and wait_status(pg, '已同步：這台裝置的 1 筆'), '按「打開雲端同步」：開關打開、剛剛那筆上傳：' + status(pg))
    docs = emu('POST', '/v1/projects/demo-sport/databases/(default)/documents:runQuery', {'structuredQuery': {'from': [{'collectionId': 'sessions', 'allDescendants': True}]}})
    check(len([d for d in docs if 'document' in d]) == 1, '模擬器上有 1 筆')
    check(not ctx.errs, '沒有程式錯誤 ' + str(ctx.errs[:2]))
    ctx.close()

    reset()
    ctx = context(b); pg = page(ctx)
    pg.click('#cloudToggle'); wait_status(pg, '已開啟')
    workout(pg, '#workoutGrid > button[data-workout="pushup"]', 8)
    check(pg.is_hidden('#cloudAsk') and wait_status(pg, '已同步'), '自己先打開開關：運動完不問')
    ctx.close()

    ctx = context(b); pg = page(ctx)
    pg.click('#startBtn'); pg.wait_for_selector('#stage:not([hidden])'); pg.wait_for_timeout(5000); pg.click('#stopBtn'); pg.wait_for_timeout(800)
    check(pg.is_hidden('#summary') and pg.is_hidden('#cloudAsk'), '自由模式沒有總結：不問')
    # 5. 語音提醒
    pg.click('#voiceToggle')
    check(pg.evaluate("localStorage.getItem('voiceOn')") == '0' and not pg.is_checked('#voiceToggle'), '關掉語音提醒會記住')
    pg.reload(); pg.wait_for_function(READY, timeout=60000)
    check(not pg.is_checked('#voiceToggle'), '重新整理還是關的')
    ctx.close()

    # 6. 使用說明
    ctx = context(b); pg = ctx.new_page(); errs = []
    pg.on("pageerror", lambda e: errs.append(str(e))); pg.on("dialog", lambda d: d.accept())
    pg.goto(base + 'help.html'); pg.wait_for_timeout(800)
    total = pg.evaluate("document.querySelectorAll('#taskCard input[data-task]').length")
    check(pg.inner_text('#taskProgress') == f'還沒開始：共 {total} 項' and total >= 15, f'任務卡：{total} 項，' + pg.inner_text('#taskProgress'))
    pg.click('#taskCard input[data-task="prep-check"]'); pg.click('#taskCard input[data-task="reps-squat"]')
    check(pg.inner_text('#taskProgress') == f'做完 2／{total} 項', '打勾 2 項：' + pg.inner_text('#taskProgress'))
    pg.reload(); pg.wait_for_timeout(800)
    check(pg.is_checked('#taskCard input[data-task="reps-squat"]') and pg.inner_text('#taskProgress') == f'做完 2／{total} 項', '重新整理：勾選還在')
    pg.click('#taskReset')
    check(pg.inner_text('#taskProgress') == f'還沒開始：共 {total} 項' and not pg.is_checked('#taskCard input[data-task="reps-squat"]'), '全部取消勾選')
    pg.evaluate("localStorage.setItem('testdayTasks', '{壞掉')"); pg.reload(); pg.wait_for_timeout(800)
    pg.evaluate("localStorage.setItem('testdayTasks', JSON.stringify(['angle', 'constructor', 5]))"); pg.reload(); pg.wait_for_timeout(800)
    check(pg.inner_text('#taskProgress') == f'做完 1／{total} 項' and not errs, '勾選被改壞：只留認得的，沒有錯誤 ' + str(errs[:1]))
    pg.goto(base + 'help.html#cloudFaq'); pg.wait_for_timeout(800)
    check(pg.evaluate("document.getElementById('cloudFaq').open"), 'help.html#cloudFaq 直接打開那一題')
    pg.goto(base + 'help.html#%E0%A4%A'); pg.wait_for_timeout(500)
    check(not errs, '網址被改壞（#%E0%A4%A）也不會出錯 ' + str(errs[:1]))
    ctx.close()

    # 7. 手機版面
    for vw, vh in [(320, 640), (390, 844), (844, 390)]:
        for state in ['free', 'squat']:
            init = None if state == 'free' else "try { localStorage.setItem('workout', 'squat'); } catch (e) {}"
            ctx = context(b, vw, vh, mobile=True, init=init); pg = page(ctx)
            r = pg.evaluate("""() => [...document.querySelectorAll('#workoutGrid > button, #freeLine > button, .switch-pick, #advancedTitle')].filter(e => e.offsetParent)
                .map(e => { const b = e.getBoundingClientRect(); return [Math.round(b.left), Math.round(b.right)]; }).concat([[document.documentElement.scrollWidth, innerWidth]])""")
            inside = all(0 <= a and b2 <= vw for a, b2 in r[:-1]) and r[-1][0] == r[-1][1]
            # 名稱不會被擠成兩行（字太大或按鈕太窄）
            lines = pg.evaluate("[...document.querySelectorAll('#workoutGrid .wb-name, #workoutGrid .wb-sub')].filter(e => e.offsetParent).map(e => Math.round(e.getBoundingClientRect().height / parseFloat(getComputedStyle(e).lineHeight)))")
            top = pg.evaluate("Math.round(document.getElementById('pickTitle').getBoundingClientRect().top)")
            print(f'  （{vw}x{vh}：「今天要做什麼運動？」在第 {top}px）')
            check(inside and max(lines) == 1, f'{vw}x{vh} {state}：都在畫面內、沒有左右捲動、名稱和小字都一行 {r[-1]} {lines}')
            pg.locator('.start-card').screenshot(path=f'{OUT}/m_{vw}x{vh}_{state}.png')
            ctx.close()
        ctx = context(b, vw, vh, mobile=True); pg = ctx.new_page(); pg.goto(base + 'help.html'); pg.wait_for_timeout(600)
        w = pg.evaluate("[document.documentElement.scrollWidth, innerWidth]")
        check(w[0] == w[1], f'{vw}x{vh} 使用說明沒有左右捲動 {w}')
        cols = pg.evaluate("[...document.querySelectorAll('#taskCard label')].map(l => l.children.length)")
        check(set(cols) == {2}, f'{vw} 任務卡每一項是「勾選框＋一段字」{set(cols)}')
        pg.locator('#testday').screenshot(path=f'{OUT}/task_{vw}.png')
        ctx.close()
    b.close()
print('ALL PASS' if ok else 'SOME FAIL')
