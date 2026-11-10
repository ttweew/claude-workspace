# 總體檢（11/10）：網站結構檢查（不開瀏覽器）
#   1. 每一頁：重複的 id、label for 指到的 id、頁內和跨頁連結（#錨點）、引用的 css/js/圖片檔在不在
#   2. JS：import 的檔案在不在；每一頁載入的程式裡 getElementById('x')／querySelector('#x') 的 id，在那一頁的 HTML 裡有沒有
#   3. sw.js、manifest 引用的檔案在不在
# 用法：python3 site_check.py <網站資料夾>
import sys, os, re, json
root = sys.argv[1]
pages = sorted(f for f in os.listdir(root) if f.endswith('.html'))
read = lambda p: open(os.path.join(root, p), encoding='utf-8').read()
problems = []
ids_of = {}
for p in pages:
    s = read(p)
    ids = re.findall(r'\bid="([^"]+)"', s)
    dup = sorted({i for i in ids if ids.count(i) > 1})
    if dup: problems.append(f'{p}：重複的 id {dup}')
    ids_of[p] = set(ids)
    for target in re.findall(r'<label[^>]*\bfor="([^"]+)"', s):
        if target not in ids_of[p]: problems.append(f'{p}：label for="{target}" 找不到這個 id')
    for attr in ('aria-labelledby', 'aria-describedby', 'aria-controls'):
        for val in re.findall(attr + r'="([^"]+)"', s):
            for t in val.split():
                if t not in ids_of[p]: problems.append(f'{p}：{attr}="{t}" 找不到這個 id')
for p in pages:
    s = read(p)
    for href in re.findall(r'<a[^>]*\bhref="([^"]+)"', s):
        if re.match(r'^(https?:|mailto:|tel:|javascript:|data:)', href): continue
        path, _, frag = href.partition('#')
        path = path.split('?')[0]
        target = p if path in ('', './') else path.lstrip('./')
        if target.endswith('/') or target == '': target = 'index.html'
        if not os.path.exists(os.path.join(root, target)):
            problems.append(f'{p}：連結 {href} 的檔案不存在'); continue
        if frag and target in ids_of and frag not in ids_of[target]:
            problems.append(f'{p}：連結 {href} 的錨點 #{frag} 在 {target} 找不到')
    for src in re.findall(r'<(?:script|img|source|video)[^>]*\bsrc="([^"]+)"', s) + re.findall(r'<link[^>]*\bhref="([^"]+)"', s):
        if re.match(r'^(https?:|data:)', src): continue
        f = src.split('?')[0].split('#')[0].lstrip('./')
        if not os.path.exists(os.path.join(root, f)): problems.append(f'{p}：引用的檔案 {src} 不存在')
# JS 的 import
js_files = []
for d, _, fs in os.walk(os.path.join(root, 'js')):
    for f in fs:
        if f.endswith('.js'): js_files.append(os.path.relpath(os.path.join(d, f), root))
graph = {}
for f in js_files:
    s = read(f)
    deps = []
    for spec in re.findall(r'''(?:import|export)\s[^;]*?from\s+['"]([^'"]+)['"]''', s) + re.findall(r'''import\(\s*['"]([^'"]+)['"]\s*\)''', s) + re.findall(r'''^\s*import\s+['"]([^'"]+)['"]''', s, re.M):
        if not spec.startswith('.'): continue
        t = os.path.normpath(os.path.join(os.path.dirname(f), spec.split('?')[0]))
        if not os.path.exists(os.path.join(root, t)): problems.append(f'{f}：import {spec} 的檔案不存在')
        else: deps.append(t)
    for spec in re.findall(r'''new (?:Worker|URL)\(\s*(?:new URL\(\s*)?['"]([^'"]+\.js)[^'"]*['"]''', s):
        t = os.path.normpath(os.path.join(os.path.dirname(f), spec)) if spec.startswith('.') else spec.lstrip('/')
        if not os.path.exists(os.path.join(root, t)) and not os.path.exists(os.path.join(root, spec.lstrip('./'))): problems.append(f'{f}：Worker／URL {spec} 的檔案不存在')
    graph[f] = deps
def closure(entry):
    seen, todo = set(), [entry]
    while todo:
        x = todo.pop()
        if x in seen or x not in graph: continue
        seen.add(x); todo += graph[x]
    return seen
unused = set(js_files)
notes = []
for p in pages:
    s = read(p)
    entries = [e.split('?')[0].lstrip('./') for e in re.findall(r'<script[^>]*type="module"[^>]*src="([^"]+)"', s)]
    mods = set()
    for e in entries: mods |= closure(e)
    unused -= mods
    missing = {}
    for m in sorted(mods):
        js = read(m)
        used = set(re.findall(r'''getElementById\(\s*['"]([^'"]+)['"]\s*\)''', js)) | set(re.findall(r'''querySelector(?:All)?\(\s*['"]#([A-Za-z][\w-]*)['"]\s*\)''', js))
        for i in sorted(used):
            if i not in ids_of[p]: missing.setdefault(i, []).append(m)
    for i, ms in sorted(missing.items()):
        # 這個 id 是不是哪個程式自己建立的（el.id = 'x'、id="x" 寫在樣板字串裡）
        made = any(re.search(r'''id\s*=\s*['"]%s['"]|id="%s"''' % (re.escape(i), re.escape(i)), read(m)) for m in mods)
        (notes if made else problems).append(f'{p}：程式用到 #{i}（{", ".join(ms)}），這一頁的 HTML 沒有' + ('（程式自己建立的）' if made else ''))
for f in sorted(unused):
    if not re.search(r'worker', f): notes.append(f'沒有任何一頁載入：{f}')
# sw.js、manifest
for name in os.listdir(root):
    if name.endswith('.webmanifest') or name == 'manifest.json':
        m = json.loads(read(name))
        for icon in m.get('icons', []):
            if not os.path.exists(os.path.join(root, icon['src'].lstrip('./'))): problems.append(f'{name}：圖示 {icon["src"]} 不存在')
        for key in ('start_url', 'scope'):
            if key in m: notes.append(f'{name}：{key} = {m[key]}')
print('頁面：', ', '.join(pages), '；JS 檔', len(js_files))
print('問題 %d 個：' % len(problems)); [print('  ✗', x) for x in problems]
print('備註 %d 個：' % len(notes)); [print('  ·', x) for x in notes]
