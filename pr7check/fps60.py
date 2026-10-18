# 高速模式 ?fps=60：鏡頭要求、運算標籤分開顯示鏡頭和 AI 格數、錄製檔記下鏡頭格數、重播頁顯示、檔案大小提示
import sys, os, re, json
sys.path.insert(0, '..')
from audit_common import *
from playwright.sync_api import sync_playwright
ROOT = sys.argv[1]
base = serve(8816, ROOT)
ok = True
def check(cond, msg):
    global ok
    print(('PASS ' if cond else 'FAIL ') + msg); ok = ok and cond
# 假鏡頭：照要求的每秒格數送畫面（有要求 frameRate 就用它的 ideal，沒有就 30），並記下要求內容
CAM = NO_COUNTDOWN + """
window.__constraints = [];
navigator.mediaDevices.getUserMedia = async (c) => {
  window.__constraints.push(JSON.stringify(c));
  const want = c && c.video && c.video.frameRate ? c.video.frameRate.ideal : 30;
  const fps = Math.min(want, %d);
  const im = new Image(); im.src = '/__test/pose.jpg'; await im.decode();
  const cv = document.createElement('canvas'); cv.width = 640; cv.height = 480;
  const g = cv.getContext('2d'); const s = Math.min(cv.width / im.width, cv.height / im.height);
  const dw = im.width * s, dh = im.height * s; let k = 0;
  const draw = () => { g.fillStyle = '#5a88b8'; g.fillRect(0, 0, cv.width, cv.height); g.drawImage(im, (cv.width - dw) / 2, (cv.height - dh) / 2, dw, dh); g.fillStyle = k++ %% 2 ? '#000' : '#111'; g.fillRect(0, 0, 2, 2); };
  draw(); setInterval(draw, 1000 / fps);
  const stream = cv.captureStream(fps);
  const tr = stream.getVideoTracks()[0]; const gs = tr.getSettings.bind(tr);
  tr.getSettings = () => ({ ...gs(), frameRate: fps });
  return stream;
};"""
IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1'
with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/opt/pw-browsers/chromium")
    for name, query, camMax, ua in [('一般', '', 60, None), ('高速', '?fps=60', 60, None), ('高速但鏡頭只有 30', '?fps=60', 30, None), ('高速 iPhone', '?fps=60', 60, IPHONE)]:
        kw = dict(viewport={"width": 1280, "height": 720}, accept_downloads=True)
        if ua: kw.update(user_agent=ua, viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True)
        ctx = b.new_context(**kw); pg = ctx.new_page(); errs = []
        pg.on("pageerror", lambda e: errs.append(str(e)))
        pg.on("console", lambda m: errs.append(m.text) if m.type == 'error' and not m.text.startswith('INFO:') else None)
        mock_network(pg); pg.add_init_script(CAM % camMax)
        pg.goto(base + "index.html" + query); pg.wait_for_function(READY, timeout=60000)
        pg.click("#startBtn"); pg.wait_for_timeout(4000)
        cons = pg.evaluate("window.__constraints")
        badge = pg.inner_text("#perfBtn")
        if query:
            check('"frameRate":{"ideal":60}' in cons[0], f'{name} 向鏡頭要求每秒 60 格：{cons[0]}')
            m = re.search(r'鏡頭 (\d+) · AI (\d+) FPS', badge)
            check(m is not None, f'{name} 運算標籤分開顯示：{badge}')
            if m:
                cam, ai = int(m.group(1)), int(m.group(2))
                check(abs(cam - camMax) <= 6, f'{name} 鏡頭格數 {cam}（假鏡頭 {camMax}）')
                check(0 < ai <= cam + 2, f'{name} AI 格數 {ai} 不會比鏡頭多')
        else:
            check('frameRate' not in cons[0], f'{name} 不指定每秒格數：{cons[0]}')
            check(re.fullmatch(r'(GPU|CPU) · \d+ FPS', badge) is not None, f'{name} 運算標籤和以前一樣：{badge}')
            pg.click("#perfBtn"); pg.wait_for_timeout(1200)
            ex = pg.inner_text("#perfBtn")
            check(re.search(r'鏡頭每秒 (2[5-9]|3[0-5]) 格', ex) is not None, f'{name} 展開後顯示鏡頭格數：{ex}')
            pg.click("#perfBtn")
        # 錄一段：檔案記下鏡頭格數
        pg.click("#dataBtn"); pg.wait_for_timeout(200)
        note = pg.inner_text("#limitNote")
        if query:
            expect = '檔案約 70 MB' if camMax == 60 else '檔案約 35 MB'
            check(note == expect, f'{name} 5 分鐘的檔案大小跟著鏡頭格數（{camMax}）：{note[:40]}')
            if ua:
                pg.select_option("#limitSelect", '10'); pg.wait_for_timeout(100)
                n10 = pg.inner_text("#limitNote")
                check(n10.startswith('檔案約 135 MB。手機錄太久'), f'{name} 手機高速模式 10 分鐘就提醒：{n10[:40]}')
                pg.select_option("#limitSelect", '5')
        else:
            check(note == '檔案約 35 MB', f'{name} 檔案大小：{note}')
        pg.click("#recordBtn"); pg.wait_for_timeout(3000); pg.click("#recordBtn"); pg.wait_for_timeout(300)
        with pg.expect_download() as d:
            pg.click("#jsonBtn")
        data = json.load(open(d.value.path()))
        rate = data['meta'].get('cameraFrameRate')
        fr = data['frames']; per = (len(fr) - 1) / ((fr[-1]['t'] - fr[0]['t']) / 1000) if len(fr) > 1 else 0
        check(rate == (camMax if query else 30), f'{name} 檔案記下鏡頭每秒 {rate} 格；實際錄到每秒 {per:.1f} 格')
        # 重播頁顯示鏡頭格數
        pg2 = ctx.new_page(); pg2.goto(base + "replay.html"); pg2.wait_for_timeout(300)
        pg2.set_input_files("#fileInput", d.value.path())
        pg2.wait_for_function("document.getElementById('loadStatus').innerText.startsWith('已讀取')", timeout=60000)
        summ = pg2.inner_text("#summary").replace('\n', ' | ')
        check(f'640×480，鏡頭每秒 {rate} 格' in summ, f'{name} 重播頁：' + re.search(r'鏡頭畫面 \| [^|]*', summ).group(0))
        check(not errs, f'{name} 沒有錯誤 {errs[:3]}')
        ctx.close()
print('ALL PASS' if ok else 'SOME FAIL')
