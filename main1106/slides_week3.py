# 11/6 簡報定稿（11/3 提前做）：第 27 頁（第 2 週小結）後面加兩頁：第 28 頁「第 3 週小結（AI 評分模型）」、第 29 頁「重播分析的 AI 判斷（畫面）」，
# 後面的頁碼、目錄、交叉參照 +2；封面、目錄、限制、下一步、結尾、從量到判斷、測試那幾頁跟著改；順便修幾個以前就寫錯的頁碼（講稿裡的中文頁碼）
# 用法：python3 slides_week3.py config.json（PR 範圍、更新次數、日期、截圖、K 的數字，見下面 C[...]）
import sys, json, re, os
C = json.load(open(sys.argv[1], encoding='utf-8'))
R = '/tmp/claude-0/-home-user-claude-workspace/06177a5d-45ba-5b18-b395-0fd8d80e2079/scratchpad/artifact-files/63dcd506-1f69-4626-8893-4641470d279a'
OUT = '/tmp/claude-0/-home-user-claude-workspace/06177a5d-45ba-5b18-b395-0fd8d80e2079/scratchpad/slides1106'
deck = json.load(open(R + '/project/deck.json', encoding='utf-8'))
order = deck['order']
assert order[26] == 'week2' and 'week3' not in order and len(order) == 78
TOTAL_OLD, TOTAL = 78, 80
def shift(n):
    return n + 2 if n >= 28 else n
ZH = '零一二三四五六七八九'
def zh(n):  # 1～99 的中文（講稿裡的頁碼）
    t, o = divmod(n, 10)
    return (('' if t == 1 else ZH[t]) + '十' if t else '') + (ZH[o] if o or not t else '')
assert zh(24) == '二十四' and zh(28) == '二十八' and zh(9) == '九' and zh(10) == '十' and zh(13) == '十三'
def sub1(s, a, b):
    assert s.count(a) == 1, (a[:60], s.count(a))
    return s.replace(a, b)

changed = {}
for i, sid in enumerate(order):
    s = open(f'{R}/project/slides/{sid}.html', encoding='utf-8').read()
    o = s
    s = re.sub(r'>(\d\d) / %d<' % TOTAL_OLD, lambda m: '>%02d / %d<' % (shift(int(m.group(1))), TOTAL), s)
    def ref(m):
        a = int(m.group(1)); b = m.group(3)
        if sid == 'agenda' and a == 24 and b == '27':
            return 'P.24–29'   # 「實測、三週的小結」多了第 28、29 頁
        out = 'P.%02d' % shift(a)
        if b: out += m.group(2) + '%02d' % shift(int(b))
        return out
    s = re.sub(r'P\.(\d+)(–)?(\d+)?', ref, s)
    changed[sid] = s
# 頁尾都改到了（封面沒有頁尾）
for i, sid in enumerate(order):
    if sid != 'cover':
        assert ('>%02d / %d<' % (shift(i + 1), TOTAL)) in changed[sid], sid

card = lambda big, color, text: f'<div style="flex:1;display:flex;flex-direction:column;gap:10px;background:#0E1928;border:1px solid #1F3049;border-radius:20px;padding:24px 28px"><p style="font-family:\'Chakra Petch\', \'Trebuchet MS\', sans-serif;font-size:72px;font-weight:700;line-height:1;color:{color}">{big}</p><p style="font-size:24px;color:#BFD0E0;line-height:1.5">{text}</p></div>'
col = lambda title, text: f'<div style="display:flex;flex-direction:column;gap:6px;border-left:4px solid #4CC3FF;padding:2px 0 2px 20px"><h3 style="font-size:32px;font-weight:900;color:#F2F7FB;line-height:1.3">{title}</h3><p style="font-size:24px;color:#BFD0E0;line-height:1.5">{text}</p></div>'
foot = lambda n: ('<div style="position:absolute;left:128px;bottom:64px;width:1664px;display:flex;flex-direction:row;justify-content:space-between"><p style="font-family:\'JetBrains Mono\', \'Courier New\', monospace;font-size:24px;color:#5F7690">AI 智慧運動分析系統 · 第三次報告</p><p style="font-family:\'JetBrains Mono\', \'Courier New\', monospace;font-size:24px;color:#5F7690">%02d / %d</p></div>\n' % (n, TOTAL))
head = lambda sid: f'<section id="{sid}" data-transition="fade" style="background:#070C16;color:#E8F0F7;font-family:\'Noto Sans TC\', Arial, sans-serif;padding:128px 128px 160px;display:flex;flex-direction:column;gap:40px">\n'

# ---------- 第 28 頁：第 3 週小結（版面和第 1、2 週一樣：四個大數字、三欄、一行出處） ----------
week3 = (head('week3')
    + '<div style="display:flex;flex-direction:column;gap:16px"><p style="font-family:\'JetBrains Mono\', \'Courier New\', monospace;font-size:24px;letter-spacing:6px;color:#FFB547">WEEK 3 · 11/2–11/4 小結</p>'
    '<h2 style="font-size:72px;font-weight:900;line-height:1.15;color:#F2F7FB">AI 評分模型做好了：先用合成資料把流程做通</h2>'
    '<p style="font-size:32px;color:#BFD0E0;line-height:1.4">研究目標 3 的 Random Forest；火柴人的數字只證明流程，真人實測檔來了重新訓練</p></div>'
    '<div style="display:flex;flex-direction:row;gap:24px">'
    + card('98%', '#2EE6A6', 'AI 模型猜對是哪一種（496／504 下；每次留一位受測者當測試）')
    + card('86%', '#2EE6A6', '規則猜對是哪一種（435／504 下；錯得不夠明顯就抓不到）')
    + card('52%', '#FFB547', 'DTW 相似度只分做對、做錯（250／480 下）：看不到上身前傾、腳跟')
    + card('41°', '#2EE6A6', 'AI 自己學到的深蹲上身前傾門檻（我們訂 50°）')
    + '</div><div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:32px">'
    + col('資料（11/2）', '每一下量到的數字＋這組要做的當答案；照受測者分訓練、測試，同一個人不會兩邊都有')
    + col('訓練和比較（11/3）', '100 棵決策樹投票（不用套件）；8 位合成受測者輪流當測試，和規則、DTW 比')
    + col('放進網站（11/4）', '重播分析每一下多一欄「AI 判斷」，和規則不一樣的標藍色；實測報表寫各猜對幾下')
    + '</div><p style="font-family:\'JetBrains Mono\', \'Courier New\', monospace;font-size:24px;color:#8299B2">→ PR #121–#' + C['last_pr'] + ' · 研究成果頁「還沒有的數字」 · docs/roadmap.md 第 61 項</p>\n'
    + foot(28)
    + '<aside>這是第三週的小結，十一月二號到四號，主題是計畫書研究目標三：用 AI 模型判斷動作的品質。前面的錯誤判斷是我們自己訂的門檻，AI 模型則是從資料自己學。'
    '第一步先整理資料：每一下量到的數字，例如最低角度、上身前傾幾度、腳跟離地多少，加上這一組本來要做的動作當答案。'
    '第二步訓練計畫書規劃的 Random Forest，也就是一百棵決策樹投票，猜每一下是做對、還是哪一種錯。十月二十號的實測檔還沒重新傳來，所以先用示範動畫的火柴人做成八位合成的受測者，每個人本來的樣子都不太一樣。'
    '驗證用交叉驗證：每次留一位當測試、用其他七位訓練，輪八次，每一下都被沒看過這個人的模型猜過一次。結果 AI 模型猜對百分之九十八，規則百分之八十六；DTW 相似度只能分做對和做錯，也只有百分之五十二，因為它比的是主要關節的角度曲線，看不到上身前傾、腳跟這些。'
    'AI 模型自己學到的門檻也比我們訂的低，例如深蹲上身前傾大約四十一度，我們訂的是五十度。要強調的是，合成的錯誤很乾淨，這些數字只證明流程是通的，不能當成研究結果；真人的實測檔來了，用同一個指令重新訓練就好。第三步是把模型放進網站，下一頁是畫面。</aside>\n'
    '</section>\n')

# ---------- 第 29 頁：重播分析的 AI 判斷（截圖＋說明） ----------
bullet = lambda title, text: f'<div style="display:flex;flex-direction:column;gap:6px;border-left:4px solid #2EE6A6;padding:2px 0 2px 20px"><h3 style="font-size:32px;font-weight:900;color:#F2F7FB;line-height:1.3">{title}</h3><p style="font-size:24px;color:#BFD0E0;line-height:1.5">{text}</p></div>'
aiscreen = (head('aiscreen')
    + '<div style="display:flex;flex-direction:column;gap:16px"><p style="font-family:\'JetBrains Mono\', \'Courier New\', monospace;font-size:24px;letter-spacing:6px;color:#2EE6A6">AI MODEL · 放進網站（11/4）</p>'
    '<h2 style="font-size:72px;font-weight:900;line-height:1.15;color:#F2F7FB">重播分析：每一下的 AI 判斷，和規則並排</h2>'
    '<p style="font-size:32px;color:#BFD0E0;line-height:1.4">和規則不一樣的那幾下標藍色；畫面上寫明是合成資料訓練的示範</p></div>'
    '<div style="display:flex;flex-direction:row;gap:48px;align-items:start">'
    f'<div style="width:{C["shot_w"]}px;display:flex;flex-direction:column;gap:12px"><img src="{C["shot_blob"]}" alt="{C["shot_alt"]}" style="width:{C["shot_w"]}px;height:{C["shot_h"]}px;object-fit:contain;border-radius:16px;border:2px solid #24405E;background:#0B1220">'
    f'<p style="font-size:24px;color:#8299B2;line-height:1.4">{C["shot_caption"]}</p>'
    '<p style="font-family:\'JetBrains Mono\', \'Courier New\', monospace;font-size:24px;color:#8299B2">→ PR #125 · 使用說明「AI 判斷」</p></div>'
    '<div style="flex:1;display:flex;flex-direction:column;gap:24px">'
    + bullet('AI 判斷（把握）', '一百棵樹投票，括號是投給這個答案的比例；和規則不一樣的標藍色')
    + bullet('實測模式的檔案', C['report_line'])
    + bullet('在手機上算', '模型壓縮後約 8 KB，跟著網站下載；不用連到伺服器，斷網也能用')
    + '</div></div>\n'
    + foot(29)
    + '<aside>' + C['aiscreen_aside'] + '</aside>\n'
    '</section>\n')
changed['week3'] = week3
changed['aiscreen'] = aiscreen

# ---------- 封面 ----------
c = changed['cover']
for a, b in [('第三次進度報告（11/1 更新）', '第三次進度報告（' + C['date'] + ' 更新）'), ('PR #61–#120', 'PR #61–#' + C['last_pr']), ('>60 次更新<', '>' + str(C['updates']) + ' 次更新<'), ('>2026.11.01<', '>' + C['date_long'] + '<'),
             ('這次報告的範圍是上次十月十二號報告之後的 PR 第 61 到 120 號，共 60 次更新，其中十月十九號開始的第一週（第 84 到 103 號）在第二十六頁小結，第二週（第 104 到 120 號）在第二十七頁小結：',
              '這次報告的範圍是上次十月十二號報告之後的 PR 第 61 到 ' + C['last_pr'] + ' 號，共 ' + str(C['updates']) + ' 次更新，其中十月十九號開始的第一週（第 84 到 103 號）在第二十六頁小結，第二週（第 104 到 120 號）在第二十七頁小結，第三週（第 121 到 ' + C['last_pr'] + ' 號）在第二十八頁小結：'),
             ('以及一次完整的地基審查；最後是要請組員實測的事、限制和下一步。', '以及一次完整的地基審查；接著是要請組員實測的事和三週的小結，第三週是 AI 評分模型；最後是限制和下一步。')]:
    c = sub1(c, a, b)
changed['cover'] = c

# ---------- 目錄 ----------
a = changed['agenda']
for x, y in [('<h3 style="font-size:30px;font-weight:900;color:#F2F7FB;line-height:1.3">實測、第 1、2 週小結</h3><p style="font-size:24px;color:#BFD0E0">真手機 4 件事、門檻、第一次實測、進階分析</p>',
              '<h3 style="font-size:30px;font-weight:900;color:#F2F7FB;line-height:1.3">實測、三週的小結</h3><p style="font-size:24px;color:#BFD0E0">真手機 4 件事、門檻、第一次實測、進階分析、AI 模型</p>'),
             ('第二週做完的進階分析（第二週小結）；', '第二週做完的進階分析（第二週小結）、第三週做好的 AI 評分模型（第三週小結）；')]:
    a = sub1(a, x, y)
changed['agenda'] = a

# ---------- 老師的 9 個問題（總覽）：講稿的頁碼（要請組員實測的事在第 24 頁） ----------
changed['fbq'] = sub1(changed['fbq'], '所以請組員實測，在第十三頁說明。', '所以請組員實測，在第' + zh(24) + '頁說明。')

# ---------- 從量到判斷：共同的原則是規則和數學；第 3 週另外有從資料學的 AI 模型 ----------
changed['jq'] = sub1(changed['jq'], '例如上身前傾了幾度、和示範差了幾度。接下來一項一頁。</aside>',
    '例如上身前傾了幾度、和示範差了幾度。第三週另外做了從資料自己學的 AI 模型，拿來和這些規則比，在第' + zh(28) + '頁。接下來一項一頁。</aside>')

# ---------- 運動模式（P.16）：10/19 首頁改版後是「今天要做什麼運動？」四個大按鈕（以前是卡片上的「開始深蹲」） ----------
changed['j1'] = sub1(changed['j1'], '首頁卡片「開始深蹲」或鏡頭畫面右上角選；網站會記住', '首頁「今天要做什麼運動？」直接選，或鏡頭畫面右上角選；網站會記住')
changed['j1'] = sub1(changed['j1'], '現在首頁每張動作卡片多了「開始」按鈕，鏡頭畫面右上角也能換動作，網站會記住。', '現在首頁最上面就是「今天要做什麼運動？」四個大按鈕，按了就開鏡頭；鏡頭畫面右上角也能換動作，網站會記住。')

# ---------- 限制：AI 模型還只用合成資料（跨兩欄放最上面） ----------
l = changed['limits']
l = sub1(l, '<div style="display:grid;grid-template-columns:1fr 1fr;gap:32px">',
    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:32px"><div style="grid-column:1 / -1;display:flex;flex-direction:column;gap:6px;border-left:4px solid #FFB547;padding:4px 0 4px 24px"><h3 style="font-size:32px;font-weight:900;color:#F2F7FB">AI 模型還沒有真人的準確率</h3><p style="font-size:24px;color:#BFD0E0;line-height:1.5">現在是用合成的火柴人訓練的示範，98% 只證明流程是通的；組員的實測檔來了用同一個指令重新訓練（P.28）</p></div>')
l = sub1(l, '<aside>這頁誠實列出目前的限制。', '<aside>這頁誠實列出目前的限制。最上面是新做好的 AI 評分模型：現在是用合成的火柴人訓練的示範，百分之九十八只證明流程是通的，要有組員的實測檔重新訓練，才有能報告的準確率。')
changed['limits'] = l

# ---------- 下一步：第 4 步也打勾，NEXT 加上用真人資料重新訓練 ----------
r = changed['roadmap']
for x, y in [('進階分析做完了，接著是 AI 評分模型', 'AI 評分模型也做好了，接著用真人的資料'),
             ('第 2、3 步已完成（打勾）；11/2～11/4 用錄影訓練 Random Forest', '第 2～4 步都完成（打勾）；AI 模型先用合成資料，真人實測檔來了重新訓練'),
             ('<p style="font-size:24px;color:#BFD0E0;line-height:1.5">量角器對照角度、次數對答案、錯誤和相似度的門檻；照數字調整</p>',
              '<p style="font-size:24px;color:#BFD0E0;line-height:1.5">量角器對照角度、次數對答案、調門檻；用組員的實測檔重新訓練 AI 模型</p>'),
             ('<p style="font-family:\'JetBrains Mono\', \'Courier New\', monospace;font-size:24px;color:#8299B2;padding:2px 0">STEP 4</p>', '<p style="font-family:\'JetBrains Mono\', \'Courier New\', monospace;font-size:24px;color:#2EE6A6;padding:2px 0">STEP 4 ✓</p>'),
             ('<p style="font-size:24px;color:#BFD0E0;line-height:1.5">11/2～11/4：用錄影訓練 Random Forest，和規則、DTW 比較</p>', '<p style="font-size:24px;color:#BFD0E0;line-height:1.5">完成（示範）：Random Forest 放進重播分析，和規則、DTW 比（P.28）</p>'),
             ('下一步是用真人驗證：用量角器對照角度、對次數、調整錯誤和相似度的門檻，照實測數字修正。', '下一步是用真人驗證：用量角器對照角度、對次數、調整錯誤和相似度的門檻，照實測數字修正，也用組員的實測檔重新訓練 AI 模型，算出真人的準確率。'),
             ('接下來十一月二號到四號，用收集到的錄影訓練原本規劃的 Random Forest 評分模型，和規則判斷、DTW 相似度比準確率，再放進重播分析。',
              '第四步的 AI 評分模型，十一月二號到四號也做好了，見第' + zh(28) + '頁：先用合成資料把流程做通，和規則、DTW 比過準確率，也放進重播分析了。')]:
    r = sub1(r, x, y)
changed['roadmap'] = r

# ---------- 結尾：詳細資料從第 33 頁開始（以前寫的「第 29～76 頁」「第 30 頁」是更早的頁碼） ----------
e = changed['end']
for x, y in [('量角器對照、次數對答案、錯誤和相似度的門檻</p>', '量角器對照、次數對答案、調門檻、用真人資料重新訓練 AI 模型</p>'),
             ('第 29～76 頁是詳細資料，老師可以之後慢慢看', '第 %d～%d 頁是詳細資料，老師可以之後慢慢看' % (shift(31), TOTAL)),
             ('還會依每個人校正。', '還會依每個人校正；AI 評分模型也做好了，先用合成資料把流程做通。'),
             ('下一站是真人實測和調整門檻：量角器對照、次數對答案、錯誤和相似度的門檻。', '下一站是真人實測：量角器對照、次數對答案、調整錯誤和相似度的門檻，再用真人的資料重新訓練 AI 模型。'),
             ('後面第 30 頁開始是詳細資料', '後面第 %d 頁開始是詳細資料' % shift(31))]:
    e = sub1(e, x, y)
changed['end'] = e

# ---------- 測試（詳細資料）：專案內的自動測試數量 ----------
t = changed['tests']
t = sub1(t, '另外：專案內 105 項自動測試，每次推送自動跑；', '另外：專案內 ' + str(C['unit']) + ' 項自動測試＋' + str(C['browser']) + ' 項瀏覽器測試，每次推送自動跑；')
t = sub1(t, '十月四號起，專案裡也放了自動測試，目前 105 項，每次把程式推上 GitHub 都會自動跑一次。',
    '十月四號起，專案裡也放了自動測試，目前 ' + str(C['unit']) + ' 項，十月三十號起再加上瀏覽器測試 ' + str(C['browser']) + ' 項，每次把程式推上 GitHub 都會自動跑一次。')
changed['tests'] = t

# ---------- 寫出來：只寫有改的頁、deck.json ----------
os.makedirs(OUT + '/project/slides', exist_ok=True)
n = 0
for sid, s in changed.items():
    orig_path = f'{R}/project/slides/{sid}.html'
    if os.path.exists(orig_path) and open(orig_path, encoding='utf-8').read() == s:
        continue
    open(f'{OUT}/project/slides/{sid}.html', 'w', encoding='utf-8').write(s)
    n += 1
k = order.index('week2') + 1
deck['order'][k:k] = ['week3', 'aiscreen']
deck['sections']['s3']['description'] = '要請組員實測的事、第 1 週小結（第一次真人實測）、第 2 週小結（進階分析）、第 3 週小結（AI 評分模型）、限制與下一步'
json.dump(deck, open(OUT + '/project/deck.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=2)
print('寫好：', n, '頁＋deck.json；共', len(deck['order']), '頁')
