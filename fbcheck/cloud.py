# Firebase 雲端同步（js/cloud/）：真的開網頁，接 Firebase 本機模擬器（firebase emulators:start，在專案資料夾執行）
#  0. 網站還沒接上 Firebase（沒有 ?cloud=emulator）：整段不出現、不連任何 Firebase 網址
#  1. 打開 → 運動 → 關鏡頭：雲端有這一筆，數字和這台裝置的紀錄一樣
#  2. 重新整理：同一個匿名帳號、自動同步、不會變兩筆
#  3. 沒有網路：先存在這台裝置；網路恢復自動補傳
#  4. Firebase 載不到：網站照常、說明連不上；之後網路好了重新整理就補傳
#  5. 安全規則還沒發布（全部拒絕）：說明原因、不會把這幾筆當成傳過；規則好了重新整理就補傳
#  6. 被改過的本機紀錄：不上傳格式不對的、多的欄位不跟著上傳
#  7. 刪除雲端的紀錄：雲端清空、同步關閉、這台裝置的紀錄還在；之後運動不會上傳
#  8. 手機版面：進階設定裡的雲端那一段在畫面內
import sys, os, re, json, time, urllib.request
sys.path.insert(0, '..')
from audit_common import *
from playwright.sync_api import sync_playwright
ROOT = sys.argv[1]
S = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FB = S + '/fb/node_modules/firebase'
LOOP = S + '/audit2'
SDK = 'https://www.gstatic.com/firebasejs/12.19.0'
base = serve(8861, ROOT)
EMU_FS = 'http://127.0.0.1:8080'
EMU_AUTH = 'http://127.0.0.1:9099'
PROJECT = 'demo-sport'
ok = True
def check(cond, msg):
    global ok
    print(('PASS ' if cond else 'FAIL ') + msg); ok = ok and cond

def http(method, url, body=None, owner=True):
    req = urllib.request.Request(url, method=method, data=None if body is None else json.dumps(body).encode())
    if owner: req.add_header('Authorization', 'Bearer owner')
    req.add_header('Content-Type', 'application/json')
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            t = r.read().decode() or '{}'
            return json.loads(t)
    except urllib.error.HTTPError as e:
        return {'error': e.code, 'body': e.read().decode()[:200]}
def val(v):
    k, x = next(iter(v.items()))
    if k == 'integerValue': return int(x)
    if k == 'doubleValue': return float(x)
    if k == 'nullValue': return None
    if k == 'mapValue': return {a: val(b) for a, b in x.get('fields', {}).items()}
    if k == 'arrayValue': return [val(y) for y in x.get('values', [])]
    return x
def cloud_docs():
    res = http('POST', f'{EMU_FS}/v1/projects/{PROJECT}/databases/(default)/documents:runQuery', {'structuredQuery': {'from': [{'collectionId': 'sessions', 'allDescendants': True}]}})
    return [(d['document']['name'].split('/documents/')[1], {k: val(v) for k, v in d['document']['fields'].items()}) for d in res if 'document' in d]
def accounts():
    res = http('POST', f'{EMU_AUTH}/identitytoolkit.googleapis.com/v1/projects/{PROJECT}/accounts:query', {})
    return [u['localId'] for u in res.get('userInfo', [])]
def reset():
    http('DELETE', f'{EMU_FS}/emulator/v1/projects/{PROJECT}/databases/(default)/documents')
    http('DELETE', f'{EMU_AUTH}/emulator/v1/projects/{PROJECT}/accounts')
RULES = open(ROOT + '/firestore.rules', encoding='utf8').read()
DENY = "rules_version = '2';\nservice cloud.firestore { match /databases/{database}/documents { match /{document=**} { allow read, write: if false; } } }\n"
def set_rules(content):
    r = http('PUT', f'{EMU_FS}/emulator/v1/projects/{PROJECT}:securityRules', {'rules': {'files': [{'name': 'firestore.rules', 'content': content}]}}, owner=False)
    assert 'error' not in r, r

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

def context(b, vw=1280, vh=800, block_sdk=False, mobile=False):
    ctx = b.new_context(viewport={"width": vw, "height": vh}, is_mobile=mobile, has_touch=mobile)
    ctx.errs = []; ctx.urls = []
    ctx.route(CDN + "/**", fake_cdn('pushup_err'))
    ctx.route(MODEL, lambda r: r.fulfill(path=MP + "/pose_landmarker_lite.task", headers={"Access-Control-Allow-Origin": "*"}))
    ctx.route("**/__test/pose.jpg", lambda r: r.fulfill(path=MP + "/pose.jpg", content_type="image/jpeg"))
    if block_sdk: ctx.route(SDK + '/**', lambda r: r.abort())
    else: ctx.route(SDK + '/**', sdk)
    ctx.add_init_script(cam_script(640, 480)); ctx.add_init_script(SPY)
    return ctx
def page(ctx, q='?workout=pushup&cloud=emulator'):
    pg = ctx.new_page()
    pg.on("pageerror", lambda e: ctx.errs.append(str(e)))
    pg.on("request", lambda r: ctx.urls.append(r.url))
    pg.on("dialog", lambda d: d.accept())
    pg.goto(base + 'index.html' + q); pg.wait_for_function(READY, timeout=60000)
    if pg.is_visible('#cloudBox') or q.find('cloud=emulator') >= 0:
        if not pg.evaluate("document.getElementById('advanced').open"): pg.click('#advanced summary')
    return pg
status = lambda pg: pg.inner_text('#cloudStatus') if pg.is_visible('#cloudStatus') else ''
def wait_status(pg, text, timeout=30000):
    try:
        pg.wait_for_function("t => document.getElementById('cloudStatus').textContent.includes(t)", arg=text, timeout=timeout); return True
    except Exception:
        return False
def workout(pg, secs=13):
    pg.click('#startBtn'); pg.wait_for_timeout(secs * 1000)
    n = int(pg.text_content('#hudReps'))
    pg.click('#stopBtn'); pg.wait_for_timeout(800)
    return n
history = lambda pg: pg.evaluate("JSON.parse(localStorage.getItem('workoutHistory') || '[]')")

with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/opt/pw-browsers/chromium")
    set_rules(RULES); reset()

    # 0. 網站還沒接上 Firebase
    ctx = context(b); pg = page(ctx, '?workout=pushup')
    pg.click('#advanced summary')
    n = workout(pg, 6)
    FIREBASE_HOSTS = ('gstatic.com/firebasejs', 'firestore.googleapis.com', 'identitytoolkit.googleapis.com', 'securetoken.googleapis.com', ':9099', ':8080')
    fb = [u for u in ctx.urls if any(h in u for h in FIREBASE_HOSTS)]
    print('  （其他外部請求：', sorted({u.split('/')[2] for u in ctx.urls if not u.startswith(base)}), '）')
    check(pg.is_hidden('#cloudBox') and not fb and not ctx.errs, f'沒有設定：雲端那一段不出現、沒有連 Firebase（{len(fb)} 個請求）')
    ctx.close()

    # 1. 打開 → 運動 → 關鏡頭
    ctx = context(b); pg = page(ctx)
    check(pg.is_visible('#cloudBox') and not pg.is_checked('#cloudToggle'), '模擬器：雲端那一段出現，預設關閉')
    check(not [u for u in ctx.urls if u.startswith(SDK)], '還沒打開前不下載 Firebase')
    pg.click('#cloudToggle')
    check(wait_status(pg, '已開啟'), '打開：' + status(pg))
    check('雲端同步' in pg.inner_text('#advancedTitle'), '進階設定的標題寫出雲端同步：' + pg.inner_text('#advancedTitle'))
    n = workout(pg)
    check(wait_status(pg, '已同步：這台裝置的 1 筆'), f'運動 {n} 下、關鏡頭後自動上傳：' + status(pg))
    docs = cloud_docs(); h = history(pg)
    check(len(docs) == 1 and len(accounts()) == 1, f'雲端 1 筆、1 個匿名帳號（{len(docs)} 筆、{len(accounts())} 個帳號）')
    if docs:
        name, d = docs[0]
        local = h[-1]
        same = all(d[k] == local[k] for k in ['workout', 'date', 'count', 'clean', 'good', 'close', 'shallow', 'best', 'average', 'tempo', 'errors'])
        check(same and d['v'] == 1 and name.endswith(f"sessions/pushup-{local['date']}") and 'savedAt' in d,
              f"雲端的數字和這台裝置一樣：{ {k: d[k] for k in ['count', 'good', 'best', 'average', 'tempo', 'errors']} }")
        check(set(d) <= {'v', 'workout', 'date', 'minutes', 'count', 'clean', 'errors', 'savedAt', 'good', 'close', 'shallow', 'best', 'average', 'tempo', 'similarity'},
              '只有白名單的欄位：' + ','.join(sorted(d)))
    check(pg.is_visible('#cloudDelete'), '上傳過之後出現「刪除雲端的紀錄」')

    # 2. 重新整理
    pg.reload(); pg.wait_for_function(READY, timeout=60000); pg.click('#advanced summary')
    check(pg.is_checked('#cloudToggle') and wait_status(pg, '已同步：這台裝置的 1 筆'), '重新整理：記得打開、自動同步：' + status(pg))
    check(len(cloud_docs()) == 1 and len(accounts()) == 1, '不會變兩筆、還是同一個匿名帳號')

    # 3. 沒有網路
    ctx.set_offline(True)
    n = workout(pg)
    check(wait_status(pg, '沒有網路'), f'沒有網路：運動 {n} 下 → ' + status(pg))
    check(len(cloud_docs()) == 1, '雲端還是 1 筆')
    ctx.set_offline(False)
    check(wait_status(pg, '已同步：這台裝置的 2 筆', 40000), '網路恢復：自動補傳 → ' + status(pg))
    check(len(cloud_docs()) == 2, f'雲端 2 筆（{len(cloud_docs())}）')
    check(not ctx.errs, '沒有程式錯誤 ' + str(ctx.errs[:2]))

    # 7. 刪除雲端的紀錄
    pg.click('#cloudDelete')
    check(wait_status(pg, '已刪除雲端的 2 筆紀錄'), '刪除：' + status(pg))
    check(not cloud_docs() and not pg.is_checked('#cloudToggle') and len(history(pg)) == 2 and pg.is_hidden('#cloudDelete'),
          f'雲端清空、同步關閉、這台裝置還有 {len(history(pg))} 筆、刪除按鈕收起來')
    workout(pg, 6); pg.wait_for_timeout(2000)
    check(not cloud_docs() and '雲端同步' not in pg.inner_text('#advancedTitle'), '關閉後運動：不會上傳')
    check(not ctx.errs, '沒有程式錯誤 ' + str(ctx.errs[:2]))
    ctx.close()

    # 4. Firebase 載不到（之前打開過）
    reset()
    ctx = context(b, block_sdk=True)
    ctx.add_init_script("try { localStorage.setItem('cloudSync', '1'); } catch (e) {}")
    pg = page(ctx)
    check(wait_status(pg, '雲端暫時連不上'), '載不到 Firebase：' + status(pg))
    n = workout(pg)
    lines = pg.evaluate("[...document.querySelectorAll('#summaryLines li')].map(li => li.textContent)")
    check(n >= 2 and lines and lines[0].startswith('伏地挺身 ' + str(n)) and not ctx.errs, f'網站照常：{n} 下、總結「{lines[:1]}」、沒有程式錯誤 {ctx.errs[:1]}')
    check(wait_status(pg, '雲端暫時連不上') and len(history(pg)) == 1, '紀錄先存在這台裝置：' + status(pg))
    ctx.unroute(SDK + '/**'); ctx.route(SDK + '/**', sdk)
    pg.reload(); pg.wait_for_function(READY, timeout=60000); pg.click('#advanced summary')
    check(wait_status(pg, '已同步：這台裝置的 1 筆') and len(cloud_docs()) == 1, 'Firebase 載得到了，重新整理就補傳：' + status(pg))
    ctx.close()

    # 5. 安全規則還沒發布
    reset(); set_rules(DENY)
    ctx = context(b); pg = page(ctx)
    pg.click('#cloudToggle'); pg.wait_for_timeout(500)
    workout(pg, 6)
    check(wait_status(pg, '安全規則還沒發布'), '規則全部拒絕：' + status(pg))
    check(not cloud_docs(), '雲端沒有資料')
    set_rules(RULES)
    pg.reload(); pg.wait_for_function(READY, timeout=60000); pg.click('#advanced summary')
    check(wait_status(pg, '已同步：這台裝置的 1 筆') and len(cloud_docs()) == 1, '規則發布後重新整理：之前被拒絕的補傳上去：' + status(pg))
    check(not ctx.errs, '沒有程式錯誤 ' + str(ctx.errs[:2]))
    ctx.close()

    # 6. 被改過的本機紀錄
    reset()
    ok_s = {"workout": "squat", "date": 1792300000000, "minutes": 2, "count": 3, "clean": 1, "errors": {"lean": 2},
            "good": 1, "close": 1, "shallow": 1, "best": 85, "average": 102, "tempo": 2.4, "similarity": 90, "hacked": "<img src=x onerror=alert(1)>"}
    bad_s = dict(ok_s, date=1792300500000, best=150)   # 最低比平均高：網站存得下，雲端不收
    ctx = context(b)
    ctx.add_init_script("try { localStorage.setItem('workoutHistory', %s); localStorage.setItem('cloudSync', '1'); } catch (e) {}" % json.dumps(json.dumps([ok_s, bad_s])))
    pg = page(ctx)
    check(wait_status(pg, '1 筆格式不對，不上傳'), '格式不對的不上傳：' + status(pg))
    docs = cloud_docs()
    check(len(docs) == 1 and 'hacked' not in docs[0][1] and docs[0][1]['best'] == 85, f'只上傳格式對的那筆，多的欄位沒有跟著上傳（{[sorted(d) for _, d in docs]}）')
    check(not ctx.errs, '沒有程式錯誤 ' + str(ctx.errs[:2]))
    ctx.close()

    # 8. 手機版面
    for vw, vh in [(320, 640), (390, 844), (844, 390)]:
        reset()
        ctx = context(b, vw, vh, mobile=True); pg = page(ctx)
        pg.click('#cloudToggle'); wait_status(pg, '已開啟')
        workout(pg, 6); wait_status(pg, '已同步')
        r = pg.evaluate("""() => ['cloudToggle', 'cloudStatus', 'cloudDelete'].map(id => { const e = document.getElementById(id).getBoundingClientRect(); return [Math.round(e.left), Math.round(e.right)]; }).concat([[document.documentElement.scrollWidth, innerWidth]])""")
        check(all(0 <= a and b2 <= vw for a, b2 in r[:3]) and r[3][0] == r[3][1], f'{vw}x{vh} 雲端那一段在畫面內 {r}')
        pg.locator('#advanced').screenshot(path=f'{os.path.dirname(os.path.abspath(__file__))}/cloud_{vw}x{vh}.png')
        ctx.close()
    b.close()
print('ALL PASS' if ok else 'SOME FAIL')
