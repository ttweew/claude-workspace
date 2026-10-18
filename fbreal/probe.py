# 先確認 browser_real.py 的新零件：設定解析、Chromium 經過代理連 googleapis（憑證）、從 IndexedDB 讀匿名帳號
import sys, os, re
sys.path.insert(0, '..')
from audit_common import *
from playwright.sync_api import sync_playwright
S = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sample = """export const FIREBASE_CONFIG = {
    apiKey: 'AIzaSyA-test_key',
    authDomain: 'ai-sport-analysis.firebaseapp.com',
    projectId: 'ai-sport-analysis',
    storageBucket: 'ai-sport-analysis.firebasestorage.app',
    messagingSenderId: '123456789',
    appId: '1:123456789:web:abcdef'
};"""
CFG = {k: v for k, v in re.findall(r"(\w+):\s*'([^']*)'", sample.split('FIREBASE_CONFIG = ')[1].split(';')[0])}
print('設定解析：', CFG)
AUTH_USER = open('browser_real.py', encoding='utf8').read().split('AUTH_USER = """')[1].split('"""')[0]
base = serve(8863, '/home/user/claude-workspace')
with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/opt/pw-browsers/chromium", proxy={'server': os.environ['HTTPS_PROXY'], 'bypass': '127.0.0.1,localhost'})
    pg = b.new_page()
    r = pg.goto('https://firestore.googleapis.com/')
    print('經過代理連 googleapis：', r.status)
    FB = S + '/fb/node_modules/firebase'; SDK = 'https://www.gstatic.com/firebasejs/12.19.0'
    pg.route(SDK + '/**', lambda rt: rt.fulfill(path=f"{FB}/{rt.request.url[len(SDK) + 1:].split('?')[0]}", content_type='text/javascript', headers={'Access-Control-Allow-Origin': '*'}))
    pg.route(CDN + "/**", lambda rt: rt.abort()); pg.route(MODEL, lambda rt: rt.abort())
    pg.goto(base + 'index.html?cloud=emulator')
    pg.wait_for_timeout(1500)
    print('還沒登入：', pg.evaluate(AUTH_USER))
    pg.click('#advanced summary'); pg.click('#cloudToggle')
    pg.wait_for_function("document.getElementById('cloudStatus').textContent.includes('已開啟')", timeout=30000)
    print('登入後：', pg.evaluate(AUTH_USER))
    b.close()
