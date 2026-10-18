import sys, json
sys.path.insert(0, '..')
from audit_common import *
from playwright.sync_api import sync_playwright
base = serve(8897)
good = json.load(open('../hunt/long.json', encoding='utf-8')); good['frames'] = good['frames'][:300]
cases = {}
f = json.loads(json.dumps(good)); f['frames'][10]['t'] = 'abc'; cases['時間壞掉.json'] = json.dumps(f)
f = json.loads(json.dumps(good)); f['frames'][20]['landmarks'] = f['frames'][20]['landmarks'][:30]; cases['點不夠.json'] = json.dumps(f)
f = json.loads(json.dumps(good)); f['frames'][5] = None; cases['格子是空的.json'] = json.dumps(f)
f = json.loads(json.dumps(good)); f['frames'][7]['landmarks'][25] = None; cases['某點空的.json'] = json.dumps(f)
cases['好的.json'] = json.dumps(good)
with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/opt/pw-browsers/chromium")
    for q in ('', '?worker=0'):
        pg = b.new_page(viewport={"width": 390, "height": 844}); errs = []
        pg.on("pageerror", lambda e: errs.append(str(e)[:100]))
        pg.goto(base + "replay.html" + q)
        for name, text in cases.items():
            pg.set_input_files('#fileInput', files=[{'name': name, 'mimeType': 'application/json', 'buffer': text.encode()}])
            pg.wait_for_function("/已讀取|失敗/.test(document.getElementById('loadStatus').textContent)", timeout=30000)
            print(q or '(背景)', name, '→', pg.inner_text('#loadStatus'), '| 結果區', 'hidden' if pg.is_hidden('#result') else '顯示')
        print('errors', errs); pg.close()
    b.close()
