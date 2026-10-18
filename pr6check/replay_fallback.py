# 重播頁：檔案改成交給背景執行緒讀之後，這些情況還是要對
#  1. 瀏覽器沒有 Worker → 主畫面讀檔
#  2. 背景執行緒讀檔時當掉 → 主畫面重讀（不用重選檔案）
#  3. 背景執行緒分析時當掉 → 主畫面重讀、重算
#  4. 大檔案還在讀，又選了小檔案 → 顯示小檔案的結果
import sys, os, time
sys.path.insert(0, '..')
from audit_common import *
from playwright.sync_api import sync_playwright
ROOT = sys.argv[1]
base = serve(8815, ROOT)
OUT = os.path.dirname(os.path.abspath(__file__))
ok = True
def check(cond, msg):
    global ok
    print(('PASS ' if cond else 'FAIL ') + msg); ok = ok and cond
# 讓背景執行緒收到某種工作時「當掉」（觸發 error 事件）
CRASH = """(() => { const O = window.Worker; window.Worker = class extends O {
  postMessage(m, t) { if (m && m.type === '%s') { setTimeout(() => this.dispatchEvent(new ErrorEvent('error', { message: 'boom' })), 50); return; } return super.postMessage(m, t); } }; })();"""
DONE = "!/讀取中|分析中/.test(document.getElementById('loadStatus').innerText) && document.getElementById('loadStatus').innerText.length > 0"
with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/opt/pw-browsers/chromium")
    for name, init in [('沒有 Worker', 'window.Worker = undefined;'), ('讀檔時當掉', CRASH % 'load'), ('分析時當掉', CRASH % 'analyze')]:
        pg = b.new_page(); errs = []
        pg.on("pageerror", lambda e: errs.append(str(e)))
        pg.add_init_script(init)
        pg.goto(base + "replay.html"); pg.wait_for_timeout(300)
        for f in ['big5.json', 'big5.csv']:
            pg.set_input_files("#fileInput", os.path.join(OUT, f))
            pg.wait_for_function(DONE, timeout=120000)
            st = pg.inner_text("#loadStatus"); summ = pg.inner_text("#summary").replace('\n', ' | ')
            check(st == f'已讀取「{f}」，共 9001 格' and '300.0 秒 · 9001 格' in summ and pg.is_visible("#result"), f'{name} {f}：{st}')
        # 示範資料（文字，不是檔案）也照常
        pg.click("#demoSide"); pg.wait_for_function(DONE, timeout=60000)
        check('合成示範_側面深蹲' in pg.inner_text("#loadStatus"), f'{name} 示範資料：' + pg.inner_text("#loadStatus"))
        # 壞檔案：清楚的錯誤
        pg.set_input_files("#fileInput", files=[{"name": "bad.json", "mimeType": "application/json", "buffer": b'not json'}])
        pg.wait_for_function("document.getElementById('loadStatus').innerText.startsWith('讀取失敗')", timeout=30000)
        check(pg.inner_text("#loadStatus") == '讀取失敗：這不是本網站「數據」面板下載的 JSON 或 CSV 檔', f'{name} 壞檔案：' + pg.inner_text("#loadStatus"))
        # 改畫面大小重算（CSV 才有選單）：主畫面讀過的資料直接用
        check(not errs, f'{name} 沒有錯誤 {errs[:2]}')
        pg.close()
    # 大檔案還在讀，又選了小檔案（一般情況、沒有 Worker 兩種）
    for name, init in [('一般', ''), ('沒有 Worker', 'window.Worker = undefined;')]:
        pg = b.new_page(); errs = []
        pg.on("pageerror", lambda e: errs.append(str(e)))
        if init: pg.add_init_script(init)
        pg.goto(base + "replay.html"); pg.wait_for_timeout(300)
        pg.set_input_files("#fileInput", os.path.join(OUT, 'big20.json'))
        pg.wait_for_timeout(300)
        pg.set_input_files("#fileInput", os.path.join(OUT, 'big5.csv'))
        pg.wait_for_function(DONE, timeout=300000)
        pg.wait_for_timeout(8000)   # 等大檔案那邊也讀完，確定不會蓋掉
        st = pg.inner_text("#loadStatus"); summ = pg.inner_text("#summary").replace('\n', ' | ')
        check(st == '已讀取「big5.csv」，共 9001 格' and '300.0 秒 · 9001 格' in summ, f'{name} 讀大檔時換小檔：{st} | {summ[:40]}')
        check(not errs, f'{name} 沒有錯誤 {errs[:2]}')
        pg.close()
print('ALL PASS' if ok else 'SOME FAIL')
