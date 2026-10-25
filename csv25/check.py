# 10/25 提案：運動紀錄匯出 CSV（瀏覽器）
#  首頁「運動紀錄」展開：「下載 CSV（全部 N 次）」→ 下載的檔名、BOM、表頭、每一次一列、數字和總結一樣；被改壞的那一筆不出現
#  320／390 寬兩個按鈕放得下；axe-core；舊程式（加 old）沒有這個按鈕
# 用法：python3 check.py <網站資料夾> <port> [old]
import sys, os, csv, io, json
sys.path.insert(0, '..')
from audit_common import *
from playwright.sync_api import sync_playwright
ROOT, PORT = sys.argv[1], int(sys.argv[2])
HERE = os.path.dirname(os.path.abspath(__file__))
base = serve(PORT, ROOT)
AXE = open(os.path.join(HERE, '..', 'a11y', 'node_modules', 'axe-core', 'axe.min.js')).read()
fails = []
def check(ok, msg):
    print(('PASS ' if ok else 'FAIL ') + msg)
    if not ok: fails.append(msg)
# 12 次深蹲（清單只列最近 10 次）＋1 次棒式＋1 筆被改壞的
T0 = 1792900000000
hist = []
for i in range(12):
    hist.append({'workout': 'squat', 'date': T0 + i * 86400000, 'minutes': 1.5, 'count': 10, 'clean': 8, 'errors': {'lean': 2},
                 'good': 6, 'close': 3, 'shallow': 1, 'best': 84, 'average': 92, 'tempo': 2.4, 'similarity': 91, **({'goal': 10, 'actual': 11} if i == 11 else {})})
hist.append({'workout': 'plank', 'date': T0 + 12 * 86400000, 'minutes': 2, 'count': 2, 'clean': 1, 'errors': {'sag': 1}, 'seconds': [45, 30], 'best': 45, 'total': 75, 'goal': 60})
hist.append({'workout': 'constructor', 'count': 3})
SEED = "localStorage.setItem('workoutHistory', %s)" % json.dumps(json.dumps(hist))
with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/opt/pw-browsers/chromium")
    ctx = b.new_context(viewport={"width": 1280, "height": 900}, accept_downloads=True)
    pg = ctx.new_page(); errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.add_init_script(SEED)
    pg.goto(base + "index.html"); pg.wait_for_timeout(800)
    pg.click('#historyBox summary'); pg.wait_for_timeout(200)
    if 'old' in sys.argv:
        check(pg.locator('#historyCsv').count() == 0, '舊程式沒有下載 CSV 的按鈕')
    else:
        label = pg.text_content('#historyCsv')
        items = pg.locator('#historyList li').count()
        check(label == '下載 CSV（全部 13 次）' and items == 10, f'按鈕寫全部幾次（清單只列 {items} 次）：{label}')
        with pg.expect_download() as dl:
            pg.click('#historyCsv')
        d = dl.value
        path = d.path(); raw = open(path, 'rb').read()
        text = raw.decode('utf-8')
        check(d.suggested_filename.startswith('workout_history_') and d.suggested_filename.endswith('.csv'), f'檔名 {d.suggested_filename}')
        check(raw.startswith(b'\xef\xbb\xbf') and '\r\n' in text, 'Excel 打得開：BOM、\\r\\n')
        rows = list(csv.reader(io.StringIO(text.lstrip('﻿'), newline='')))
        head = rows[0]
        check(head[:4] == ['日期', '時間', '動作', '次數'] and len(rows) == 14 and all(len(r) == len(head) for r in rows), f'表頭＋13 次（被改壞的不出現）：{len(rows)} 列')
        last_squat = dict(zip(head, rows[12])); plank = dict(zip(head, rows[13]))
        print('   ', last_squat); print('   ', plank)
        check(last_squat['動作'] == '深蹲' and last_squat['次數'] == '10' and last_squat['到位'] == '6' and last_squat['錯誤'] == '上身前傾 2'
              and last_squat['目標'] == '10 下' and last_squat['達成目標'] == '是' and last_squat['自己數的'] == '11' and last_squat['計次準確率'] == '91%', '深蹲那一列')
        check(plank['動作'] == '棒式' and plank['最久（秒）'] == '45' and plank['總共（秒）'] == '75' and plank['目標'] == '60 秒' and plank['達成目標'] == '否' and plank['到位'] == '', '棒式那一列')
        # 首頁總結裡的同一次：數字一樣
        pg.add_script_tag(content=AXE)
        v = pg.evaluate("axe.run(document.getElementById('historyBox')).then(r => r.violations.map(x => x.id + ':' + x.nodes.length))")
        check(v == [], f'axe-core（運動紀錄）{v}')
        for w in [320, 390]:
            pg.set_viewport_size({"width": w, "height": 800}); pg.wait_for_timeout(300)
            r = pg.evaluate("""(() => { const a = document.getElementById('historyCsv').getBoundingClientRect(), c = document.getElementById('clearHistory').getBoundingClientRect();
              return [Math.round(a.right), Math.round(c.right), document.documentElement.scrollWidth]; })()""")
            check(max(r) <= w, f'{w} 寬兩個按鈕放得下 {r}')
        pg.locator('#historyBox').screenshot(path=os.path.join(HERE, 'history_390.png'))
    check(not errs, f'沒有錯誤 {errs[:2]}')
    b.close()
print('通過 |' if not fails else 'SOME FAIL', len(fails), fails[:5])
