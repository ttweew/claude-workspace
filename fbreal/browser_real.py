# 真的 Firebase 專案：Chromium 開本機的網站（js/cloud/config.js 已經貼上設定），經過環境的代理連到真的 Firebase
#  0. 打開前：雲端那一段出現、預設關閉、不連 Firebase
#  1. 打開 → 運動 → 關鏡頭：「已同步 1 筆」；用網頁自己的匿名帳號讀雲端：數字和這台裝置一樣、只有白名單欄位
#  2. 重新整理：同一個匿名帳號、自動同步、不會變兩筆
#  3. 刪除雲端的紀錄：雲端清空、同步關閉、這台裝置的紀錄還在
#  最後：刪掉這個測試用的匿名帳號（雲端不留測試資料）
# 用法：cd fbreal && python3 browser_real.py /home/user/claude-workspace [網址，預設本機]
import sys, os, re, json, urllib.request
sys.path.insert(0, '..')
from audit_common import *
from playwright.sync_api import sync_playwright
ROOT = sys.argv[1]
S = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FB = S + '/fb/node_modules/firebase'
LOOP = S + '/audit2'
SDK = 'https://www.gstatic.com/firebasejs/12.19.0'
src = open(ROOT + '/js/cloud/config.js', encoding='utf8').read()
CFG = {k: v for k, v in re.findall(r"(\w+):\s*'([^']*)'", src.split('FIREBASE_CONFIG = ')[1].split(';')[0])}
assert CFG.get('apiKey') and CFG.get('projectId'), 'js/cloud/config.js 還沒貼設定'
DOCS = f"https://firestore.googleapis.com/v1/projects/{CFG['projectId']}/databases/(default)/documents"
base = sys.argv[2] if len(sys.argv) > 2 else serve(8862, ROOT)
PROXY = os.environ['HTTPS_PROXY']
ok = True
def check(cond, msg):
    global ok
    print(('PASS ' if cond else 'FAIL ') + msg); ok = ok and cond

def http(method, url, body=None, token=None):
    req = urllib.request.Request(url, method=method, data=None if body is None else json.dumps(body).encode(),
                                 headers={'Content-Type': 'application/json', 'Referer': 'https://ttweew.github.io/claude-workspace/'})
    if token: req.add_header('Authorization', 'Bearer ' + token)
    try:
        with urllib.request.urlopen(req, timeout=30) as r: return json.loads(r.read().decode() or '{}')
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
def cloud_docs(u):
    res = http('GET', f"{DOCS}/users/{u['uid']}/sessions", token=u['token'])
    assert 'error' not in res, res
    return [(d['name'].split('/documents/')[1], {k: val(v) for k, v in d['fields'].items()}) for d in res.get('documents', [])]
# 網頁的 Firebase 存在 IndexedDB 的匿名帳號（uid 和登入憑證）
AUTH_USER = """() => new Promise((ok, bad) => {
    const r = indexedDB.open('firebaseLocalStorageDb');
    r.onerror = () => bad(r.error);
    r.onsuccess = () => {
        const db = r.result;
        if (!db.objectStoreNames.contains('firebaseLocalStorage')) return ok(null);
        const q = db.transaction('firebaseLocalStorage').objectStore('firebaseLocalStorage').getAll();
        q.onsuccess = () => {
            const u = q.result.find(x => String(x.fbase_key).startsWith('firebase:authUser:'));
            ok(u ? { uid: u.value.uid, token: u.value.stsTokenManager.accessToken, anonymous: u.value.isAnonymous } : null);
        };
        q.onerror = () => bad(q.error);
    };
})"""

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
# Firebase 的程式：這個環境連不到 gstatic.com，改給同一版（12.19.0）npm 套件裡的檔案；連 Firebase 的網路是真的
def sdk(route):
    name = route.request.url[len(SDK) + 1:].split('?')[0]
    route.fulfill(path=f'{FB}/{name}', content_type='text/javascript', headers={'Access-Control-Allow-Origin': '*'})
SPY = """Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: { speaking: false, pending: false, getVoices: () => [], addEventListener() {}, cancel() {}, speak() {} } });"""
FIREBASE_HOSTS = ('gstatic.com/firebasejs', 'firestore.googleapis.com', 'identitytoolkit.googleapis.com', 'securetoken.googleapis.com')

status = lambda pg: pg.inner_text('#cloudStatus') if pg.is_visible('#cloudStatus') else ''
def wait_status(pg, text, timeout=60000):
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

print('專案：' + CFG['projectId'] + '　網站：' + base)
user = None
with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/opt/pw-browsers/chromium", proxy={'server': PROXY, 'bypass': '127.0.0.1,localhost'})
    ctx = b.new_context(viewport={"width": 1280, "height": 800})
    errs = []; urls = []
    ctx.route(CDN + "/**", fake_cdn('pushup_err'))
    ctx.route(MODEL, lambda r: r.fulfill(path=MP + "/pose_landmarker_lite.task", headers={"Access-Control-Allow-Origin": "*"}))
    ctx.route("**/__test/pose.jpg", lambda r: r.fulfill(path=MP + "/pose.jpg", content_type="image/jpeg"))
    ctx.route(SDK + '/**', sdk)
    ctx.add_init_script(cam_script(640, 480)); ctx.add_init_script(SPY)
    pg = ctx.new_page()
    pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.on("request", lambda r: urls.append(r.url))
    pg.on("dialog", lambda d: d.accept())
    pg.goto(base + 'index.html?workout=pushup'); pg.wait_for_function(READY, timeout=60000)
    try:
        # 0. 打開前
        pg.click('#advanced summary')
        check(pg.is_visible('#cloudBox') and not pg.is_checked('#cloudToggle'), '雲端那一段出現，預設關閉')
        check(not [u for u in urls if any(h in u for h in FIREBASE_HOSTS)], '還沒打開前不連 Firebase')
        # 1. 打開 → 運動
        pg.click('#cloudToggle')
        check(wait_status(pg, '已開啟'), '打開：' + status(pg))
        user = pg.evaluate(AUTH_USER)
        check(user and user['anonymous'], f"建立匿名帳號 {user and user['uid'][:6]}…")
        n = workout(pg)
        check(wait_status(pg, '已同步：這台裝置的 1 筆'), f'運動 {n} 下、關鏡頭後自動上傳：' + status(pg))
        docs = cloud_docs(user); local = history(pg)[-1]
        check(len(docs) == 1, f'雲端 1 筆（{len(docs)}）')
        if docs:
            name, d = docs[0]
            same = all(d[k] == local[k] for k in ['workout', 'date', 'count', 'clean', 'good', 'close', 'shallow', 'best', 'average', 'tempo', 'errors'])
            check(same and d['v'] == 1 and name.endswith(f"sessions/pushup-{local['date']}") and 'savedAt' in d,
                  f"雲端的數字和這台裝置一樣：{ {k: d[k] for k in ['count', 'good', 'best', 'average', 'tempo', 'errors']} }")
            check(set(d) <= {'v', 'workout', 'date', 'minutes', 'count', 'clean', 'errors', 'savedAt', 'good', 'close', 'shallow', 'best', 'average', 'tempo', 'similarity'},
                  '只有白名單的欄位：' + ','.join(sorted(d)))
        # 2. 重新整理
        pg.reload(); pg.wait_for_function(READY, timeout=60000); pg.click('#advanced summary')
        check(pg.is_checked('#cloudToggle') and wait_status(pg, '已同步：這台裝置的 1 筆'), '重新整理：記得打開、自動同步：' + status(pg))
        u2 = pg.evaluate(AUTH_USER)
        check(u2 and u2['uid'] == user['uid'] and len(cloud_docs(u2)) == 1, '同一個匿名帳號、不會變兩筆')
        user = u2 or user
        # 3. 刪除雲端的紀錄
        pg.click('#cloudDelete')
        check(wait_status(pg, '已刪除雲端的 1 筆紀錄'), '刪除：' + status(pg))
        check(not cloud_docs(user) and not pg.is_checked('#cloudToggle') and len(history(pg)) == 1,
              f'雲端清空、同步關閉、這台裝置還有 {len(history(pg))} 筆')
        check(not errs, '沒有程式錯誤 ' + str(errs[:2]))
    finally:
        # 測試用的匿名帳號：先把雲端上它的紀錄清掉，再刪帳號
        if user:
            for name, _ in cloud_docs(user): http('DELETE', f'{DOCS}/{name.split("/documents/")[-1]}', token=user['token'])
            r = http('POST', f"https://identitytoolkit.googleapis.com/v1/accounts:delete?key={CFG['apiKey']}", {'idToken': user['token']})
            check('error' not in r, '刪掉測試用的匿名帳號 ' + ('' if 'error' not in r else str(r)))
        ctx.close(); b.close()
print('ALL PASS' if ok else 'SOME FAIL')
