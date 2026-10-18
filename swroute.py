# 讓測試的假 CDN 也攔得到 Service Worker 發出的請求：page.route 只攔網頁自己的請求，改掛在整個瀏覽環境（context）上
# SW_ROUTES=0 關閉（回到原本 page.route）
import os
from playwright.sync_api import Page
if os.environ.get('SW_ROUTES', '1') != '0' and not getattr(Page, '_sw_patched', False):
    _route, _unroute = Page.route, Page.unroute
    def route(self, url, handler, **kw): return self.context.route(url, handler, **kw)
    def unroute(self, url, handler=None): return self.context.unroute(url, handler)
    Page.route, Page.unroute, Page._sw_patched = route, unroute, True
