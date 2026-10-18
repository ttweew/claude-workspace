# 用真正的網頁與樣式，示範「啟動 GPU」「最後準備中」「完成」「失敗」四種畫面
from playwright.sync_api import sync_playwright
from audit_common import *
url = serve(8795)
with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/opt/pw-browsers/chromium")
    pg = b.new_page(viewport={"width": 390, "height": 600}, device_scale_factor=2)
    pg.route(CDN + "/**", lambda r: None)  # 永遠不回應：停在載入中
    pg.route(MODEL, lambda r: None)
    pg.goto(url); pg.wait_for_timeout(500)
    for name, text, w in [("start", "AI 準備中：啟動 GPU 加速…", 90), ("warmup", "AI 準備中：最後準備中…", 96)]:
        pg.evaluate("([t, w]) => { document.getElementById('modelStatus').textContent = t; document.querySelector('#modelProgress .fill').style.width = w + '%'; }", [text, w])
        pg.wait_for_timeout(700); pg.screenshot(path=f"pb_mock_{name}.png", clip={"x": 0, "y": 0, "width": 390, "height": 330})
    pg.evaluate("() => { document.getElementById('modelStatus').textContent = 'AI 模型已就緒（載入 24.2 秒）'; document.getElementById('modelHint').hidden = true; const m = document.getElementById('modelProgress'); m.firstElementChild.style.width = '100%'; m.classList.add('done'); }")
    pg.wait_for_timeout(500); pg.screenshot(path="pb_mock_done.png", clip={"x": 0, "y": 0, "width": 390, "height": 330})
    pg.wait_for_timeout(1500)
    print("完成後進度條透明度：", pg.evaluate("getComputedStyle(document.getElementById('modelProgress')).opacity"))
    b.close()
