# 簡報 v13：第三次報告
#   頁尾「第二批次」→「第三次報告」
#   第一部分新增：組員 10/13 的想法「網站自己看手機能力調整」2 頁、「從量到判斷」7 頁、「要靠真人調整的門檻」1 頁
#   更新封面、目錄、真手機確認、限制、下一步、結尾；附錄的更新歷程、測試數字、檔案地圖、網址參數
# 用法：python3 deck_v13_build.py <簡報資料夾> <圖片對照 json：名稱 → 網址或本機檔案> <數字 json>
import json, re, sys, base64, os
R = sys.argv[1] + '/project'; S = R + '/slides/'
IMGMAP = json.load(open(sys.argv[2]))
NUMS = json.load(open(sys.argv[3]))
def rd(n): return open(S + n + '.html', encoding='utf8').read()
def wr(n, t): open(S + n + '.html', 'w', encoding='utf8').write(t)
def rep(t, a, b, c=1):
    assert t.count(a) == c, (a[:80], t.count(a)); return t.replace(a, b)
def aside(t, s):
    t2, k = re.subn(r'<aside>.*?</aside>', '<aside>' + s + '</aside>', t, flags=re.S); assert k == 1; return t2
def src(name):
    v = IMGMAP[name]
    if v.startswith('/_blob/') or v.startswith('http'): return v
    return 'data:image/png;base64,' + base64.b64encode(open(v, 'rb').read()).decode()

MONO = "font-family:'JetBrains Mono', 'Courier New', monospace"
NUM = "font-family:'Chakra Petch', 'Trebuchet MS', sans-serif"
G, B, Y, RD, MUTED = '#2EE6A6', '#4CC3FF', '#FFB547', '#FF5A5F', '#8299B2'
SEC = "background:#070C16;color:#E8F0F7;font-family:'Noto Sans TC', Arial, sans-serif;padding:128px 128px 160px;display:flex;flex-direction:column;gap:40px"
FOOT = ('<div style="position:absolute;left:128px;bottom:64px;width:1664px;display:flex;flex-direction:row;justify-content:space-between">'
        '<p style="' + MONO + ';font-size:24px;color:#5F7690">AI 智慧運動分析系統 · 第三次報告</p>'
        '<p style="' + MONO + ';font-size:24px;color:#5F7690">00 / 00</p></div>')

def head(eyebrow, title, sub=None, badge=None, color=G, bg='#103A2D'):
    b = f'<p style="font-size:24px;font-weight:700;color:{color};background:{bg};border-radius:999px;padding:4px 18px">{badge}</p>' if badge else ''
    return ('<div style="display:flex;flex-direction:column;gap:16px"><div style="display:flex;flex-direction:row;gap:20px;align-items:center">'
            f'<p style="{MONO};font-size:24px;letter-spacing:6px;color:{color}">{eyebrow}</p>{b}</div>'
            f'<h2 style="font-size:72px;font-weight:900;line-height:1.15;color:#F2F7FB">{title}</h2>'
            + (f'<p style="font-size:32px;color:#BFD0E0;line-height:1.4">{sub}</p>' if sub else '') + '</div>')
def item(h, p, color=G):
    return (f'<div style="display:flex;flex-direction:column;gap:6px;border-left:4px solid {color};padding:2px 0 2px 20px">'
            f'<h3 style="font-size:32px;font-weight:900;color:#F2F7FB;line-height:1.3">{h}</h3>'
            f'<p style="font-size:24px;color:#BFD0E0;line-height:1.5">{p}</p></div>')
def label(s, color=G):
    return f'<p style="{MONO};font-size:24px;letter-spacing:4px;color:{color}">{s}</p>'
def ref(s):
    return f'<p style="{MONO};font-size:24px;color:{MUTED}">{s}</p>'
def img(name, alt, w, h, cap, bg='#000000'):
    return (f'<div style="width:{w}px;display:flex;flex-direction:column;gap:12px">'
            f'<img src="{src(name)}" alt="{alt}" style="width:{w}px;height:{h}px;object-fit:contain;border-radius:16px;border:2px solid #24405E;background:{bg}">'
            f'<p style="font-size:24px;color:{MUTED};line-height:1.4">{cap}</p></div>')
def card(h, p, tag='', color=G, border='#1F3049'):
    return (f'<div style="display:flex;flex-direction:column;gap:8px;background:#0E1928;border:1px solid {border};border-radius:20px;padding:20px 28px">'
            '<div style="display:flex;flex-direction:row;align-items:baseline;gap:12px">'
            f'<h3 style="flex:1;font-size:32px;font-weight:900;color:#F2F7FB;line-height:1.3">{h}</h3>'
            f'<p style="{MONO};font-size:24px;color:{color};white-space:nowrap">{tag}</p></div>'
            f'<p style="font-size:24px;color:#BFD0E0;line-height:1.5">{p}</p></div>')
def table(heads, rows, widths, color=B, size=24):
    t = f'<table style="font-size:{size}px;color:#BFD0E0;font-family:\'Noto Sans TC\', Arial, sans-serif"><tr>'
    t += ''.join(f'<th style="width:{w}%;color:{color}">{h}</th>' for h, w in zip(heads, widths)) + '</tr>'
    for r in rows:
        t += '<tr>' + ''.join((f'<td style="color:#F2F7FB"><b>{c}</b></td>' if i == 0 else f'<td>{c}</td>') for i, c in enumerate(r)) + '</tr>'
    return t + '</table>'
def slide(sid, body, notes, transition='fade', style=SEC):
    return f'<section id="{sid}" data-transition="{transition}" style="{style}">\n{body}\n{FOOT}\n<aside>{notes}</aside>\n</section>\n'
ROW = lambda gap=48, align='start': f'<div style="display:flex;flex-direction:row;gap:{gap}px;align-items:{align}">'
COL = lambda gap=24, w=None: f'<div style="{"width:%dpx" % w if w else "flex:1"};display:flex;flex-direction:column;gap:{gap}px">'

# ======================= 第一部分新增：組員 10/13 的想法 =======================
wr('adq', slide('adq', head('ADAPTIVE · 組員 10/13 的想法', '網站自己看這支手機的能力，自動調整',
                            '每支手機的鏡頭、運算速度、環境光線都不一樣，不能全部用同一套設定', '完成') +
    ROW(40) + '<div style="flex:1;display:grid;grid-template-columns:1fr 1fr;gap:20px">' +
    card('量速度、給建議', '開鏡頭約 10 秒後量 AI 每格幾毫秒；跟不上就建議改回，有餘裕建議升級', '#69') +
    card('自動調每秒格數', '「畫面流暢度」選自動：有餘裕升到 60 格，跟不上自動降回 30', '#70') +
    card('自動選模型', '「AI 模型」選自動：先用比較準的 full，跟不上改用 lite 並記住', '#71') +
    card('光線太暗提醒', '每秒量畫面亮度，連續 3 秒太暗就提醒開燈', '#72') + '</div>' +
    COL(20, 640) +
    img('auto', '鏡頭畫面上方：運算標籤「CPU · 鏡頭 30 · AI 28 FPS」，旁邊說明「自動調整：AI 還有餘裕，改成每秒 60 格」', 640, 60, '自動升格時畫面上的說明（測試環境）') +
    img('advice', '速度建議小卡：AI 每格只要 8 毫秒，還很有餘裕，可以試試比較準的 full 模型（多下載 3.6 MB，換的時候畫面停 1～2 秒）；按鈕「試試 full」「不用了」', 640, 220, '速度建議：只建議，按了才換') + '</div></div>' +
    '<p style="font-size:24px;color:#BFD0E0;line-height:1.5;border-top:1px solid #1F3049;padding:20px 0 0">'
    f'<b style="color:{B}">螢幕 165 Hz ≠ 每秒 165 格：</b>每秒格數由鏡頭決定，大部分手機、筆電鏡頭最多 30 格；運算標籤會寫「鏡頭最多幾格」（#68）</p>',
    '接下來是組員十月十三號提的想法：能不能讓網站自己看這支手機的能力，自動調整每秒格數、模型這些設定，做到每個人都客製。我們分成四件事做。第一，速度建議：開鏡頭、站進畫面大約十秒後，網站量 AI 每一格算幾毫秒，跟不上鏡頭就建議改回三十格或比較快的 lite 模型，有餘裕就建議試試比較準的 full 模型或六十格；只建議，按了才換。第二，畫面流暢度選「自動」時，網站自己升降每秒格數。第三，AI 模型選「自動」時，先用比較準的 full，量完跟不上就改用 lite，並記在這台手機上。第四，光線太暗時提醒開燈，因為暗的時候 AI 容易找不到人，鏡頭也會拉長曝光、每秒格數變少。最下面一行回答組員問過的問題：螢幕一百六十五赫茲，不代表鏡頭能給一百六十五格，每秒格數是由鏡頭決定的，大部分鏡頭最多三十格，運算標籤點開就看得到這顆鏡頭最多幾格。'))

wr('adhow', slide('adhow', head('ADAPTIVE · 怎麼決定', '先量 8 秒再決定，而且不會一直跳', '剛開鏡頭的幾秒 AI 和鏡頭都比較慢，量太早會判斷錯') +
    '<div style="display:flex;flex-direction:row;gap:16px;align-items:stretch">' +
    ''.join(
        f'<div style="flex:1;display:flex;flex-direction:column;gap:6px;background:#0E1928;border:1px solid {bd};border-radius:20px;padding:18px 24px">'
        f'<p style="{NUM};font-size:32px;font-weight:700;color:{c};line-height:1">{n}</p>'
        f'<h3 style="font-size:28px;font-weight:900;color:#F2F7FB;line-height:1.3">{h}</h3><p style="font-size:24px;color:#BFD0E0;line-height:1.4">{p}</p></div>'
        + (f'<p style="{NUM};font-size:48px;color:{G};align-self:center">→</p>' if n != '4' else '')
        for n, h, p, c, bd in [('1', '站進畫面', '畫面裡有人才開始算', B, '#1F3049'), ('2', '暖機 3 秒', '這幾秒比較慢，不算', B, '#1F3049'),
                              ('3', '量 8 秒', '每格幾毫秒、每秒幾格，取中位數', B, '#1F3049'), ('4', '決定', '跟不上就降，有餘裕才升', G, '#1D6B52')]) + '</div>' +
    table(['項目', '有餘裕', '跟不上（或太暗）'], [
        ['每秒格數（自動）', 'AI 每格在 16.7 毫秒的 60% 以內 → 升到 60 格', '最近 10 秒有 8 秒 AI 跟不上鏡頭的 85% → 降回 30'],
        ['AI 模型（自動）', '先用比較準的 full', '量完跟不上 → 改用 lite，記在這台手機'],
        ['速度建議', '建議試試 full 或 60 格', '建議改回 30 格或 lite'],
        ['光線', '亮度回到 60 以上，提醒收起來', '連續 3 秒亮度低於 45（0～255）→ 提醒開燈']], [22, 39, 39]) +
    '<p style="font-size:24px;color:#BFD0E0;line-height:1.5">降得快、升得慢（60 秒都有餘裕才再升，降過 2 次就不再試）；錄製中不換；解析度維持 640×480（AI 只看 256×256）</p>',
    '這頁說明網站怎麼決定。最怕的是量錯和一直跳。剛開鏡頭的前幾秒，AI 在暖機、鏡頭在調整曝光，都比較慢，所以先等三秒，再量八秒，而且取中位數，偶爾一格特別慢不會影響結果。判斷的標準在下面的表：AI 每秒算的格數，到不到鏡頭送來的百分之八十五，決定跟不跟得上；每一格的時間在一格時間的百分之六十以內才算有餘裕，留空間給手機發燙降速。為了不一直跳，設計成降得快、升得慢：六十格時最近十秒有八秒跟不上就降，三十格時要連續六十秒都有餘裕才再試一次，降過兩次就不再試。錄製中不換，錄下來的數據才能比較。另外解析度我們刻意不自動調：AI 模型只看 256 乘 256 的畫面，解析度調高不會更準，只會更慢。這些門檻都是先訂的估計值，要照組員各種手機的實測數字調整。'))

# ======================= 第一部分新增：從量到判斷 =======================
JQ = [('運動模式＋計次', '深蹲、伏地挺身、弓箭步計次，棒式計時', '#73', 'j1'),
      ('錯誤判斷', '6 種常見錯誤：骨架標紅、紅字、語音提醒', '#74', 'j2'),
      ('運動總結', '做完看次數、深度、錯誤，和上一次比較', '#75', 'j3'),
      ('驗證工具', '量角器對照算誤差；重播分析逐下對答案', '#76', 'j4'),
      ('動作相似度', '和示範動作比對（DTW），每一下 0～100 分', '#77', 'j5'),
      ('個人校正', '側身站直 2 秒，門檻依每個人調整', '#78', 'j6'),
      ('首頁整理', '每秒格數、AI 模型收進「進階設定」；語音可以關', '#79', None)]
cards = ''.join(card(h, p, tag + (' · P.@%s@' % sid if sid else '')) for h, p, tag, sid in JQ)
cards += ('<div style="display:flex;flex-direction:column;gap:8px;background:#0B2233;border:1px solid #24405E;border-radius:20px;padding:20px 28px">'
          f'<h3 style="font-size:32px;font-weight:900;color:{B};line-height:1.3">共同的原則</h3>'
          '<p style="font-size:24px;color:#BFD0E0;line-height:1.5">都用規則和數學算，不用訓練資料：每個判斷都說得出原因、差幾度</p></div>')
wr('jq', slide('jq', head('JUDGE · 第三層「判斷得出」', '從「量」到「判斷」：這次新增 7 項', '以前只量得到角度；現在會計次、抓錯誤、給分數，還會依每個人調整') +
    f'<div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:20px">{cards}</div>',
    '接下來是這次最大的改變。系統分成三層：看得到、量得到、判斷得出。上次報告時前兩層完成，第三層只有藏起來的深蹲次數原型。這次把第三層補起來，新增七項：四個動作都會計次或計時、六種常見錯誤會標紅並用語音提醒、做完有運動總結和上一次比較、有驗證工具可以用量角器對答案、每一下會和示範動作比對給分數、會依每個人站直的樣子自動校正，最後把首頁整理得簡單一點。這些判斷都是用規則和數學算的，不需要先收集訓練資料，每個判斷都說得出原因，例如上身前傾了幾度、和示範差了幾度。接下來一項一頁。'))

wr('j1', slide('j1', head('JUDGE · 運動模式（#73）', '選動作，四個動作都會算', '首頁卡片「開始深蹲」或鏡頭畫面右上角選；網站會記住') +
    ROW(48) + img('squat', '鏡頭畫面：深蹲模式，左右膝、髖的大字儀表板，右下角深蹲次數', 820, 513, '深蹲模式：右下角是次數（測試畫面：示範動畫的骨架）') +
    COL(24) + table(['動作', '看哪個角度', '到位'], [
        ['深蹲', '膝蓋', '90° 以下'],
        ['伏地挺身', '手肘（要趴著）', '95° 以下'],
        ['弓箭步', '兩腳膝蓋，取彎得少的', '前後都 100° 以下'],
        ['棒式', '肩、髖、膝一直線', '髖 160° 以上時計時']], [24, 42, 34]) +
    item('一下怎麼算', '伸直 → 彎下去 → 伸直；太快（不到 0.5 秒）不算；正面拍時提示側身，不亂算') +
    ref('→ 錄製檔記下選的動作') + '</div></div>',
    '第一項是運動模式。以前只有深蹲會算次數，而且藏在實驗網址；伏地挺身、棒式、弓箭步只有示範動畫。現在首頁每張動作卡片多了「開始」按鈕，鏡頭畫面右上角也能換動作，網站會記住。深蹲看膝蓋，蹲到九十度以下算到位；伏地挺身看手肘，要趴著才算；弓箭步看兩腳的膝蓋，取彎得比較少的那一腳，前後腳都要彎到一百度以下；棒式在肩、髖、膝一直線時計時，屁股翹起來或塌下去會暫停。一下的定義是伸直、彎下去、再伸直，太快的不算；正面拍時角度不準，網站會提示側身，不會亂算。左邊的截圖是測試畫面，骨架是示範動畫做成的假資料，用來確認次數算得對；真人實測要請組員做。'))

wr('j2', slide('j2', head('JUDGE · 錯誤判斷（#74）', '做錯時：骨架標紅、紅字、語音提醒', '都是側面看得出來的錯誤；持續 0.4 秒才出現，偵測跳一下不會誤報') +
    ROW(48) + img('form', '鏡頭畫面：伏地挺身腰塌下去，身體的線變成粗紅線，上方紅字「腰塌下去了，收緊腹部」', 760, 475, '伏地挺身腰塌下去：軀幹和大腿標紅（測試畫面）') +
    COL(20) + table(['動作', '錯誤', '門檻'], [
        ['深蹲', '上身太前傾', '上身和垂直線 > 50°'],
        ['深蹲', '腳跟離地', '腳跟比腳尖高 > 小腿的 25%'],
        ['伏地挺身、棒式', '腰塌下去', '髖部離肩到腳踝的直線 > 7%'],
        ['伏地挺身、棒式', '屁股太高', '高出直線 > 9%'],
        ['弓箭步', '上身前傾', '> 30°'],
        ['弓箭步', '前膝超過腳尖', '> 小腿的 10%']], [30, 30, 40], size=24) +
    '<p style="font-size:24px;color:#BFD0E0;line-height:1.5">語音用瀏覽器內建的中文語音，不用下載；同一句 6 秒內不重複。每一下的提示也寫出錯誤，例如「第 3 下 · 88° 蹲到位 · 上身前傾」</p>' +
    ref('膝蓋內夾、左右不平衡要正面拍才看得到，先不判斷') + '</div></div>',
    '第二項是錯誤判斷，也就是上上次老師問的「把有問題的部位標出來」。我們挑了六種從側面看得出來的常見錯誤：深蹲的上身太前傾和腳跟離地，伏地挺身和棒式的腰塌下去和屁股太高，弓箭步的上身前傾和前膝超過腳尖。偵測到時，做錯的部位畫成粗紅線，畫面上方出現紅字，再用瀏覽器內建的中文語音唸出來，人站在兩三公尺外看不清楚螢幕也聽得到。為了不誤報，錯誤要持續零點四秒才出現、恢復零點六秒才收起來；而且只在動作進行中檢查，例如蹲下去時才看上身前傾。右邊是目前的門檻，都是依一般健身教學先訂的，要請組員實際做做看再調整。膝蓋內夾、左右不平衡要正面拍才看得到，網站要求側面拍，所以先不判斷。'))

wr('j3', slide('j3', head('JUDGE · 運動總結（#75）', '做完看成果，和上一次比較', '關鏡頭、換動作、關網頁時，首頁出現「這次運動」') +
    ROW(56) + img('summary', '首頁「這次運動」：深蹲 4 下，到位 3、再低一點 1，最低 85 度、平均 91 度，和示範動作相似 92%，比上次多 1 下；下面是運動紀錄', 420, 500, '首頁的「這次運動」和「運動紀錄」', bg='#0B1220') +
    COL(28) +
    item('這次做得怎麼樣', '次數、到位／再低一點／太淺各幾下、最低和平均角度、每下幾秒、和示範動作平均相似度、每種錯誤幾下') +
    item('和上一次比', '「比上次多 2 下」「到位比例 80%，比上次進步 20%」：看得到進步，才會想繼續練') +
    item('紀錄存在這台手機', '最近 10 次列在「運動紀錄」，最多存 50 次、可以清除，不會上傳；後端做好之前先這樣用', B) +
    ref('→ 換鏡頭、換每秒格數時，只作廢做到一半的那一下') + '</div></div>',
    '第三項是運動總結。做完運動要看得到成果，才會想繼續練，組員實測時也方便對答案。關鏡頭、換動作或關網頁時，首頁會出現「這次運動」：做了幾下、到位和太淺各幾下、最低和平均角度、每一下花幾秒、和示範動作的平均相似度，以及每種錯誤出現幾下。如果之前做過同一個動作，會和上一次比較，例如比上次多兩下、到位比例進步多少。最近十次列在「運動紀錄」，存在這台手機裡，不會上傳。簡報原本規劃的歷史紀錄要等後端和資料庫，在那之前先用這個方式。'))

wr('j4', slide('j4', head('VALIDATION · 驗證工具（#76）', '準不準？用量角器對答案', '老師一定會問「準不準」：工具做好了，等組員實測填數字') +
    ROW(48) + COL(20, 700) +
    ''.join(f'<div style="display:flex;flex-direction:row;gap:20px;align-items:start"><p style="{NUM};font-size:44px;font-weight:700;color:{G};line-height:1;width:48px">{n}</p>'
            f'<div style="flex:1;display:flex;flex-direction:column;gap:4px"><h3 style="font-size:32px;font-weight:900;color:#F2F7FB;line-height:1.3">{h}</h3>'
            f'<p style="font-size:24px;color:#BFD0E0;line-height:1.5">{p}</p></div></div>'
            for n, h, p in [('1', '擺姿勢不動，按「記下角度」', '鏡頭畫面的數據面板；一個人量、一個人按'),
                            ('2', '量角器量同一個關節', '例如髖 → 膝 → 踝的夾角'),
                            ('3', '使用說明頁填進表格', '自動算平均誤差、偏差、標準差、±5°／±10° 以內的比例；可下載 CSV 放進報告')]) +
    item('實驗 B：次數對答案', '錄影丟進重播分析，四個動作逐下列出角度、判斷、錯誤、相似度，和自己數的比對', B) + '</div>' +
    img('validate', '使用說明頁的驗證實驗 A 表格：每一筆網站角度、量角器角度、差距，下面是平均誤差和 ±5 度以內的比例', 916, 520, '使用說明「驗證實驗 A」（填了示範數字）', bg='#0B1220') + '</div>',
    '第四項是驗證工具。老師一定會問網站算的角度準不準，所以要有數字。做法分三步：先擺一個姿勢不動，例如蹲到一半停住，一個人用量角器量膝蓋，另一個人在鏡頭畫面的數據面板按「記下角度」；做完後到使用說明頁的「驗證實驗 A」，把量角器的角度填進表格，網站馬上算出平均誤差、是不是固定偏大或偏小、標準差，以及誤差在正負五度、十度以內的比例，還可以下載成 CSV 放進報告。實驗 B 是次數對答案：把錄影丟進重播分析頁，四個動作都會逐下列出角度、判斷、錯誤和相似度，和自己數的比對。重播分析和鏡頭畫面用的是同一套計算，所以重播的結果就是當時畫面上的結果。右邊的表格填的是示範數字，真正的數字要等組員實測。'))

# 相似度示意圖：標準曲線（綠）和使用者的曲線（藍，比較慢、底部停比較久、蹲得比較淺），灰線是 DTW 對齊
DTW = json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'dtw_demo.json')))
def dtw_svg(a, b, path, W=900, H=430):
    pad_l, pad_r, top_a, h_a, gap = 80, 20, 20, 170, 50
    top_b = top_a + h_a + gap
    lo, hi = 70, 175
    xa = lambda i, n: pad_l + (W - pad_l - pad_r) * i / (n - 1)
    ya = lambda v, top: top + h_a * (hi - v) / (hi - lo)
    lines = ''.join(f'<line x1="{xa(i, len(a)):.1f}" y1="{ya(a[i], top_a):.1f}" x2="{xa(j, len(b)):.1f}" y2="{ya(b[j], top_b):.1f}" stroke="#5F7690" stroke-width="1.5" opacity="0.55"/>'
                    for k, (i, j) in enumerate(path) if k % 2 == 0)
    pa = ' '.join(f'{xa(i, len(a)):.1f},{ya(v, top_a):.1f}' for i, v in enumerate(a))
    pb = ' '.join(f'{xa(i, len(b)):.1f},{ya(v, top_b):.1f}' for i, v in enumerate(b))
    txt = lambda x, y, s, c: f'<text x="{x}" y="{y}" fill="{c}" font-size="24" font-family="Noto Sans TC, sans-serif" font-weight="700">{s}</text>'
    return (f'<svg width="{W}" height="{H}" viewBox="0 0 {W} {H}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="DTW 對齊示意">'
            + lines + f'<polyline points="{pa}" fill="none" stroke="{G}" stroke-width="5" stroke-linejoin="round"/>'
            + f'<polyline points="{pb}" fill="none" stroke="{B}" stroke-width="5" stroke-linejoin="round"/>'
            + txt(0, top_a + 30, '示範', G) + txt(0, top_b + 30, '這一下', B)
            + txt(0, top_a + h_a - 6, '', MUTED) + '</svg>')
svg = dtw_svg(DTW['template'], DTW['user'], DTW['path'])
wr('j5', slide('j5', head('AI · 動作相似度（#77）', '和示範動作比對：每一下 0～100 分', '動態時間校正（DTW）：做得快慢不同也能對齊，再看每一點差幾度') +
    ROW(48) + COL(12, 900) + f'<div style="background:#0B1220;border:2px solid #24405E;border-radius:16px;padding:20px 24px">{svg}</div>' +
    f'<p style="font-size:24px;color:{MUTED};line-height:1.4">深蹲的膝蓋角度：這一下比較慢、底部停比較久、蹲到 {DTW["min"]}°（示範 {DTW["tmin"]}°）；灰線是 DTW 找到的對應點，{DTW["score"]} 分</p></div>' +
    COL(24) + table(['這一下', '分數'], [['標準的一下', '約 97'], ['底部多停 2 秒', '約 96（不扣分）'], ['只蹲到 110°', '約 82'], ['只蹲到 125°', '約 69']], [55, 45], size=28) +
    item('怎麼算', '曲線取 40 點，對齊時最多偏移 20%，平均每差 1° 扣 2.5 分') +
    item('和 Random Forest 的關係', '模型要先收集、標註很多資料才能訓練；DTW 現在就能用，結果說得出原因', B) + '</div></div>',
    '第五項是動作相似度，這是我們「智慧分析」裡最能講出原理的部分。每做完一下，網站把這一下的角度曲線，例如深蹲時膝蓋從站直、蹲下、再站直，和示範動畫的標準曲線比對。問題是每個人做的速度不一樣，直接一點一點比，慢的人就會被扣分。所以用動態時間校正，也就是 DTW：先把兩條曲線對齊，蹲到最低對到蹲到最低，再看每一點差幾度。左邊的圖就是例子：藍色這一下比較慢、底部停比較久，灰線是 DTW 找到的對應點。分數是平均每差一度扣二點五分，對齊時最多只能偏移百分之二十，避免蹲得淺的動作靠拉長對齊混過去。右邊是合成曲線的測試結果：標準的一下大約九十七分，底部多停兩秒幾乎不扣分，只蹲到一百一十度掉到八十二分，一百二十五度六十九分。原本規劃的 Random Forest 要先收集並標註很多資料才能訓練；DTW 現在就能用，結果也說得出原因。之後收集到的錄影，可以再拿來訓練模型、和 DTW 比較。'))

def stat(title, before, after, unit_b='', unit_a=''):
    return ('<div style="display:flex;flex-direction:column;gap:12px;background:#0E1928;border:1px solid #1F3049;border-radius:20px;padding:24px 32px">'
            f'<h3 style="font-size:28px;font-weight:900;color:#F2F7FB;line-height:1.3">{title}</h3>'
            '<div style="display:flex;flex-direction:row;gap:24px;align-items:center">'
            f'<div style="flex:1;display:flex;flex-direction:column;gap:4px"><p style="{MONO};font-size:24px;color:{MUTED}">校正前</p>'
            f'<p style="{NUM};font-size:56px;font-weight:700;color:{RD};line-height:1.1">{before}</p></div>'
            f'<p style="{NUM};font-size:48px;color:{G}">→</p>'
            f'<div style="flex:1;display:flex;flex-direction:column;gap:4px"><p style="{MONO};font-size:24px;color:{MUTED}">校正後</p>'
            f'<p style="{NUM};font-size:56px;font-weight:700;color:{G};line-height:1.1">{after}</p></div></div></div>')
wr('j6', slide('j6', head('PERSONAL · 個人校正（#78）', '每個人不一樣：站直 2 秒自動校正', '手機放高、放歪時，同一套門檻對不同人不公平；開鏡頭後側身站直，網站自己記下來') +
    ROW(48) + COL(20, 860) +
    ''.join(f'<div style="display:flex;flex-direction:row;gap:20px;align-items:start"><p style="{NUM};font-size:44px;font-weight:700;color:{G};line-height:1;width:48px">{n}</p>'
            f'<div style="flex:1;display:flex;flex-direction:column;gap:4px"><h3 style="font-size:32px;font-weight:900;color:#F2F7FB;line-height:1.3">{h}</h3>'
            f'<p style="font-size:24px;color:#BFD0E0;line-height:1.5">{p}</p></div></div>'
            for n, h, p in [('1', '側身站直不動 1.5 秒', '膝蓋 ≥ 155°、上身和腿差不多一直線、幾乎不動才算；不用按按鈕，做動作前本來就會先站好'),
                            ('2', '記下這個人的樣子', '站直時的膝蓋角度；手機歪了多少（站直時腿是直的，看腿和畫面垂直線差幾度）'),
                            ('3', '門檻跟著調整', '「站直」門檻 = 站直角度 − 10°（最低 145°）；判斷上身前傾時扣掉手機的傾斜')]) +
    ref('→ 深蹲、弓箭步；每次開鏡頭重新校正；錄製檔記下，重播分析沿用') + '</div>' +
    COL(24) + stat('手機放得高（站直只看到 158°）', '0 下', '3 下') + stat('手機歪了 12°', '誤判前傾', '不誤判') +
    f'<p style="font-size:24px;color:{MUTED};line-height:1.4">自動測試：同一段合成動作，校正前後的結果</p></div></div>',
    '第六項是個人校正，也是回應組員「依每個人客製」的想法。同一套門檻，對不同的人、不同的拍法不一定公平。例如手機放得比較高、往下拍時，人站直了膝蓋看起來只有一百六十度左右，達不到「站直」的門檻，站起來了也不算這一下；手機放歪時，整個畫面都歪，上身看起來就是前傾的。所以選深蹲或弓箭步時，開鏡頭後側身站直不動大約兩秒，網站會自動記下這個人站直時的膝蓋角度，以及手機歪了多少：站直時腿是直的，看腿和畫面垂直線差幾度就知道。之後「站直」的門檻改成這個人站直的角度減十度，判斷上身前傾時扣掉手機的傾斜。不用按按鈕，因為做動作前本來就會先站好。右邊是自動測試的結果：手機放高的情況，校正前一下都算不到，校正後三下都算到；手機歪十二度的情況，校正前會誤判前傾，校正後不會。'))

# 地基審查（10/18）：第 1 頁怎麼測、測出來的例子；第 2 頁找到並修好的問題（分四類）
AUD = NUMS['audit']
tests = ''.join(
    '<div style="display:flex;flex-direction:row;gap:20px;align-items:baseline;border-top:2px solid #1F3049;padding:10px 0 0">'
    f'<p style="{NUM};font-size:36px;font-weight:700;line-height:1;color:{c};width:160px;white-space:nowrap">{n}</p>'
    f'<p style="flex:1;font-size:24px;color:#BFD0E0;line-height:1.4">{d}</p></div>'
    for n, d, c in AUD['tests'])
wr('audit', slide('audit', head('FOUNDATION · 地基審查（10/18）', '先打好地基：穩定、自我修復、安全、數字', '組員 10/18：後端先等等，把串接、自我修復、安全漏洞、每個數字都檢查一遍', '完成') +
    ROW(56) + COL(12, 900) + label('怎麼測') + tests + '</div>' +
    COL(24) + label('測出來的例子', Y) +
    item('故意改過的網址', '改之前：網址加 ?workout=constructor，網頁出錯、AI 一直停在「準備中」；改之後照常使用', RD) +
    item('長時間運行 12 分鐘', '伏地挺身 194 下一下不漏、不多算；錄滿 10 分鐘 17,959 格；不錄的時候記憶體不會一直漲', G) +
    item('鏡頭畫面停住', '3 秒自動繼續播放，8 秒自動重開鏡頭（次數保留），重開還是不行才請使用者處理', B) +
    ref('要真手機測過才做：AI 檔案指紋核對、內容安全政策（CSP）') + '</div></div>',
    '這頁是十月十八號組員提出的要求：後端先等等，先把地基打好。我們把整個程式從頭看了一遍，再寫了四種新的測試：第一，故意用改過的網址、改壞的存檔和特製的錄製檔，看網站會不會壞掉或執行裡面的程式；第二，亂按測試，把換動作、錄製、換每秒格數、換模型、切到背景這些操作隨機混在一起，一共四百八十步，每一步都檢查畫面和紀錄；第三，鏡頭畫面停住的自我修復；第四，連續運行十二分鐘。另外加了兩個自動測試檔，用固定的亂數產生各種速度、每秒格數和漏格的情況，確認每一下只加一、做幾下就算幾下。右邊是測出來的例子：改之前，網址加上 constructor 這種程式內建的名字，網頁就會出錯，AI 一直停在準備中；連續十二分鐘的測試，一百九十四下一下都沒漏；鏡頭畫面停住時，網站會先自己繼續播放，不行就自己重開鏡頭。最下面兩項要真手機測過才做，避免改壞離線功能或讓舊的 iPhone 跑不了 AI。'))

FIXES = [
    ('安全', '外部來的資料可能被改過', RD, [
        ('網址、檔案裡的特殊名字讓網頁壞掉', '先比對清單'),
        ('存檔被改壞，總結出現 NaN', '壞掉的那筆不用'),
        ('CSV 可能被 Excel 當成公式執行', "開頭加 '"),
        ('選到好幾 GB 的影片，分頁當掉', '超過 400 MB 先說明')]),
    ('數字前後一致', '同一個數字在每個地方都一樣', Y, [
        ('棒式總結和畫面上差 1 秒', '都無條件捨去'),
        ('驗證表的角度和差距對不起來', '寫到小數第 1 位'),
        ('量角器打錯字也算進統計', '0～180° 才算'),
        ('校正把站姿的前傾也扣掉', '改看腿量手機歪多少')]),
    ('串接', '功能之間互相配合', B, [
        ('錄製中換動作，重播用錯的動作分析', '錄製中鎖住'),
        ('棒式撐到一半關網頁，沒有記', '撐到現在的算一次'),
        ('iPhone 的語音可能一直不出聲', '開鏡頭時先解鎖'),
        ('錯誤出現時剛好在提示站位就不唸', '紅字出現時才唸')]),
    ('自我修復', '出問題時網站自己處理', G, [
        ('鏡頭畫面停住沒有人處理', '繼續播放 → 重開鏡頭'),
        ('抓不到畫面被當成 AI 壞掉', '交給鏡頭的自我修復'),
        ('語音卡住，之後都不出聲', '15 秒自動清掉重來')])]
COUNT = sum(len(rows) for *_, rows in FIXES)
def fixcard(name, sub, color, rows):
    return ('<div style="display:flex;flex-direction:column;gap:10px;background:#0E1928;border:1px solid #1F3049;border-radius:20px;padding:20px 28px">'
            '<div style="display:flex;flex-direction:row;gap:16px;align-items:baseline">'
            f'<h3 style="font-size:32px;font-weight:900;color:{color};line-height:1.3">{name}</h3>'
            f'<p style="font-size:24px;color:{MUTED}">{sub}</p></div>'
            + ''.join(f'<p style="font-size:24px;color:#BFD0E0;line-height:1.4"><b style="color:#F2F7FB">{a}</b> → {b}</p>' for a, b in rows)
            + '</div>')
wr('audit2', slide('audit2', head('FOUNDATION · 地基審查（10/18）', f'找到並修好的 {COUNT} 個問題', '有的已經會發生，有的要遇到改過的檔案、特別的手機才會發生；每一個都加了測試') +
    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:20px">' + ''.join(fixcard(*f) for f in FIXES) + '</div>',
    f'這頁是找到並修好的{COUNT}個問題，分成四類。第一類是安全：網址、錄製檔和存在手機上的資料都可能被改過，例如網址裡放 constructor 這種程式內建的名字會讓網頁壞掉，現在一律先比對清單；下載的 CSV 用 Excel 打開時，等號開頭的文字可能被當成公式執行，現在前面加一個單引號。第二類是數字前後一致：例如棒式的秒數，總結原本四捨五入，畫面上是無條件捨去，會差一秒，現在都捨去；個人校正原本用上身量手機歪了多少，會把站姿本來的前傾也扣掉，現在改看腿。第三類是串接：例如錄製中原本可以換動作，重播會用錯的動作分析整段，現在錄製中會鎖住；iPhone 的語音要在按按鈕時先解鎖，不然之後可能一直不出聲。第四類是自我修復：鏡頭畫面停住時，網站會先繼續播放，不行就重開鏡頭；抓不到鏡頭畫面原本會被當成 AI 壞掉，現在交給鏡頭處理；瀏覽器的語音卡住超過十五秒，會自動清掉重來。每一個問題都加了測試，之後改程式時會自動檢查。'))

# 要靠真人調整的門檻
wr('thr', slide('thr', head('NEXT · 要請組員實測', '這些門檻要靠真人調整', '都依示範動畫和一般健身教學先訂；集中在程式的幾個地方，改一個數字就能調', color=Y, bg='#3A2A12') +
    table(['項目', '目前的門檻', '怎麼測'], [
        ['到位角度', '深蹲 90°、伏地挺身 95°、弓箭步 100°', '每個動作做 10 下（棒式撐 30 秒），數一數網站算得對不對'],
        ['錯誤判斷', '前傾 50°（弓箭步 30°）、腰塌 7%、屁股太高 9%、腳跟、膝超過腳尖', '每種錯誤故意做錯、做對各 5 下：有沒有報、有沒有誤報'],
        ['動作相似度', '每差 1° 扣 2.5 分', '標準、蹲淺、做很快各幾下：分數高低順序對不對'],
        ['個人校正', '站直 1.5 秒、膝蓋 ≥ 155°、傾斜 20° 以內', '手機放高、放歪各試一次：有沒有校正、次數有沒有算到'],
        ['光線、自動調整', '亮度 45；AI 跟不上鏡頭的 85% 就降', '暗的房間、不同手機：提醒和自動調整合不合理'],
        ['角度準確度', '—', '量角器對照（驗證實驗 A），算出平均誤差']], [20, 40, 40], color=Y) +
    '<p style="font-size:24px;color:#BFD0E0;line-height:1.5">實測步驟寫在專案的 docs/roadmap.md「要等真人、真手機才能確認的事」</p>',
    '這些新功能都是用示範動畫做成的骨架測試過的，真人做起來會不會誤報、門檻合不合理，要請組員實測。這頁列出要調整的門檻和怎麼測：到位角度，每個動作做十下，數一數網站算得對不對；錯誤判斷，每種錯誤故意做錯、做對各五下，看有沒有報、有沒有誤報；相似度，看標準的、蹲得淺的、做很快的分數高低順序對不對；個人校正，手機放高、放歪各試一次；光線和自動調整，在暗的房間和不同手機上試。最後是角度準確度，用量角器對照，算出平均誤差。門檻都集中在程式的幾個地方，改一個數字就能調。'))

# ======================= 真手機確認：多一列自動調整 =======================
t = rd('fbcheck')
t = rep(t, '</td></tr></table>', '</td></tr><tr><td style="color:#F2F7FB"><b>自動調整（新）</b></td><td>畫面流暢度、AI 模型都選「自動」，運動 5 分鐘</td><td>有沒有自動升 60 格或改用 lite、標籤的「AI 每格幾毫秒」</td></tr></table>')
t = rep(t, '還要用真手機確認的 3 件事', '還要用真手機確認的 4 件事')
t = rep(t, '但這三件事在電腦的測試環境裡測不出來', '但這四件事在電腦的測試環境裡測不出來')
t = aside(t, '功能都做好了，但有四件事在電腦的測試環境裡測不出來，要請組員用真的手機確認。第一，iPhone 側邊的靜音開關打開時，網頁的提示音會不會響。第二，用手機選十分鐘以上的錄製，錄滿之後網頁有沒有自己重新整理、檔案多大。第三，每秒格數選六十、九十、一百二十格時，運算標籤顯示鏡頭和 AI 各幾格、哪些選項變灰、運動五分鐘手機會不會發燙。第四是這次新增的自動調整：畫面流暢度和 AI 模型都選自動，運動五分鐘，看網站有沒有自動升到六十格或改用 lite，運算標籤的 AI 每格幾毫秒也請記下來。請記下手機型號、瀏覽器和結果，下次報告補上。')
wr('fbcheck', t)

# ======================= 新的順序 =======================
OLD = json.load(open(R + '/deck.json', encoding='utf8'))['order']
NEW1 = ['adq', 'adhow', 'jq', 'j1', 'j2', 'j3', 'j4', 'j5', 'j6', 'audit', 'audit2']
i = OLD.index('fb9') + 1
order = OLD[:i] + NEW1 + ['fbcheck', 'thr'] + [s for s in OLD[i:] if s != 'fbcheck']
assert len(order) == len(set(order)) == len(OLD) + len(NEW1) + 1, len(order)
page = {s: k + 1 for k, s in enumerate(order)}
oldpage = {k + 1: s for k, s in enumerate(OLD)}
TOTAL = len(order)
P = lambda s: '%02d' % page[s]
NEW = set(NEW1 + ['thr'])
def remap(t):
    def one(m):
        a = int(m.group(1)); s = 'P.%02d' % page[oldpage[a]]
        if m.group(2):
            b = int(m.group(2)); s += '–%02d' % page[oldpage[b]]
        return s
    return re.sub(r'P\.(\d\d)(?:–(\d\d))?', one, t)
rng = lambda a, b: 'P.@%s@–@%s@' % (a, b)

# ======================= 封面 =======================
t = rd('cover')
t = rep(t, 'PROGRESS REPORT · BATCH 02', 'PROGRESS REPORT · 03')
t = rep(t, '第二批次進度報告（10/13 更新）', '第三次進度報告（10/18 更新）')
t = rep(t, '>PR #7–#67<', '>PR #61–#%d<' % NUMS['lastPr'])
t = rep(t, '>61 次更新<', '>%d 次更新<' % (NUMS['lastPr'] - 60))
t = rep(t, '>2026.10.13<', '>2026.10.18<')
t = rep(t, "g.fillText('概念示意：深蹲次數目前是實驗功能',24*s,H-20*s);", "g.fillText('概念示意：骨架、膝蓋角度、次數',24*s,H-20*s);")
t = aside(t, '開場。這是第三次進度報告。右邊的動畫是概念示意：骨架即時偵測深蹲，膝蓋角度跟著變化，蹲到九十度以下再站起來就算一下，這些現在都是網站上的功能。這次報告的範圍是上次十月十二號報告之後的 PR 第 61 到 %d 號，共 %d 次更新：先一題一頁回覆老師上次的九個問題；再說明組員提的「網站自己看手機能力調整」；然後是這次最大的改變，從「量角度」走到「判斷動作」：四個動作計次、錯誤標紅和語音、運動總結、驗證工具、動作相似度和個人校正，以及一次完整的地基審查；最後是要請組員實測的事、限制和下一步。後面是詳細資料，老師可以之後慢慢看。' % (NUMS['lastPr'], NUMS['lastPr'] - 60))
wr('cover', t)

# ======================= 目錄 =======================
def arow(n, h, p, pages):
    return ('<div style="display:flex;flex-direction:row;gap:28px;align-items:center;border-top:1px solid #1F3049;padding:14px 0 0">'
            f'<p style="width:80px;{NUM};font-size:44px;font-weight:700;line-height:1;color:{G}">{n}</p>'
            f'<div style="flex:1;display:flex;flex-direction:column;gap:2px"><h3 style="font-size:30px;font-weight:900;color:#F2F7FB;line-height:1.3">{h}</h3>'
            f'<p style="font-size:24px;color:#BFD0E0">{p}</p></div><p style="{MONO};font-size:24px;color:{MUTED};white-space:nowrap">{pages}</p></div>')
def drow(h, pages):
    return ('<div style="display:flex;flex-direction:row;justify-content:space-between;align-items:center;border-top:1px solid #1F3049;padding:12px 0 0">'
            f'<p style="font-size:24px;font-weight:700;color:#F2F7FB">{h}</p><p style="{MONO};font-size:24px;color:{MUTED}">{pages}</p></div>')
DETAIL = [('系統與設計邏輯', 'layers', 'principles'), ('開發環境與工作方式', 'stack', 'testenv'), ('更新歷程：%d 次更新' % (NUMS['lastPr'] - 6), 'growth', 'phase10'),
          ('程式碼介紹', 'filemap', 'urlparams'), ('技術突破與測試', 'ghost', 'tests'), ('10/12 報告的內容', 'questions', 'mobile-speed')]
t = rd('agenda')
body = ('<div style="display:flex;flex-direction:column;gap:16px">'
        f'<p style="{MONO};font-size:24px;letter-spacing:6px;color:{G}">AGENDA · 今天的內容</p>'
        '<h2 style="font-size:72px;font-weight:900;line-height:1.15;color:#F2F7FB">兩個部分：先報告，再附詳細資料</h2></div>'
        '<div style="display:flex;flex-direction:row;gap:56px;align-items:start"><div style="flex:1;display:flex;flex-direction:column;gap:12px">'
        f'<p style="{MONO};font-size:24px;letter-spacing:4px;color:{G}">第一部分 · 報告</p>' +
        arow('01', '老師上次的 9 個問題', '一題一頁，照老師提問的順序', rng('fbq', 'fb9')) +
        arow('02', '網站自己看手機能力調整', '組員 10/13 的想法：速度、格數、模型、光線', rng('adq', 'adhow')) +
        arow('03', '從「量」到「判斷」', '計次、錯誤、總結、驗證、相似度、校正、地基審查', rng('jq', 'audit2')) +
        arow('04', '要請組員實測的事', '真手機 4 件事、要調整的門檻', rng('fbcheck', 'thr')) +
        arow('05', '限制與下一步', '還沒做到的地方、接下來的規劃', rng('limits', 'end')) + '</div>'
        '<div style="width:560px;display:flex;flex-direction:column;gap:12px;background:#0E1928;border:1px solid #1F3049;border-radius:20px;padding:28px 32px">'
        f'<p style="{MONO};font-size:24px;letter-spacing:4px;color:{B}">第二部分 · 詳細資料</p>'
        '<p style="font-size:24px;color:#BFD0E0;line-height:1.5">報告時不逐頁講，老師可以之後慢慢看</p>' +
        ''.join(drow(h, rng(a, b)) for h, a, b in DETAIL) + '</div></div>')
t = re.sub(r'(<section[^>]*>\n).*?(\n<div style="position:absolute;left:128px;bottom:64px)', lambda m: m.group(1) + body + m.group(2), t, count=1, flags=re.S)
t = aside(t, '今天的簡報分成兩部分。第一部分是報告：先一題一頁回覆老師上次的九個問題；再說明組員提的想法，讓網站自己看手機的能力調整；接著是這次最大的改變，從「量角度」走到「判斷動作」，一共七項，再加上一次穩定性和安全的地基審查；然後是要請組員用真手機和真人實測的事；最後是限制和下一步。第二部分是詳細資料，包括系統設計、開發環境、每次更新各改了什麼、程式碼和技術細節，以及上次十月十二號報告的內容，報告時不會逐頁講，老師可以之後慢慢看。')
wr('agenda', t)

# ======================= 限制、下一步、結尾 =======================
t = rd('limits')
t = rep(t, '>角度準確度尚未驗證<', '>角度準確度還沒有數字<')
t = rep(t, '7 段真人錄影已檢查、修好 6 個問題；準不準要用捲尺長度對照', '驗證工具做好了（P.@j4@）；等組員用量角器對照，算出平均誤差')
t = rep(t, '>動作判斷只有深蹲原型<', '>判斷的門檻要真人調整<')
t = rep(t, '次數與深度在實驗中（?lab=squat）；蹲到位定為 90°，前傾的門檻還沒定', '四個動作都會計次、判斷錯誤；門檻先依教學訂，要實測調整（P.@thr@）')
t = rep(t, '深度（z）是 AI 猜的：已做穩定化，準不準要用實驗 D、H 驗證', '深度（z）是 AI 猜的；膝蓋內夾、左右平衡要正面拍才看得到')
t = rep(t, '資料格式已定好，資料庫與歷史紀錄還沒做', '資料格式已定好；運動紀錄先存在這台手機（最多 50 次）')
t = aside(t, '這頁誠實列出目前的限制。最重要的是準確度：這次做好了驗證工具，但還沒有真人的數字，要請組員用量角器對照，算出平均誤差。第二是判斷的門檻：四個動作都會計次、判斷錯誤了，但門檻是依一般健身教學和示範動畫先訂的，要真人做做看再調整。另外，太舊的手機因為缺少 WebGL2 無法執行 AI，網站會在一開始就說明原因；單一鏡頭的深度是 AI 猜的，膝蓋內夾、左右平衡這類要正面才看得到的錯誤，側面拍做不到；後端還沒建置，運動紀錄先存在手機裡。')
wr('limits', t)

def step(tag, h, p, now=False):
    if now:
        top = (f'<p style="{MONO};font-size:24px;font-weight:700;color:#062019;background:{G};border-radius:999px;padding:2px 16px;align-self:start">{tag}</p>'
               f'<div style="height:8px;background:{G};border-radius:999px;box-shadow:0 0 20px {G}"></div>')
    else:
        top = f'<p style="{MONO};font-size:24px;color:{MUTED};padding:2px 0">{tag}</p><div style="height:8px;background:#2C4260;border-radius:999px"></div>'
    return (f'<div style="flex:1;display:flex;flex-direction:column;gap:16px">{top}'
            f'<h3 style="font-size:32px;font-weight:900;color:#F2F7FB;line-height:1.3">{h}</h3>'
            f'<p style="font-size:24px;color:#BFD0E0;line-height:1.5">{p}</p></div>')
t = rd('roadmap')
body = (head('ROADMAP · 下一步', '先用真人驗證，再往進階分析走', '「判斷」的功能做好了；依序進行，每完成一段先向老師報告') +
        '<div style="flex:1"></div><div style="display:flex;flex-direction:row;gap:24px">' +
        step('NEXT', '真人實測、調門檻', '量角器對照角度、次數對答案、錯誤和相似度的門檻；照數字調整', True) +
        step('STEP 2', '進階分析', '穩定度、平衡度；疲勞：同一組動作前段和後段比較') +
        step('STEP 3', '後端與歷史紀錄', 'FastAPI、資料庫；成長曲線（現在先存在手機）') +
        step('STEP 4', 'AI 評分模型', '用收集的錄影訓練 Random Forest，和 DTW 相似度比較') + '</div>'
        '<div style="display:flex;flex-direction:row;gap:16px;align-items:center;border-top:1px solid #1F3049;padding:24px 0 0">'
        f'<p style="font-size:24px;font-weight:700;color:{B};white-space:nowrap">同時進行</p>'
        '<p style="font-size:24px;color:#BFD0E0;line-height:1.5">自動調整的門檻照組員各種手機的實測數字調整；確認後可以把預設改成「自動」</p></div><div style="flex:1"></div>')
t = re.sub(r'(<section[^>]*>\n).*?(\n<div style="position:absolute;left:128px;bottom:64px)', lambda m: m.group(1) + body + m.group(2), t, count=1, flags=re.S)
t = aside(t, '接下來的規劃。上次這頁的前兩步，錯誤判斷和其他三個動作，這次都做完了。下一步是用真人驗證：用量角器對照角度、對次數、調整錯誤和相似度的門檻，照實測數字修正。驗證完之後，往進階分析走：穩定度、平衡度，以及疲勞分析，也就是比較同一組動作前段和後段的品質變化；再來是後端和歷史紀錄，最後用收集到的錄影訓練原本規劃的 Random Forest 評分模型，和現在的 DTW 相似度比較。同時，自動調整的門檻也照組員手機的實測數字調整，確認沒問題後，可以把預設改成自動。')
wr('roadmap', t)

t = rd('end')
t = rep(t, '下一站：<span style="color:#2ee6a6">錯誤判斷與計算</span>', '下一站：<span style="color:#2ee6a6">真人實測與調整</span>')
t = rep(t, '深蹲次數與角度、錯誤判斷、問題節點標紅', '量角器對照、次數對答案、錯誤和相似度的門檻')
t = rep(t, '第 17～64 頁是詳細資料，老師可以之後慢慢看', '第 %d～%d 頁是詳細資料，老師可以之後慢慢看' % (page['appendix'], TOTAL))
t = aside(t, '結尾。這次報告的進度到這裡：老師上次的九個問題都完成了；組員提的自動調整做好了；第三層「判斷」也補起來了，四個動作會計次、抓錯誤、給相似度分數，還會依每個人校正。下一站是真人實測和調整門檻：量角器對照、次數對答案、錯誤和相似度的門檻。最後可以請老師用手機打開網址現場試用，選一個動作做做看。後面第 %d 頁開始是詳細資料，最後一節是上次十月十二號報告的內容。' % page['appendix'])
wr('end', t)

# ======================= 附錄 =======================
t = rd('appendix')
t = rep(t, '>更新歷程：61 次更新<', '>更新歷程：%d 次更新<' % (NUMS['lastPr'] - 6))
t = aside(t, '報告的部分到這裡。後面是詳細資料，包括系統和設計邏輯、開發環境和工作方式、%d 次更新各改了什麼、程式碼介紹、技術突破和測試，最後一節是上次十月十二號報告的內容：當時回覆的六個問題、真人實測和手機上的改進。報告時不會逐頁講，老師可以之後慢慢看。' % (NUMS['lastPr'] - 6))
wr('appendix', t)

t = rd('growth')
t = rep(t, '現在（10/13）', '現在（10/18）')
t = rep(t, 'line-height:1">10,213</p>', 'line-height:1">{:,}</p>'.format(NUMS['lines']))
t = rep(t, '>行，55 個檔案；程式分 7 個資料夾<', '>行，%d 個檔案；程式分 7 個資料夾<' % NUMS['files'])
t = rep(t, 'line-height:1;color:#F2F7FB">61</p>', 'line-height:1;color:#F2F7FB">%d</p>' % (NUMS['lastPr'] - 6))
t = rep(t, '>次更新（PR #7～#67）<', '>次更新（PR #7～#%d）<' % NUMS['lastPr'])
t = rep(t, 'line-height:1;color:#2EE6A6">42</p>', 'line-height:1;color:#2EE6A6">%d</p>' % NUMS['tests'])
t = aside(t, '這頁用數字看程式的變化。第一批次結束時，整個網站只有一個 256 行的檔案；十月一號時是 2,967 行、22 個檔案；現在是 {:,} 行、{} 個檔案，程式依功能分成七個資料夾。行數增加的部分除了功能，也包括自動測試和說明文件。每次推送都會自動跑 {} 項測試，每次合併前還會重跑 39 項情境測試，大約四十五分鐘，結果和改之前一樣才合併。'.format(NUMS['lines'], NUMS['files'], NUMS['tests']))
wr('growth', t)

t = rd('timeline')
t = rep(t, '61 次更新分成七個階段', '%d 次更新分成八個階段' % (NUMS['lastPr'] - 6))
col = ('<div style="flex:1;display:flex;flex-direction:column;gap:12px">'
       f'<p style="{MONO};font-size:24px;color:{MUTED}">10/13–10/18</p><div style="height:8px;background:{RD};border-radius:999px;opacity:1.0"></div>'
       f'<p style="{NUM};font-size:44px;font-weight:700;color:{RD};line-height:1">#68–{NUMS["lastPr"]}</p>'
       '<h3 style="font-size:28px;font-weight:900;color:#F2F7FB;line-height:1.3">自動調整、判斷動作</h3>'
       f'<p style="font-size:24px;color:#BFD0E0;line-height:1.5">已在第一部分說明（{rng("adq", "audit2")}）</p></div>')
k = t.index('<p style="' + MONO + ';font-size:24px;color:#8299B2">10/12–10/13</p>')
j = t.index('</div></div>', k) + len('</div>')
t = t[:j] + col + t[j:]
t = aside(t, '%d 次更新可以分成八個階段。第一階段回答老師更早之前的問題，第六階段的驗證工具和真人錄影，都在最後一節「10/12 報告」裡說明；第七階段是 PR 第 61 到 67 號，回覆老師上次的九個問題；第八階段是 PR 第 68 號以後，自動調整、判斷動作和地基審查，這兩個階段都在今天的第一部分說明過了。後面幾頁只列出沒有講到的更新。' % (NUMS['lastPr'] - 6))
wr('timeline', t)

t = rd('tests')
t = t.replace('42 項自動測試', '%d 項自動測試' % NUMS['tests']).replace('目前 42 項', '目前 %d 項' % NUMS['tests'])
wr('tests', t)
t = rd('urlparams')
t = rep(t, '例：ttweew.github.io/claude-workspace/?model=full　每秒格數平常在首頁選，?fps=60 也可以直接指定',
        '例：…/?model=full　每秒格數、模型平常在首頁「進階設定」選；?fps=60、?workout=squat 也可以直接指定')
wr('urlparams', t)
t = rd('filemap')
t = rep(t, '>angles.js view.js<', '>angles.js view.js reps.js<')
t = rep(t, '>framing.js squat.js<', '>workouts.js form.js tracker.js<')
t = rep(t, '>角度、方向、入鏡、深蹲<', '>角度、計次、錯誤、相似度、校正（共 15 個）<')
wr('filemap', t)

# ======================= 頁尾、頁碼、交叉引用 =======================
for s in order:
    t = rd(s)
    t = t.replace('>AI 智慧運動分析系統 · 第二批次', '>AI 智慧運動分析系統 · 第三次報告')
    if s not in NEW:
        t = remap(t)
    t = re.sub(r'P\.@([a-z0-9-]+)@–@([a-z0-9-]+)@', lambda m: 'P.%s–%s' % (P(m.group(1)), P(m.group(2))), t)
    t = re.sub(r'P\.@([a-z0-9-]+)@', lambda m: 'P.' + P(m.group(1)), t)
    assert '@' not in re.sub(r'<aside>.*?</aside>', '', t, flags=re.S), s
    t2, k = re.subn(r'(>)\d\d / (?:64|00)(<)', lambda m: m.group(1) + '%02d / %d' % (page[s], TOTAL) + m.group(2), t)
    assert k == (0 if s == 'cover' else 1), (s, k)
    wr(s, t2)

d = json.load(open(R + '/deck.json', encoding='utf8'))
d['order'] = order
d['sections'] = {
    's1': {'description': '開場與目錄：先報告，再附詳細資料', 'start': 'cover'},
    's2': {'description': '老師上次的 9 個問題：一題一頁', 'start': 'fbq'},
    's4': {'description': '組員的想法：網站自己看手機能力調整', 'start': 'adq'},
    's5': {'description': '從「量」到「判斷」：計次、錯誤、總結、驗證、相似度、校正、地基審查', 'start': 'jq'},
    's3': {'description': '要請組員實測的事、限制與下一步', 'start': 'fbcheck'},
    's6': {'description': '詳細資料：系統與設計邏輯', 'start': 'appendix'},
    's7': {'description': '詳細資料：開發環境與工作方式', 'start': 'stack'},
    's8': {'description': '詳細資料：更新歷程（%d 次更新）' % (NUMS['lastPr'] - 6), 'start': 'growth'},
    's9': {'description': '詳細資料：程式碼介紹', 'start': 'filemap'},
    's10': {'description': '詳細資料：技術突破與測試', 'start': 'ghost'},
    's11': {'description': '10/12 報告的內容：老師的 6 個問題、真人實測、手機', 'start': 'questions'},
}
d['title'] = '運動分析系統第三次進度報告'
json.dump(d, open(R + '/deck.json', 'w', encoding='utf8'), ensure_ascii=False, indent=2)
print('頁數', TOTAL, '詳細資料從', page['appendix'], '10/12 報告從', page['questions'])
