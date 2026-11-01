# 11/1 主線：成長曲線讀雲端的紀錄，用「真的」Firebase 程式（fb/node_modules/firebase）＋本機模擬器＋專案的 firestore.rules
#  1. 打開雲端同步：這台裝置的 6 次傳上去（模擬器裡 6 筆）
#  2. 這台裝置只剩最近 2 次（像清除過、或超過 50 次）：重新整理、打開成長曲線 → 雲端的 4 次也畫進來，那一句和 node 算的一樣
#  3. 雲端多一筆被改過的（用模擬器的管理者權限直接寫，規則擋不到的情況）：不算
#  4. 另一個瀏覽器（另一個匿名帳號）：讀不到別人的（規則），只有自己的
#  5. 規則全部拒絕（像規則還沒發布）：寫「雲端暫時讀不到」，先畫這台裝置的；規則恢復後再打開就讀得到
# 用法：先在專案資料夾開模擬器（npx firebase-tools@15.34.1 emulators:start --only auth,firestore --project demo-sport），
#       python3 cloud_growth.py <網站資料夾>（先跑 node make_records.mjs <網站資料夾> > records.json）
import sys, os, json, urllib.request
sys.path.insert(0, '..')
from audit_common import *
from playwright.sync_api import sync_playwright
ROOT = sys.argv[1]
HERE = os.path.dirname(os.path.abspath(__file__))
S = os.path.dirname(HERE)
FB = S + '/fb/node_modules/firebase'
SDK = 'https://www.gstatic.com/firebasejs/12.19.0'
EMU_FS, EMU_AUTH, PROJECT = 'http://127.0.0.1:8080', 'http://127.0.0.1:9099', 'demo-sport'
DATA = json.load(open(HERE + '/records.json', encoding='utf8'))
base = serve(8862, ROOT)
fails = []
def check(cond, msg):
    print(('PASS ' if cond else 'FAIL ') + msg)
    if not cond: fails.append(msg)
def http(method, url, body=None, owner=True):
    req = urllib.request.Request(url, method=method, data=None if body is None else json.dumps(body).encode())
    if owner: req.add_header('Authorization', 'Bearer owner')
    req.add_header('Content-Type', 'application/json')
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            return json.loads(r.read().decode() or '{}')
    except urllib.error.HTTPError as e:
        return {'error': e.code, 'body': e.read().decode()[:200]}
def cloud_names():
    res = http('POST', f'{EMU_FS}/v1/projects/{PROJECT}/databases/(default)/documents:runQuery', {'structuredQuery': {'from': [{'collectionId': 'sessions', 'allDescendants': True}]}})
    return [d['document']['name'].split('/documents/')[1] for d in res if 'document' in d]
def set_rules(content):
    r = http('PUT', f'{EMU_FS}/emulator/v1/projects/{PROJECT}:securityRules', {'rules': {'files': [{'name': 'firestore.rules', 'content': content}]}}, owner=False)
    assert 'error' not in r, r
RULES = open(ROOT + '/firestore.rules', encoding='utf8').read()
DENY = "rules_version = '2';\nservice cloud.firestore { match /databases/{database}/documents { match /{document=**} { allow read, write: if false; } } }\n"
def sdk(route):
    name = route.request.url[len(SDK) + 1:].split('?')[0]
    route.fulfill(path=f'{FB}/{name}', content_type='text/javascript', headers={'Access-Control-Allow-Origin': '*'})
def context(b, history):
    ctx = b.new_context(viewport={'width': 1280, 'height': 900})
    ctx.errs = []
    ctx.route(SDK + '/**', sdk)
    ctx.add_init_script("""(list => { if (!sessionStorage.getItem('seeded')) { localStorage.setItem('workoutHistory', JSON.stringify(list));
        localStorage.setItem('cloudSync', '1'); localStorage.setItem('cloudAsked', '1'); sessionStorage.setItem('seeded', '1'); } })(%s)""" % json.dumps(history))
    return ctx
def page(ctx):
    pg = ctx.new_page()
    pg.on('pageerror', lambda e: ctx.errs.append(str(e)))
    pg.goto(base + 'index.html?cloud=emulator')
    return pg
def growth(pg):
    pg.click('#growthBox > summary')
    pg.wait_for_function("() => { const t = document.getElementById('growthNote').textContent; return t && !t.startsWith('正在讀'); }", timeout=30000)
    return pg.evaluate("""() => ({ note: document.getElementById('growthNote').textContent,
        label: document.querySelector('#growthChart svg') ? document.querySelector('#growthChart svg').getAttribute('aria-label') : null })""")

with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/opt/pw-browsers/chromium')
    set_rules(RULES)
    http('DELETE', f'{EMU_FS}/emulator/v1/projects/{PROJECT}/databases/(default)/documents')
    http('DELETE', f'{EMU_AUTH}/emulator/v1/projects/{PROJECT}/accounts')
    # 1. 傳上去
    ctx = context(b, DATA['records']); pg = page(ctx)
    pg.wait_for_function("document.getElementById('cloudStatus').textContent.includes('已同步')", timeout=30000)
    names = cloud_names()
    check(len(names) == 6, f'1. 雲端有 6 筆：{len(names)}')
    uid = names[0].split('/')[1] if names else ''
    # 2. 這台裝置只剩最近 2 次
    pg.evaluate("l => localStorage.setItem('workoutHistory', JSON.stringify(l))", DATA['records'][-2:])
    pg.reload()
    r = growth(pg)
    check(r['note'] == '這台裝置上的 2 次＋只在雲端的 4 次，共 6 次', f"2. 雲端的 4 次也算：{r['note']}")
    check(r['label'] == DATA['all'], f"2. 那一句和 node 算的一樣：{r['label']}")
    pg.select_option('#growthMetric', 'good')
    check(pg.get_attribute('#growthChart svg', 'aria-label') == DATA['allGood'], '2. 到位比例也一樣')
    # 3. 雲端多一筆被改過的（管理者權限直接寫，規則擋不到）
    bad = {'fields': {'v': {'integerValue': '1'}, 'workout': {'stringValue': 'squat'}, 'date': {'integerValue': '1790000000000'}, 'count': {'integerValue': '-3'},
                      'clean': {'integerValue': '0'}, 'errors': {'mapValue': {}}}}
    w = http('PATCH', f'{EMU_FS}/v1/projects/{PROJECT}/databases/(default)/documents/users/{uid}/sessions/squat-1790000000000', bad)
    check('error' not in w, f'3. 寫進一筆被改過的：{str(w)[:80]}')
    pg.reload()
    r = growth(pg)
    check(r['note'] == '這台裝置上的 2 次＋只在雲端的 4 次，共 6 次' and r['label'] == DATA['all'], f"3. 被改過的不算：{r['note']}")
    # 4. 另一個匿名帳號
    ctx2 = context(b, []); pg2 = page(ctx2)
    r2 = growth(pg2)
    check(r2['note'] == '這台裝置上的 0 次（雲端上的都在這台裝置上）' and r2['label'] is None, f"4. 另一個帳號讀不到別人的：{r2}")
    ctx2.close()
    # 5. 規則全部拒絕
    set_rules(DENY)
    pg.reload()
    r = growth(pg)
    check(r['note'] == '雲端暫時讀不到：先畫這台裝置上的 2 次紀錄，下次打開再試' and r['label'] == DATA['last2'], f"5. 規則拒絕：先畫這台裝置的：{r['note']}")
    set_rules(RULES)
    # 收起來再打開（打開的事件是非同步的：等到寫出讀到的結果）
    pg.click('#growthBox > summary'); pg.click('#growthBox > summary')
    pg.wait_for_function("document.getElementById('growthNote').textContent.includes('共 6 次')", timeout=30000)
    r = {'note': pg.text_content('#growthNote')}
    check(r['note'] == '這台裝置上的 2 次＋只在雲端的 4 次，共 6 次', f"5. 規則恢復後再打開：{r['note']}")
    check(not ctx.errs, f'沒有程式錯誤 {ctx.errs[:2]}')
    ctx.close(); b.close()
print('通過 |' if not fails else 'SOME FAIL', len(fails), fails[:5])
