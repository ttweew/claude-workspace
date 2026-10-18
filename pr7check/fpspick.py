# 每秒格數讓使用者選（30／60／90／120）：首頁選單、記住、鏡頭上限變灰、開著鏡頭切換、錄製中鎖住、網址指定
import sys, os, re, json
sys.path.insert(0, '..')
from audit_common import *
from playwright.sync_api import sync_playwright
ROOT = sys.argv[1]
base = serve(8818, ROOT)
OUT = os.path.dirname(os.path.abspath(__file__))
ok = True
def check(cond, msg):
    global ok
    print(('PASS ' if cond else 'FAIL ') + msg); ok = ok and cond
# 假鏡頭：照要求的每秒格數送畫面（最多 camMax），getCapabilities 回報上限（camMax 為 0 時不回報）
CAM = NO_COUNTDOWN + """
window.__constraints = [];
navigator.mediaDevices.getUserMedia = async (c) => {
  window.__constraints.push(JSON.stringify(c));
  const camMax = %d;
  const want = c && c.video && c.video.frameRate ? c.video.frameRate.ideal : 30;
  const fps = Math.min(want, camMax || 30);
  const im = new Image(); im.src = '/__test/pose.jpg'; await im.decode();
  const cv = document.createElement('canvas'); cv.width = 640; cv.height = 480;
  const g = cv.getContext('2d'); const s = Math.min(cv.width / im.width, cv.height / im.height);
  const dw = im.width * s, dh = im.height * s; let k = 0;
  const draw = () => { g.fillStyle = '#5a88b8'; g.fillRect(0, 0, cv.width, cv.height); g.drawImage(im, (cv.width - dw) / 2, (cv.height - dh) / 2, dw, dh); g.fillStyle = k++ %% 2 ? '#000' : '#111'; g.fillRect(0, 0, 2, 2); };
  draw(); setInterval(draw, 1000 / fps);
  const stream = cv.captureStream(fps);
  const tr = stream.getVideoTracks()[0]; const gs = tr.getSettings.bind(tr);
  tr.getSettings = () => ({ ...gs(), frameRate: fps });
  tr.getCapabilities = () => camMax ? { frameRate: { min: 1, max: camMax } } : {};
  return stream;
};"""
opts = lambda pg, sel: pg.evaluate(f"[...document.querySelectorAll('{sel} option')].map(o => (o.disabled ? 'x ' : '') + o.textContent)")
# 首頁的每秒格數、AI 模型收進「進階設定」（PR #79）：測試一開始就打開
CAM += "\ndocument.addEventListener('DOMContentLoaded', () => { const d = document.getElementById('advanced'); if (d) d.open = true; });"
with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/opt/pw-browsers/chromium")
    # 1. 預設 30、選 60 後記住、開鏡頭、上限 60 時 90／120 變灰
    ctx = b.new_context(viewport={"width": 1280, "height": 800}, accept_downloads=True); pg = ctx.new_page(); errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)))
    mock_network(pg); pg.add_init_script(CAM % 60)
    pg.goto(base + "index.html"); pg.wait_for_function(READY, timeout=60000)
    check(pg.input_value("#fpsSelect") == '30' and pg.is_hidden("#fpsHint"), '預設每秒 30 格、沒有實驗提醒')
    check(opts(pg, '#fpsSelect') == ['每秒 30 格（建議）', '每秒 60 格（實驗）', '每秒 90 格（實驗）', '每秒 120 格（實驗）'], '選項：' + str(opts(pg, '#fpsSelect')))
    pg.select_option("#fpsSelect", '60'); pg.wait_for_timeout(100)
    check(pg.is_visible("#fpsHint") and pg.inner_text("#fpsHint").startswith('實驗中'), '選 60 出現實驗提醒：' + pg.inner_text("#fpsHint")[:30])
    pg.reload(); pg.wait_for_function(READY, timeout=60000)
    check(pg.input_value("#fpsSelect") == '60', '重新整理後記得 60')
    pg.click("#startBtn"); pg.wait_for_timeout(3500)
    cons = pg.evaluate("window.__constraints")
    check('"frameRate":{"ideal":60}' in cons[-1], '開鏡頭時要求 60 格')
    badge = pg.inner_text("#perfBtn")
    check(re.search(r'鏡頭 (5[4-9]|6[0-6]) · AI \d+ FPS', badge) is not None, '標籤分開顯示鏡頭和 AI：' + badge)
    check(opts(pg, '#fpsSelect')[2:] == ['x 每秒 90 格（鏡頭最多 60）', 'x 每秒 120 格（鏡頭最多 60）'], '鏡頭最多 60：90、120 變灰 ' + str(opts(pg, '#fpsSelect')[2:]))
    # 2. 開著鏡頭切換：點運算標籤 → 選單出現 → 換成 30 → 重開鏡頭、不指定格數
    check(pg.is_hidden("#fpsLive"), '平常鏡頭畫面上沒有格數選單')
    pg.click("#perfBtn"); pg.wait_for_timeout(300)
    check(pg.is_visible("#fpsLive") and pg.input_value("#fpsLive") == '60', '點開運算標籤出現格數選單（目前 60）')
    n = len(cons)
    pg.select_option("#fpsLive", '30'); pg.wait_for_timeout(3500)
    cons = pg.evaluate("window.__constraints")
    check(len(cons) == n + 1 and 'frameRate' not in cons[-1], '切換成 30：重開鏡頭、不指定格數 ' + cons[-1])
    check(pg.is_visible("#stage") and pg.is_visible("#fpsLive") and pg.input_value("#fpsLive") == '30' and pg.input_value("#fpsSelect") == '30', '還在鏡頭畫面，兩個選單同步 30')
    badge = pg.inner_text("#perfBtn")
    check('鏡頭每秒' in badge and 'AI' not in badge, '30 格時標籤和以前一樣（展開多顯示鏡頭格數）：' + badge)
    # 3. 錄製中鎖住
    pg.click("#dataBtn"); pg.click("#recordBtn"); pg.wait_for_timeout(500)
    check(pg.is_disabled("#fpsLive"), '錄製中不能換格數')
    pg.click("#recordBtn"); pg.wait_for_timeout(300)
    check(not pg.is_disabled("#fpsLive"), '停止錄製後可以換')
    check(opts(pg, '#fpsLive')[3] == 'x 每秒 120 格（鏡頭最多 60）', '開著鏡頭時 120 鎖住 ' + str(opts(pg, '#fpsLive')))
    check(not errs, '沒有錯誤 ' + str(errs[:3]))
    ctx.close()
    # 4. 開鏡頭前先選 120（還不知道鏡頭最多 60）：開了以後選項不鎖、寫出最多 60，鏡頭給 60
    ctx = b.new_context(viewport={"width": 1280, "height": 800}); pg = ctx.new_page(); errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)))
    mock_network(pg); pg.add_init_script(CAM % 60)
    pg.goto(base + "index.html"); pg.wait_for_function(READY, timeout=60000)
    pg.select_option("#fpsSelect", '120')
    pg.click("#startBtn"); pg.wait_for_timeout(3500); pg.click("#perfBtn"); pg.wait_for_timeout(1200)
    o = opts(pg, '#fpsLive')
    check(o[3] == '每秒 120 格（鏡頭最多 60）' and pg.input_value("#fpsLive") == '120', '選 120：' + str(o))
    check(re.search(r'鏡頭 (5[4-9]|6[0-6]) · AI', pg.inner_text("#perfBtn")) is not None, '鏡頭實際給 60：' + pg.inner_text("#perfBtn"))
    pg.locator("#infobar").screenshot(path=f"{OUT}/infobar_120.png")
    check(not errs, '沒有錯誤 ' + str(errs[:3]))
    ctx.close()
    # 5. 鏡頭沒回報上限：都能選；網址 ?fps=90 直接指定、不記住
    ctx = b.new_context(viewport={"width": 1280, "height": 800}); pg = ctx.new_page(); errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)))
    mock_network(pg); pg.add_init_script(CAM % 0)
    pg.goto(base + "index.html?fps=90"); pg.wait_for_function(READY, timeout=60000)
    check(pg.input_value("#fpsSelect") == '90', '網址 ?fps=90 直接選好 90')
    pg.click("#startBtn"); pg.wait_for_timeout(3000)
    check('"frameRate":{"ideal":90}' in pg.evaluate("window.__constraints")[-1], '要求 90 格')
    check(all(not x.startswith('x ') for x in opts(pg, '#fpsSelect')), '鏡頭沒回報上限：都能選 ' + str(opts(pg, '#fpsSelect')))
    pg.goto(base + "index.html"); pg.wait_for_function(READY, timeout=60000)
    check(pg.input_value("#fpsSelect") == '30', '網址指定的不會記住（回到 30）')
    check(not errs, '沒有錯誤 ' + str(errs[:3]))
    ctx.close()
    # 6. 手機版面：首頁選單、點開標籤後的選單不超出畫面
    for vw, vh in [(320, 640), (390, 844), (844, 390)]:
        ctx = b.new_context(viewport={"width": vw, "height": vh}, is_mobile=True, has_touch=True); pg = ctx.new_page()
        mock_network(pg); pg.add_init_script(CAM % 60)
        pg.goto(base + "index.html"); pg.wait_for_function(READY, timeout=60000)
        pg.select_option("#fpsSelect", '120'); pg.wait_for_timeout(100)
        r = pg.evaluate("() => { const a = document.querySelector('.fps-pick').getBoundingClientRect(), s = document.getElementById('fpsSelect').getBoundingClientRect(), h = document.getElementById('fpsHint').getBoundingClientRect(); return [a.left, a.right, s.right, h.right, document.documentElement.scrollWidth]; }")
        check(r[2] <= vw and r[3] <= vw and r[4] == vw, f'{vw} 首頁選單在畫面內 {r}')
        pg.locator(".start-card").screenshot(path=f"{OUT}/start_{vw}.png")
        pg.click("#startBtn"); pg.wait_for_timeout(3000); pg.click("#perfBtn"); pg.wait_for_timeout(300)
        r = pg.evaluate("() => { const s = document.getElementById('fpsLive').getBoundingClientRect(); return [s.left, s.right, s.bottom, document.documentElement.scrollWidth]; }")
        check(r[1] <= vw - 4 and r[3] == vw, f'{vw} 鏡頭畫面的格數選單在畫面內 {r}')
        pg.screenshot(path=f"{OUT}/live_{vw}.png")
        ctx.close()
print('ALL PASS' if ok else 'SOME FAIL')
