# 10/29 提案：加到手機主畫面的圖示（和網站左上角、分頁小圖示同一個人形）
#  用 Chromium 把 SVG 畫成 PNG：192、512（一般）、512 maskable（Android 會裁成圓形或圓角，人形縮在中間 6 成的安全範圍）、180（iPhone 主畫面）
# 用法：python3 make_icons.py <輸出資料夾>
import sys, os
from playwright.sync_api import sync_playwright
OUT = sys.argv[1]
FIG = '<g fill="none" stroke="#2EE6A6" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="16" cy="7.5" r="2.6"/><path d="M16 11v8M9 14l7-2 7 2M16 19l-5 7M16 19l5 7"/></g>'
def svg(scale):
    # 人形在 32×32 裡大約佔 x 9～23、y 5～26；scale 是縮放（以中心 16,16 為準），背景是網站的底色
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="100%" height="100%">'
            f'<rect width="32" height="32" fill="#0B1220"/>'
            f'<g transform="translate(16 16.5) scale({scale}) translate(-16 -15.5)">{FIG}</g></svg>')
ICONS = [('icon-192.png', 192, 0.9), ('icon-512.png', 512, 0.9), ('icon-maskable-512.png', 512, 0.62), ('apple-touch-icon.png', 180, 0.85)]
with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/opt/pw-browsers/chromium")
    for name, size, scale in ICONS:
        pg = b.new_page(viewport={"width": size, "height": size}, device_scale_factor=1)
        pg.set_content(f'<html><body style="margin:0;background:#0B1220">{svg(scale)}</body></html>')
        pg.screenshot(path=os.path.join(OUT, name), clip={'x': 0, 'y': 0, 'width': size, 'height': size})
        pg.close()
        print(name, size)
    b.close()
