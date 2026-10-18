import json, re, sys, os
R = sys.argv[1] + '/project'; S = R + '/slides/'
def rd(n): return open(S + n + '.html', encoding='utf8').read()
def wr(n, t): open(S + n + '.html', 'w', encoding='utf8').write(t)
def rep(t, a, b, c=1):
    assert t.count(a) == c, (a, t.count(a)); return t.replace(a, b)
def aside(t, s):
    t2, k = re.subn(r'<aside>.*?</aside>', '<aside>' + s + '</aside>', t, flags=re.S); assert k == 1; return t2
def drop_row(t, pr, what):
    pat = r'<tr><td><span style="color:#2EE6A6">' + re.escape(pr) + r'</span></td><td>' + re.escape(what) + r'</td>.*?</tr>'
    t2, k = re.subn(pat, '', t, flags=re.S); assert k == 1, (pr, what, k); return t2
NOTE = '<p style="font-size:24px;color:#8299B2;line-height:1.5">已在第一部分說明，這裡不重複：{}</p>'
def pr(n): return '<span style="color:#2EE6A6">' + n + '</span>'
def add_note(t, items):
    return rep(t, '</table>', '</table>' + NOTE.format('　'.join(items)))

# 第 2 階段
t = rd('phase2')
t = drop_row(t, '#16', '清晰的編號標籤、點選任一點'); t = drop_row(t, '#17', '運動時螢幕保持亮著')
t = add_note(t, [pr('#16') + ' 編號標籤 → P.17', pr('#17') + ' 螢幕保持亮著 → P.18'])
wr('phase2', t)

# 第 3 階段
t = rd('phase3')
for a, b in [('#20–21', '分階段進度條'), ('#23', '點平滑、線條清晰'), ('#25', '數據面板、錄製匯出')]:
    t = drop_row(t, a, b)
t = add_note(t, [pr('#20–21') + ' Mac 停在 96% → P.16、P.18', pr('#23') + ' 點平滑 → P.18', pr('#25') + ' 數據錄製 → P.06'])
t = aside(t, '第三階段是第一輪用真實裝置測試後的修正。靠近鏡頭時會出現 AI 猜出來的手腳，改成只畫看得到的點；同時完成入鏡提示和關節角度。Mac 停在百分之九十六、點會抖動、數據錄製這三項，已經在第一部分說明，這裡只列出 PR 編號。')
wr('phase3', t)

# 第 4、5 階段合成一頁
t = rd('phase4')
t = rep(t, '>PHASE 4 · 10/1<', '>PHASE 4–5 · 10/1<')
t = rep(t, '>全面審查與重新設計<', '>全面審查、穩定性與第二輪回饋<')
t = drop_row(t, '#29', '降低延遲、臉部點加大')
t = rep(t, '<td>視覺重新設計、大字儀表板</td><td>介面太單調；站遠看不到字</td><td>深色主題、大字角度、大字提示</td>',
        '<td>視覺重新設計</td><td>介面太單調，看起來像一般網頁</td><td>深色主題、首頁加上深蹲示意圖與功能介紹</td>')
p5 = rd('phase5')
for n, what in [('#32', '載入自動重試、鍵盤操作'), ('#34', '擋掉鬼點')]:
    row = re.search(r'<tr><td><span style="color:#2EE6A6">' + n + r'</span></td><td>' + re.escape(what) + r'</td>.*?</tr>', p5, flags=re.S).group(0)
    t = rep(t, '</table>', row + '</table>')
t = add_note(t, [pr('#29') + ' 降低延遲 → P.18', pr('#31') + ' GPU 自動恢復 → P.04', pr('#33') + ' 大字儀表板 → P.17'])
t = aside(t, '第四、五階段都在十月一號。功能變多之後，我們做了一次全面審查，找出並修正 12 個問題，例如側面拍攝時被誤判成看不到腳，也把介面重新設計成深色主題。接著設計了十五種以上的壓力情境，發現網路斷一下 AI 就永久不能用，改成自動重試；朋友實測發現點偶爾亂跳，加上擋鬼點的檢查。降低延遲、GPU 自動恢復和大字儀表板，已經在第一部分說明。')
wr('phase4', t)

# 保養②
t = rd('phase7')
t = drop_row(t, '#42', 'AI 改在背景執行緒運算'); t = drop_row(t, '#43', '離線使用')
t = add_note(t, [pr('#42') + ' AI 改在背景執行緒 → P.18', pr('#43') + ' 離線使用 → P.18'])
t = aside(t, '第二類是順暢度。骨架往前預測，讓骨架不再拖在身體後面；重播分析頁的圖表和公尺座標的運算也都加快了，結果完全相同。AI 搬到背景執行緒、離線使用這兩項，已經在第一部分說明。')
wr('phase7', t)

# 保養③（原④）
t = rd('phase9')
t = rep(t, '>保養④：使用體驗<', '>保養③：使用體驗<')
t = drop_row(t, '#49', '手機門檻檢查')
t = rep(t, '<td>三頁共用導覽列；手機數據面板可以收合</td>', '<td>三頁共用導覽列；新增使用說明頁</td>')
t = add_note(t, [pr('#49') + ' 手機門檻檢查 → P.18'])
t = aside(t, '第三類是使用體驗，大多來自組員和朋友的回饋。例如有人以為首頁的圖不會動是網站壞了，我們就讓它真的動起來；一個人錄影時來不及走到定位，就加上倒數和提示音；也新增了導覽列和使用說明頁。舊手機的門檻檢查已經在第一部分說明。')
wr('phase9', t)

# 保養④（原⑤）
t = rd('phase10'); t = rep(t, '>保養⑤：程式碼整理<', '>保養④：程式碼整理<'); wr('phase10', t)

# 時間軸：講過的指到第一部分
t = rd('timeline')
t = rep(t, '<p style="font-size:24px;color:#BFD0E0;line-height:1.5">Q1～Q3、手機版面</p>', '<p style="font-size:24px;color:#BFD0E0;line-height:1.5">已在第一部分說明（P.03–09、P.17）</p>')
t = rep(t, '<p style="font-size:24px;color:#BFD0E0;line-height:1.5">穩定、順暢、驗證工具、程式整理、真實錄影</p>', '<p style="font-size:24px;color:#BFD0E0;line-height:1.5">穩定、順暢、使用體驗、程式整理；驗證工具、真實錄影見第一部分</p>')
t = rep(t, '<div style="flex:1"></div>\n<div style="position:absolute', '<div style="flex:1"></div><p style="font-size:24px;color:#8299B2;line-height:1.5">第一部分已經說明的更新，後面幾頁只標 PR 編號和頁碼，不重複內容</p>\n<div style="position:absolute')
t = aside(t, '54 次更新可以分成六個階段。第一階段回答老師的問題，第六階段的驗證工具和真人錄影，都已經在第一部分說明；後面幾頁只列出第一部分沒有講到的更新，講過的只標 PR 編號和頁碼，不會再講一次。')
wr('timeline', t)

# 測試：真人錄影交給第一部分
t = rd('tests')
t = rep(t, '另外：專案內 32 項自動測試，每次推送自動跑；並用 7 段真人錄影（Android、筆電、iPhone、iPad）檢查', '另外：專案內 32 項自動測試，每次推送自動跑；真人錄影的檢查見 P.10–15')
t = rep(t, '另外也請朋友用手機實際操作，提出的五項回饋都已處理。', '')
t = rep(t, '十月五號起也用朋友在 Android 手機、筆電、iPhone、iPad 錄的七段真人錄影檢查，找到的問題都加成自動測試，以後不會再壞。', '真人錄影的檢查在第一部分說明。')
wr('tests', t)

# 資料格式：第 6 頁回答 Q5，這頁只放欄位與範例
t = rd('code-data')
t = rep(t, '>錄製資料的格式（老師 Q5）<', '>錄製資料的格式：欄位與範例<')
t = rep(t, '這是老師第五題的資料格式。', '這是錄製資料實際的欄位和範例，老師第五題的回覆在第六頁。')
wr('code-data', t)

# 第一部分指到第二部分的頁碼
for n, a, b in [('q1', '→ P.18 跑得動、等得少 · P.51 AI 載入', '→ P.18 跑得動、等得少 · P.46 AI 載入（程式）'),
                ('q2', '→ P.32 回答老師的問題 · P.55 實際畫面', '→ P.17 看得清楚、按得到 · P.43 landmarks.js'),
                ('q5', '→ P.52 錄製資料的格式', '→ P.47 錄製資料的格式'),
                ('q3', '→ P.20 下一步 · P.39 驗證工具（深蹲實驗）', '→ P.20 下一步 · P.41 關節角度怎麼算'),
                ('q6', '→ P.11–15 真人實測 · P.39 驗證工具', '→ P.11–15 真人實測 · P.51 角度為什麼用 2D'),
                ('q4', '→ P.54 開發用的網址參數', '→ P.49 開發用的網址參數')]:
    t = rd(n); t = rep(t, a, b); wr(n, t)
for n in ['agenda', 'appendix']:
    t = rd(n)
    for a, b in [('P.30–43', 'P.30–38'), ('P.44–54', 'P.39–49'), ('P.55–59', 'P.50–53')]:
        t = rep(t, '>' + a + '<', '>' + b + '<')
    wr(n, t)
t = rd('end'); t = rep(t, '第 22～59 頁是詳細資料', '第 22～53 頁是詳細資料'); wr('end', t)

removed = ['phase1', 'phase5', 'phase8', 'phase11', 'phase12', 'live']
d = json.load(open(R + '/deck.json', encoding='utf8'))
order = [n for n in d['order'] if n not in removed]
assert len(order) == 53, len(order)
d['order'] = order
d['sections']['s10']['start'] = 'ghost'
for s in d['sections'].values(): assert s['start'] in order, s
open(R + '/deck.json', 'w', encoding='utf8').write(json.dumps(d, ensure_ascii=False, indent=2))
for n in removed: os.remove(S + n + '.html')
for i, n in enumerate(order, 1):
    t = rd(n)
    t, k = re.subn(r'>\d\d / \d\d<', '>%02d / 53<' % i, t)
    assert k == (0 if n == 'cover' else 1), (n, k)
    wr(n, t)
print('ok', len(order), order.index('appendix') + 1)
