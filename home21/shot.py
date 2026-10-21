# 10/21 首頁版面整理：拍改前／改後（預設、實測模式開著＋有還沒下載的錄製檔＋進階設定打開）
# 用法：python3 shot.py <網站資料夾> <before|after> <port>
import sys, os
sys.path.insert(0, '..')
from audit_common import *
from playwright.sync_api import sync_playwright
ROOT, TAG, PORT = sys.argv[1], sys.argv[2], int(sys.argv[3])
OUT = os.path.dirname(os.path.abspath(__file__))
base = serve(PORT, ROOT)
SEED = """async () => {
  const lib = await import('/js/data/library.js');
  for (const [i, w] of [['1', 'squat'], ['2', 'lunge']].entries()) await lib.saveRecording({ name: 'test_A_' + w[1] + '_good_2026102' + i + '_210000', meta: { workout: w[1], test: { subject: 'A', condition: 'good', reps: 10 } }, seconds: 30 + i, frames: 900, blob: new Blob(['{}']) });
  localStorage.setItem('testMode', JSON.stringify({ on: true, subject: 'A', autoDownload: false }));
}"""
with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/opt/pw-browsers/chromium")
    for w, h in [(390, 844), (320, 640), (1280, 800)]:
        ctx = b.new_context(viewport={"width": w, "height": h}, is_mobile=w < 500, has_touch=w < 500)
        ctx.route(CDN + "/**", cdn)
        pg = ctx.new_page()
        pg.goto(base + "index.html"); pg.add_style_tag(content=".site-nav{display:none!important}"); pg.wait_for_timeout(1500)
        pg.locator('.start-card').screenshot(path=f"{OUT}/{TAG}_{w}_plain.png")
        pg.evaluate(SEED); pg.reload(); pg.add_style_tag(content=".site-nav{display:none!important}"); pg.wait_for_timeout(1500)
        pg.evaluate("document.getElementById('advanced').open = true")
        pg.wait_for_timeout(200)
        pg.locator('.start-card').screenshot(path=f"{OUT}/{TAG}_{w}_on.png")
        ctx.close()
print('ok')
