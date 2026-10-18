import sys, csv, io, json
sys.path.insert(0, '..')
from audit_common import *
from playwright.sync_api import sync_playwright
base = serve(8908, '/home/user/claude-workspace')
with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/opt/pw-browsers/chromium", args=["--use-fake-ui-for-media-stream"])
    ctx = b.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2, is_mobile=True, has_touch=True, accept_downloads=True)
    pg = ctx.new_page(); errs = []; pg.on("pageerror", lambda e: errs.append(str(e)[:100]))
    mock_network(pg); pg.add_init_script(cam_script(640, 480))
    pg.goto(base + "index.html"); pg.wait_for_function(READY, timeout=90000)
    pg.click('#startBtn'); pg.wait_for_timeout(3000); pg.click('#dataBtn'); pg.wait_for_timeout(600)
    raw_row = pg.inner_text('#dataRows tr:first-child')
    note_raw = pg.inner_text('#panelModeNote')
    pg.click('#smoothModeBtn'); pg.wait_for_timeout(600)
    sm_row = pg.inner_text('#dataRows tr:first-child')
    pressed = pg.evaluate("[rawModeBtn.getAttribute('aria-pressed'), smoothModeBtn.getAttribute('aria-pressed')]")
    pg.screenshot(path='panel_smooth.png')
    # 錄 3 秒下載 CSV、JSON
    pg.click('#recordBtn'); pg.wait_for_timeout(3000); pg.click('#recordBtn')
    with pg.expect_download() as d: pg.click('#csvBtn')
    text = open(d.value.path(), encoding='utf-8-sig').read(); rows = list(csv.reader(io.StringIO(text)))
    with pg.expect_download() as d: pg.click('#jsonBtn')
    j = json.load(open(d.value.path(), encoding='utf-8'))
    # 重新整理：記得選擇
    pg.reload(); pg.wait_for_function(READY, timeout=90000); pg.click('#startBtn'); pg.wait_for_timeout(2000); pg.click('#dataBtn')
    remembered = pg.get_attribute('#smoothModeBtn', 'aria-pressed')
    print('原始列:', raw_row.replace('\t', ' '), '|', note_raw)
    print('平滑列:', sm_row.replace('\t', ' '), '| 按鈕狀態', pressed)
    print('CSV 欄數', len(rows[0]), '最後幾欄', rows[0][-3:], '| 列數', len(rows) - 1, '| 每列欄數一致', len(set(map(len, rows))) == 1, '| 第一格平滑左膝', rows[1][rows[0].index('left_knee_sx')], rows[1][rows[0].index('left_knee_seen')])
    sw = [f for f in j['frames'] if f.get('stableWorld')]
    import math
    lk = lambda f, key: math.dist(f[key][23], f[key][25])
    print('處理過的公尺座標格數', len(sw), '/', len(j['frames']), '| 大腿長度 原始', round(sum(lk(f, 'world') for f in sw) / len(sw), 4), '處理過', round(sum(lk(f, 'stableWorld') for f in sw) / len(sw), 4), '| CSV 有 left_hip_swx', 'left_hip_swx' in rows[0])
    print('JSON fields', j['fields'], '| 有 smoothed 的格', sum(1 for f in j['frames'] if f.get('smoothed')), '/', len(j['frames']))
    print('重新整理後記得「平滑後」', remembered, '| errors', errs)
    b.close()
