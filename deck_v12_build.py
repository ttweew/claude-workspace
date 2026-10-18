# 簡報 v12：開頭逐題回覆老師 10/12 的 9 個問題；舊的第一部分移到附錄「10/12 報告」
import json, re, sys
R = sys.argv[1] + '/project'; S = R + '/slides/'
def rd(n): return open(S + n + '.html', encoding='utf8').read()
def wr(n, t): open(S + n + '.html', 'w', encoding='utf8').write(t)
def rep(t, a, b, c=1):
    assert t.count(a) == c, (a[:80], t.count(a)); return t.replace(a, b)
def aside(t, s):
    t2, k = re.subn(r'<aside>.*?</aside>', '<aside>' + s + '</aside>', t, flags=re.S); assert k == 1; return t2

MONO = "font-family:'JetBrains Mono', 'Courier New', monospace"
NUM = "font-family:'Chakra Petch', 'Trebuchet MS', sans-serif"
G, B, Y, RD, MUTED = '#2EE6A6', '#4CC3FF', '#FFB547', '#FF5A5F', '#8299B2'
SEC = "background:#070C16;color:#E8F0F7;font-family:'Noto Sans TC', Arial, sans-serif;padding:128px 128px 160px;display:flex;flex-direction:column;gap:40px"
FOOT = ('<div style="position:absolute;left:128px;bottom:64px;width:1664px;display:flex;flex-direction:row;justify-content:space-between">'
        '<p style="' + MONO + ';font-size:24px;color:#5F7690">AI 智慧運動分析系統 · 第二批次</p>'
        '<p style="' + MONO + ';font-size:24px;color:#5F7690">00 / 00</p></div>')

def head(q, title, sub, badge='完成', color=G, bg='#103A2D'):
    return ('<div style="display:flex;flex-direction:column;gap:16px"><div style="display:flex;flex-direction:row;gap:20px;align-items:center">'
            f'<p style="{MONO};font-size:24px;letter-spacing:6px;color:{color}">TEACHER Q&amp;A · {q}</p>'
            f'<p style="font-size:24px;font-weight:700;color:{color};background:{bg};border-radius:999px;padding:4px 18px">{badge}</p></div>'
            f'<h2 style="font-size:72px;font-weight:900;line-height:1.15;color:#F2F7FB">{title}</h2>'
            f'<p style="font-size:32px;color:#BFD0E0;line-height:1.4">{sub}</p></div>')
def item(h, p, color=G):
    return (f'<div style="display:flex;flex-direction:column;gap:6px;border-left:4px solid {color};padding:2px 0 2px 20px">'
            f'<h3 style="font-size:32px;font-weight:900;color:#F2F7FB;line-height:1.3">{h}</h3>'
            f'<p style="font-size:24px;color:#BFD0E0;line-height:1.5">{p}</p></div>')
def label(s, color=G):
    return f'<p style="{MONO};font-size:24px;letter-spacing:4px;color:{color}">{s}</p>'
def ref(s):
    return f'<p style="{MONO};font-size:24px;color:{MUTED}">{s}</p>'
def img(src, alt, w, h, cap):
    return (f'<div style="width:{w}px;display:flex;flex-direction:column;gap:12px">'
            f'<img src="{src}" alt="{alt}" style="width:{w}px;height:{h}px;object-fit:contain;border-radius:16px;border:2px solid #24405E;background:#000000">'
            f'<p style="font-size:24px;color:{MUTED};line-height:1.4">{cap}</p></div>')
def slide(sid, body, notes, transition='fade', style=SEC):
    return f'<section id="{sid}" data-transition="{transition}" style="{style}">\n{body}\n{FOOT}\n<aside>{notes}</aside>\n</section>\n'

IMG = {
    'hud': '/_blob/6b169b211b659561d19a3f52115f1e43', 'nav': '/_blob/d365047a20d6fd53323cbcf6970a1bf8',
    'toolbar': '/_blob/5a7a2920d68dc83575c6b1b492dab8ca', 'limit': '/_blob/26a0243d4cf39062378bbfe9c679c19c',
    'squat': '/_blob/d53f71062580e24737ce798998019c99', 'cards': '/_blob/764bc905189338876b784413537e4567',
    'panel': '/_blob/e4a2706597837f8350e3d4e2826efd10', 'cm': '/_blob/27cead9aadcb44659233999a3ab01c98',
    'fpsstart': '/_blob/f65b677fa66f3740ebe82c37817388c7', 'fpsbadge': '/_blob/0642e0e6e896e53fe9f217b116383b54',
}

# ---------- 新的第一部分：老師 10/12 的 9 個問題 ----------
QS = [  # (id, 短標題, 一句話)
    ('fb1', '儀表板左右分邊', '左右兩組都顯示，照鏡子擺：左邊就是左邊'),
    ('fb2', '導覽列的字放大', '筆電 15→20px、圖示 18→24px，格子不變'),
    ('fb3', '聲音提示', '叮、逼逼、逼逼逼，只在狀況改變時響'),
    ('fb4', '錄製時間可以選', '5／10／15／20 分鐘，旁邊寫檔案大小'),
    ('fb5', '音量四段', '關、小、中、大，點一下換一段、試聽一聲'),
    ('fb6', '蹲到位：膝蓋 90°', '照老師的決定：只看髖、膝、踝三點夾角'),
    ('fb7', '動作示範動畫', '四個動作的側面示範，首頁和鏡頭畫面'),
    ('fb8', '改用公分', '改名「3D 座標」，畫面上直接用公分'),
    ('fb9', '每秒格數可以選', '30／60／90／120 格，依手機能力自己選'),
]
cards = ''
for i, (sid, t, s) in enumerate(QS, 1):
    cards += ('<div style="display:flex;flex-direction:column;gap:8px;background:#0E1928;border:1px solid #1F3049;border-radius:20px;padding:20px 28px">'
              '<div style="display:flex;flex-direction:row;align-items:center;gap:16px">'
              f'<p style="{NUM};font-size:40px;font-weight:700;line-height:1.1;color:{G}">Q{i}</p><div style="flex:1"></div>'
              f'<p style="{MONO};font-size:24px;color:{MUTED}">P.@{sid}@</p>'
              f'<p style="font-size:24px;font-weight:700;color:{G};background:#103A2D;border-radius:999px;padding:4px 18px">完成</p></div>'
              f'<h3 style="font-size:32px;font-weight:900;color:#F2F7FB;line-height:1.3">{t}</h3>'
              f'<p style="font-size:24px;color:#BFD0E0;line-height:1.5">{s}</p></div>')
wr('fbq', slide('fbq',
    '<div style="display:flex;flex-direction:column;gap:16px">'
    f'<p style="{MONO};font-size:24px;letter-spacing:6px;color:{G}">TEACHER Q&amp;A · 老師 10/12 的 9 個問題</p>'
    '<h2 style="font-size:72px;font-weight:900;line-height:1.15;color:#F2F7FB">逐題回覆：9 題都完成了</h2></div>'
    f'<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:20px">{cards}</div>',
    '先回覆老師上次提的九個問題。這一頁是總覽：九題都已經做完，也都放上網站了。其中提示音、長時間錄製和每秒格數這三題，功能做好了，但要用真的手機才測得出來，所以請組員實測，在第十三頁說明。接下來一題一頁，照老師提問的順序說明做了什麼、改變了什麼。'))

wr('fb1', slide('fb1', head('Q1', '左腳的數字，可以放在左邊嗎？', '可以。左、右兩組都顯示，照鏡子的方式擺：畫面左邊就是左邊') +
    '<div style="display:flex;flex-direction:row;gap:56px;align-items:start">' +
    img(IMG['hud'], '手機鏡頭畫面兩張：前鏡頭時左膝、左髖在畫面左邊；後鏡頭時兩組對調', 427, 450, '左：前鏡頭（照鏡子）<br>右：後鏡頭（別人幫忙拍）') +
    '<div style="flex:1;display:flex;flex-direction:column;gap:24px">' + label('做了什麼') +
    item('左右兩組都顯示', '左膝、左髖和右膝、右髖都在畫面上；看不到的一側顯示「—」，不顯示猜出來的數字') +
    item('照鏡子的方式擺', '前鏡頭的畫面是鏡像，本人的左邊在畫面左邊，左側那組就放左邊；後鏡頭（別人幫忙拍）沒有鏡像，兩組自動對調') +
    item('被擋住的那一側變淡', '側面拍時，離鏡頭遠的那一側常被身體擋住，數字比較不可靠，就變淡提醒') +
    ref('→ PR #63 · 使用說明「畫面上的東西」') + '</div></div>',
    '第一題，老師做左腳在前的弓箭步時，儀表板只顯示一側，而且位置固定，分不出是哪隻腳。現在改成左、右兩組都顯示，照鏡子的方式擺：左邊兩張截圖是同一個姿勢。用前鏡頭時畫面是鏡像，本人的左邊出現在畫面左邊，所以左膝、左髖就放在左邊；請別人用後鏡頭拍時沒有鏡像，兩組會自動對調，數字永遠跟著身體同一邊。看不到的一側顯示一槓，不顯示猜出來的數字；側面拍時被身體擋住的那一側會變淡，提醒那邊的數字比較不可靠。'))

stats = ''.join(
    '<div style="flex:1;display:flex;flex-direction:column;gap:10px;border-top:2px solid #1F3049;padding:20px 0 0">'
    f'<p style="{NUM};font-size:56px;font-weight:700;line-height:1;color:{G}">{n}</p>'
    f'<p style="font-size:24px;color:#BFD0E0;line-height:1.5">{d}</p></div>'
    for n, d in [('15→20', '筆電導覽列的字（px）'), ('18→24', '圖示（px）'), ('12→16', '手機的字（px，最小的手機 14）'), ('13 種', '螢幕尺寸都排得下，320～1920 寬')])
wr('fb2', slide('fb2', head('Q2', '導覽列的格子很大，字可以再大嗎？', '可以。格子不變，字和圖示放大，投影時也看得清楚') +
    '<div style="display:flex;flex-direction:column;gap:12px">'
    f'<img src="{IMG["nav"]}" alt="筆電導覽列改前與改後：字和圖示放大" style="width:1664px;height:237px;object-fit:contain;border-radius:16px;border:2px solid #24405E;background:#070C16">'
    f'<p style="font-size:24px;color:{MUTED}">上：改前　下：改後（筆電 1366 寬）</p></div>'
    f'<div style="display:flex;flex-direction:row;gap:40px">{stats}</div>' + ref('→ PR #61'),
    '第二題，老師覺得導覽列的格子很大，字卻很小。我們沒有把格子撐滿，而是把字和圖示放大：筆電的字從 15 放大到 20 像素，圖示從 18 放大到 24；手機從 12 放大到 16，最小的手機也有 14。上面是筆電改前、改後的對照。我們用 13 種螢幕尺寸檢查過，從最小的 320 寬手機到 1920 寬的螢幕，都排得下、不會擠到換行。'))

def sound_card(word, when, how, color):
    return ('<div style="flex:1;display:flex;flex-direction:column;gap:12px;background:#0E1928;border:1px solid #1F3049;border-radius:20px;padding:28px 32px">'
            f'<p style="font-size:56px;font-weight:900;line-height:1.1;color:{color}">{word}</p>'
            f'<h3 style="font-size:32px;font-weight:900;color:#F2F7FB;line-height:1.3">{when}</h3>'
            f'<p style="font-size:24px;color:#BFD0E0;line-height:1.5">{how}</p></div>')
wr('fb3', slide('fb3', head('Q3', '看不到螢幕時，可以用聲音提示嗎？', '可以。先做三種提示音，聽一下就知道是哪一種；語音提示放在下一步') +
    '<div style="display:flex;flex-direction:row;gap:24px">' +
    sound_card('叮', '站好了', '一聲、高音：全身都拍到，可以開始運動', G) +
    sound_card('逼逼', '站位不對', '兩聲：太近、看不到腳、離太遠、偏一邊', Y) +
    sound_card('逼逼逼', '離開畫面', '三聲、低音：離開 1 秒後響，沒回來每 5 秒再提醒，最多 3 次', RD) + '</div>'
    '<div style="display:flex;flex-direction:row;gap:24px;align-items:start"><div style="flex:1;display:flex;flex-direction:column;gap:12px">' + label('不會一直響') +
    '<p style="font-size:24px;color:#BFD0E0;line-height:1.5">只在狀況改變時響；還沒走進畫面前不響；蹲低時腳被擋住也不響</p></div>'
    '<div style="flex:1;display:flex;flex-direction:column;gap:12px">' + label('還要確認', Y) +
    '<p style="font-size:24px;color:#BFD0E0;line-height:1.5">iPhone 側邊的靜音開關打開時，網頁還會不會響（P.13）</p></div></div>' + ref('→ PR #64'),
    '第三題，人站在兩三公尺外運動時看不到螢幕，老師希望有聲音提示。我們先做了三種提示音，高低和次數都不同，聽一下就知道是哪一種：站好了是一聲「叮」；站位不對是「逼逼」兩聲，例如太近、看不到腳、離太遠；離開畫面是低音的「逼逼逼」，離開一秒後響，一直沒回來就每五秒再提醒一次，最多三次。提示音只在狀況改變時響，不會一直響；蹲低時腳被身體擋住，這不是站錯，所以不響。語音提示放在下一步。還要請組員確認的是：iPhone 側邊的靜音開關打開時，網頁還會不會響。'))

tbl = (f'<table style="font-size:28px;color:#BFD0E0;font-family:\'Noto Sans TC\', Arial, sans-serif"><tr><th style="width:26%;color:{B}">最多錄</th><th style="width:34%;color:{B}">檔案大小（約）</th><th style="width:40%;color:{B}">用手機選時</th></tr>'
       '<tr><td style="color:#F2F7FB"><b>5 分鐘</b>（預設）</td><td>35 MB</td><td>照常</td></tr>'
       '<tr><td style="color:#F2F7FB"><b>10 分鐘</b></td><td>70 MB</td><td>照常</td></tr>'
       f'<tr><td style="color:#F2F7FB"><b>15 分鐘</b></td><td>100 MB</td><td style="color:{Y}">黃字提醒</td></tr>'
       f'<tr><td style="color:#F2F7FB"><b>20 分鐘</b></td><td>135 MB</td><td style="color:{Y}">黃字提醒</td></tr></table>')
wr('fb4', slide('fb4', head('Q4', '為什麼只能錄 5 分鐘？可以自己設定嗎？', '可以。數據面板多一個選單：最多 5、10、15、20 分鐘，網站會記住') +
    '<div style="display:flex;flex-direction:row;gap:56px;align-items:start">' +
    img(IMG['limit'], '手機數據面板：錄製上限選單選 20 分鐘，下面出現黃字提醒', 620, 262, '手機選 20 分鐘時的黃字提醒') +
    '<div style="flex:1;display:flex;flex-direction:column;gap:24px">' + tbl +
    item('為什麼以前是 5 分鐘', '錄製中的資料都放在記憶體（20 分鐘約 165 MB）；手機的瀏覽器記憶體不夠時會直接重新整理，整段就不見了。所以只提醒、不禁止', Y) +
    ref('→ PR #66 · 重播頁讀 20 分鐘的檔案：記憶體 330 → 50 MB') + '</div></div>',
    '第四題，老師問為什麼只能錄五分鐘，能不能讓使用者自己設定。現在數據面板多了一個選單，可以選最多五、十、十五、二十分鐘，預設五分鐘，網站會記住上次的選擇；選單旁邊會寫檔案大約多大，五分鐘約 35 MB，二十分鐘約 135 MB。以前設五分鐘，是因為錄製中的資料都放在記憶體裡，二十分鐘大約要 165 MB，手機的瀏覽器記憶體不夠時會直接重新整理網頁，錄的資料就不見了。所以用手機選十五、二十分鐘時，會出現左邊這種黃字提醒，建議用電腦或分段錄，但不禁止。另外，重播分析頁讀二十分鐘的大檔案時，記憶體從 330 MB 降到約 50 MB，畫面也不會卡。'))

def level(word, d, color, border):
    return ('<div style="flex:1;display:flex;flex-direction:column;gap:10px;background:#0E1928;border:1px solid ' + border + ';border-radius:20px;padding:24px 28px">'
            f'<p style="font-size:56px;font-weight:900;line-height:1.1;color:{color}">{word}</p>'
            f'<p style="font-size:24px;color:#BFD0E0;line-height:1.5">{d}</p></div>')
wr('fb5', slide('fb5', head('Q5', '提示音的音量可以調嗎？', '可以。工具列的「音量」按鈕分四段，點一下換一段，每次試聽一聲') +
    '<div style="display:flex;flex-direction:row;gap:40px;align-items:center">'
    f'<img src="{IMG["toolbar"]}" alt="鏡頭畫面的工具列：音量 中 按鈕" style="width:760px;height:101px;object-fit:contain;border-radius:16px;border:2px solid #24405E;background:#0B1220">'
    f'<p style="font-size:24px;color:{MUTED};line-height:1.5">鏡頭畫面右上角的工具列；手機上只顯示喇叭和「中」一個字</p></div>'
    '<div style="display:flex;flex-direction:row;gap:20px">' +
    level('關', '完全不出聲', '#9AA8B8', '#1F3049') + level('小', '安靜的地方', '#F2F7FB', '#1F3049') +
    level('中', '預設', G, '#1D6B52') + level('大', '吵雜的地方、手機放得比較遠', '#F2F7FB', '#1F3049') + '</div>'
    '<div style="display:flex;flex-direction:row;gap:40px"><p style="flex:1;font-size:24px;color:#BFD0E0;line-height:1.5">網站會記住；錄製倒數、剩 30 秒、錄滿的嗶聲也跟著這個音量</p>'
    '<p style="flex:1;font-size:24px;color:#BFD0E0;line-height:1.5">網站的音量是在手機音量裡再調大小；手機本身太小聲，要先把手機音量調大</p></div>' + ref('→ PR #64'),
    '第五題，老師希望提示音可以調大小聲。工具列多了一個音量按鈕，分成關、小、中、大四段，點一下換一段，每次都會試聽一聲，馬上知道多大聲；預設是中，網站會記住。錄製前倒數、剩三十秒和錄滿的嗶聲，也都跟著這個音量。要注意的是，網站的音量是在手機音量裡面再調大小，如果手機本身調得很小聲，要先把手機音量調大。'))

depth = (f'<table style="font-size:28px;color:#BFD0E0;font-family:\'Noto Sans TC\', Arial, sans-serif"><tr><th style="width:36%;color:{B}">膝蓋角度</th><th style="width:64%;color:{B}">深蹲判斷（畫面上的顏色）</th></tr>'
         f'<tr><td style="color:#F2F7FB"><b>90° 以下</b></td><td style="color:{G}"><b>蹲到位</b></td></tr>'
         f'<tr><td style="color:#F2F7FB"><b>90～110°</b></td><td style="color:{Y}"><b>再低一點</b></td></tr>'
         f'<tr><td style="color:#F2F7FB"><b>超過 110°</b></td><td style="color:{RD}"><b>太淺</b></td></tr></table>')
wr('fb6', slide('fb6', head('Q6', '「蹲到位」：用膝蓋 90°', '照老師的決定：只看髖、膝、踝三點的夾角，不用考慮地面') +
    '<div style="display:flex;flex-direction:row;gap:56px;align-items:start">' +
    img(IMG['squat'], '首頁的深蹲示範動畫：蹲到底時膝蓋 85 度', 520, 392, '首頁的深蹲示範改成蹲到 85°（以前是 95°）') +
    '<div style="flex:1;display:flex;flex-direction:column;gap:24px">' + depth +
    item('為什麼不用看地面', '手機放歪、整個畫面跟著轉時，三點的夾角不會變；「大腿和地面平行」要先知道哪裡是水平') +
    item('程式本來就是 90°', '這次更新說明文字和首頁示範；深蹲次數仍在實驗中（?lab=squat）') +
    ref('→ PR #62 · P.@code-angle@ 關節角度怎麼算') + '</div></div>',
    '第六題是上次想請老師決定的：蹲到位要用膝蓋九十度，還是大腿和地面平行。老師決定用膝蓋九十度，只看髖、膝、踝三個點的夾角，不用考慮地面。這樣的好處是手機放歪、整個畫面跟著轉的時候，三點的夾角不會變；如果用大腿和地面平行，就要先知道哪裡是水平。網站的判斷程式本來就是九十度，所以這次只更新說明文字：九十度以下是蹲到位，九十到一百一十度是再低一點，超過一百一十度是太淺。首頁的深蹲示範以前蹲到九十五度，照新的門檻是「再低一點」，不是好的示範，所以改成蹲到八十五度。'))

def small(h, p):
    return (f'<div style="flex:1;display:flex;flex-direction:column;gap:6px;border-left:4px solid {G};padding:2px 0 2px 20px">'
            f'<h3 style="font-size:32px;font-weight:900;color:#F2F7FB;line-height:1.3">{h}</h3>'
            f'<p style="font-size:24px;color:#BFD0E0;line-height:1.5">{p}</p></div>')
wr('fb7', slide('fb7', head('Q7', '可以先示範動作給使用者看嗎？', '可以。四個動作的側面示範動畫，首頁和鏡頭畫面都看得到') +
    '<div style="display:flex;flex-direction:row;gap:48px;align-items:start">' +
    img(IMG['cards'], '首頁「支援的運動」：深蹲、伏地挺身、棒式、弓箭步四張卡片，每張有示範動畫和重點', 1060, 305, '首頁「支援的運動」：動畫＋重點（組員確認過）') +
    img(IMG['panel'], '手機鏡頭畫面：右上角「示範」打開的小視窗', 265, 340, '鏡頭畫面的「示範」') + '</div>'
    '<div style="display:flex;flex-direction:row;gap:32px">' +
    small('角度跟著動作變', '深蹲蹲到 85°、伏地挺身手肘約 90°，棒式顯示撐住幾秒') +
    small('不和 AI 搶運算', '看得到才動；鏡頭畫面蓋住首頁時，首頁的動畫會停') +
    small('目前只有示範', '弓箭步、伏地挺身、棒式還沒有判斷對錯') + '</div>',
    '第七題，老師擔心使用者腦中沒有標準姿勢，希望先給一個示範。我們做了深蹲、伏地挺身、棒式、弓箭步四個動作的側面示範動畫，和網站建議的拍攝方向一樣是側面，重要的角度會跟著動作變化，例如深蹲蹲到八十五度、伏地挺身手肘彎到大約九十度，棒式則顯示撐住幾秒。首頁的「支援的運動」改成四張卡片，每張有動畫和兩句重點，重點字組員確認過；開鏡頭之後，右上角的「示範」按鈕也能打開小視窗再看一次。動畫只在看得到的時候才動，不會和 AI 搶運算。要說明的是，這三個動作目前只有示範，網站還沒有判斷對錯。'))

wr('fb8', slide('fb8', head('Q8', '公尺的單位太大，可以改成公分嗎？', '可以，而且不難：檔案本來就記到 0.1 公釐，畫面上直接用公分') +
    '<div style="display:flex;flex-direction:row;gap:56px;align-items:start">' +
    img(IMG['cm'], '重播分析頁的 3D 檢查卡片：單位公分，大腿長約 40.2 公分', 900, 432, '重播分析頁「3D 檢查（單位：公分）」，合成資料') +
    '<div style="flex:1;display:flex;flex-direction:column;gap:24px">' + label('做了什麼') +
    item('改名「3D 座標」', '「公尺座標」聽起來只能用公尺；網站、說明文件、程式註解都改名') +
    item('畫面上用公分', '重播分析的 3D 檢查直接顯示公分，例如大腿 40.2 公分') +
    item('下載的檔案維持公尺', '和以前的檔案一致，乘以 100 就是公分；換單位不會更精確') +
    ref('→ PR #62 · docs/data-format.md') + '</div></div>',
    '第八題，老師覺得公尺這個單位太大，問能不能改成公分。可以，而且不難。我們把「公尺座標」改名叫「3D 座標」，因為原本的名字聽起來好像只能用公尺；網站、說明文件和程式註解都改了。畫面上直接用公分，左邊是重播分析頁的 3D 檢查，大腿長度顯示 40.2 公分。下載的檔案還是用公尺，這樣和以前錄的檔案、還有 MediaPipe 原本的單位一致，要公分乘以一百就好；檔案本來就記到零點一公釐，換單位不會讓數字更精確，只是比較好讀。'))

wr('fb9', slide('fb9', head('Q9', '每秒 30 格太低，能不能 60？', '可以讓使用者依手機的能力自己選：30、60、90、120 格') +
    '<div style="display:flex;flex-direction:row;gap:56px;align-items:start"><div style="width:600px;display:flex;flex-direction:column;gap:20px">' +
    img(IMG['fpsstart'], '首頁開啟鏡頭按鈕下面的畫面流暢度選單，選了每秒 60 格', 600, 293, '首頁「畫面流暢度」選單') +
    img(IMG['fpsbadge'], '運算標籤：CPU 鏡頭 57 AI 25 FPS', 500, 79, '選 60 格後的運算標籤（測試環境沒有 GPU）') + '</div>'
    '<div style="flex:1;display:flex;flex-direction:column;gap:24px">' + label('做了什麼') +
    item('30 是預設', '大部分手機鏡頭預設每秒送 30 格，AI 最多也只能算 30 格') +
    item('60 以上是實驗', '要鏡頭支援、AI 每格 16.7 毫秒內算完、手機不過熱；做不到時自動用做得到的，鏡頭做不到的選項變灰') +
    item('看得到實際結果', '運算標籤分開顯示「鏡頭幾格 · AI 幾格」，看得出卡在鏡頭還是 AI；開著鏡頭點標籤就能切換') +
    ref('→ PR #67 · 要用真手機測（P.13）') + '</div></div>',
    '第九題，老師覺得每秒三十格太低，問能不能到六十。三十格其實是大部分手機鏡頭預設送畫面的上限，AI 最多也只能算三十格。六十格以上要三件事都做到：鏡頭支援、AI 每一格在 16.7 毫秒內算完、手機不過熱降速。每支手機的能力不一樣，所以我們讓使用者自己選：首頁「開啟鏡頭」下面多了「畫面流暢度」，可以選三十、六十、九十、一百二十格，三十是建議值，六十以上標成實驗。鏡頭做不到的選項會變灰；選了做不到的，就自動用鏡頭做得到的。選六十格以上時，運算標籤會分開顯示鏡頭送來幾格、AI 算了幾格，使用者自己就看得出是卡在鏡頭還是 AI。下面那張是測試環境的截圖，沒有 GPU，所以 AI 只有二十五格；真手機的表現要請組員實測。'))

chk = (f'<table style="font-size:28px;color:#BFD0E0;font-family:\'Noto Sans TC\', Arial, sans-serif"><tr><th style="width:26%;color:{Y}">要確認的事</th><th style="width:40%;color:{Y}">怎麼測</th><th style="width:34%;color:{Y}">記下什麼</th></tr>'
       '<tr><td style="color:#F2F7FB"><b>提示音（Q3、Q5）</b></td><td>iPhone 打開側邊的靜音開關，開鏡頭、走出畫面</td><td>有沒有「逼逼逼」</td></tr>'
       '<tr><td style="color:#F2F7FB"><b>長時間錄製（Q4）</b></td><td>手機選 10、15、20 分鐘，錄滿後下載</td><td>網頁有沒有自己重新整理、檔案多大</td></tr>'
       '<tr><td style="color:#F2F7FB"><b>每秒格數（Q9）</b></td><td>前、後鏡頭各選 60、90、120 格，運動 5 分鐘</td><td>標籤的「鏡頭幾格 · AI 幾格」、哪些選項變灰、會不會發燙</td></tr></table>')
wr('fbcheck', slide('fbcheck',
    '<div style="display:flex;flex-direction:column;gap:16px">'
    f'<p style="{MONO};font-size:24px;letter-spacing:6px;color:{Y}">NEXT · 要請組員用真手機確認</p>'
    '<h2 style="font-size:72px;font-weight:900;line-height:1.15;color:#F2F7FB">還要用真手機確認的 3 件事</h2>'
    '<p style="font-size:32px;color:#BFD0E0;line-height:1.4">功能都做好了，但這三件事在電腦的測試環境裡測不出來</p></div>' + chk +
    '<p style="font-size:24px;color:#BFD0E0;line-height:1.5">記下手機型號、瀏覽器和結果，下次報告補上；有問題我們再調整</p>',
    '九題都做好了，但有三件事在電腦的測試環境裡測不出來，要請組員用真的手機確認。第一，iPhone 側邊的靜音開關打開時，網頁的提示音會不會響。第二，用手機選十分鐘以上的錄製，錄滿之後網頁有沒有自己重新整理、檔案多大。第三，每秒格數選六十、九十、一百二十格時，運算標籤顯示鏡頭和 AI 各幾格、哪些選項變灰、運動五分鐘手機會不會發燙。請記下手機型號、瀏覽器和結果，下次報告補上。'))

# ---------- 新的順序 ----------
OLD = json.load(open(R + '/deck.json', encoding='utf8'))['order']
PREV = ['questions', 'q1', 'q2', 'q5', 'q3', 'q6', 'q4', 'numbers', 'real-what', 'real-data', 'real-fixes', 'real-change', 'real-open',
        'mobile-found', 'readable', 'mobile-speed']
FB = ['fbq'] + [q[0] for q in QS] + ['fbcheck']
REST = [s for s in OLD if s not in PREV and s not in ('cover', 'agenda')]
order = ['cover', 'agenda'] + FB + REST + PREV
assert len(order) == len(set(order)) == len(OLD) + len(FB), len(order)
page = {s: i + 1 for i, s in enumerate(order)}
oldpage = {i + 1: s for i, s in enumerate(OLD)}
TOTAL = len(order)
P = lambda s: '%02d' % page[s]

# 頁碼引用：舊頁碼 → 投影片 → 新頁碼（「P.04」「P.11–15」）
def remap(t):
    def one(m):
        a = int(m.group(1)); s = 'P.%02d' % page[oldpage[a]]
        if m.group(2):
            b = int(m.group(2)); s += '–%02d' % page[oldpage[b]]
        return s
    return re.sub(r'P\.(\d\d)(?:–(\d\d))?', one, t)

# ---------- 舊的第一部分：標成「10/12 報告」 ----------
for s in PREV:
    t = rd(s)
    t = t.replace('>TEACHER Q&amp;A · 老師上次的 6 個問題<', '>10/12 報告 · 老師上次的 6 個問題<')
    t = re.sub(r'>TEACHER Q&amp;A · (Q\d)<', r'>10/12 報告 · \1<', t)
    t = t.replace('>AI 智慧運動分析系統 · 第二批次<', '>AI 智慧運動分析系統 · 10/12 報告<')
    wr(s, t)
t = rd('questions')
t = aside(t, '這一節是上次，十月十二號報告的內容，留在這裡給老師對照。當時回覆的是更早之前老師提的六個問題：Q1、Q2、Q5 完成，Q3 完成前半，Q6 的驗證工具做好了，Q4 暫緩。Q3 想請老師決定的深蹲門檻，老師已經決定用膝蓋九十度，見第九頁。')
wr('questions', t)
t = rd('q3')
t = rep(t, '<p style="font-size:32px;font-weight:900;color:#FFB547;white-space:nowrap">想請老師決定</p>', '<p style="font-size:32px;font-weight:900;color:#2EE6A6;white-space:nowrap">老師已決定</p>')
t = rep(t, '「蹲到位」要用膝蓋 90°，還是大腿與地面平行（約 60～70°）？', '用膝蓋 90°，只看髖、膝、踝三點的夾角（10/12）→ P.@fb6@')
t = rep(t, 'background:#3A2A12;border:1px solid #FFB547;border-radius:16px;padding:20px 32px', 'background:#103A2D;border:1px solid #2EE6A6;border-radius:16px;padding:20px 32px')
wr('q3', t)
t = rd('q6')
t = rep(t, '另外一組<span style="color:#4CC3FF">公尺座標</span>，原點在髖部中心', '另外一組<span style="color:#4CC3FF">3D 座標</span>（以前叫公尺座標），原點在髖部中心')
t = rep(t, '真人實測的細節在後面第 11 到 15 頁。', '真人實測的細節在這一節後面。')
wr('q6', t)

# ---------- 詳細資料：「第一部分說明」→「10/12 報告說明」 ----------
for s in ['phase2', 'phase3', 'phase4', 'phase7', 'phase9', 'stable', 'tests', 'testenv', 'timeline']:
    t = re.sub(r'(?<=[\u4e00-\u9fff])第一部分', ' 10/12 報告', rd(s)).replace('第一部分', '10/12 報告')
    wr(s, t)
t = rd('testenv')
t = rep(t, '真人手機實測的經過在 10/12 報告第十六頁。', '真人手機實測的經過在 10/12 報告那一節。')
wr('testenv', t)
t = rd('code-data')
t = rep(t, '老師第五題的回覆在第六頁。', '老師上次第五題的回覆在 10/12 報告那一節。')
wr('code-data', t)
for s in ['code-data', 'angle', 'phase7']:
    t = rd(s).replace('公尺座標', '3D 座標')
    wr(s, t)

# ---------- 封面 ----------
t = rd('cover')
t = rep(t, 'const ok=kneeA<110;', 'const ok=kneeA<=90;')
t = rep(t, 'if(kneeA<100)down=true;', 'if(kneeA<=90)down=true;')
t = rep(t, '第二批次進度報告（10/10 更新）', '第二批次進度報告（10/13 更新）')
t = rep(t, '>PR #7–#60<', '>PR #7–#67<')
t = rep(t, '>54 次更新<', '>61 次更新<')
t = rep(t, '>2026.10.10<', '>2026.10.13<')
t = aside(t, '開場。右邊的動畫是概念示意：骨架即時偵測深蹲，膝蓋角度跟著變化，膝蓋到 90 度以下就算蹲到位；角度和骨架是已經完成的功能，深蹲次數目前是實驗功能。這次報告的範圍是 PR 第 7 到第 67 號，共 61 次更新，其中第 61 到 67 號是回應老師上次的九個問題。今天的簡報分成兩部分：前面十六頁是報告，先一題一頁回覆老師上次的九個問題，再說明還要用真手機確認的三件事，最後是限制和下一步；後面是詳細資料，包括設計邏輯、每一次更新、程式碼，以及上次十月十二號報告的內容，老師可以之後慢慢看。')
wr('cover', t)

# ---------- 目錄 ----------
def arow(n, h, p, pages):
    return ('<div style="display:flex;flex-direction:row;gap:28px;align-items:center;border-top:1px solid #1F3049;padding:16px 0 0">'
            f'<p style="width:80px;{NUM};font-size:44px;font-weight:700;line-height:1;color:{G}">{n}</p>'
            f'<div style="flex:1;display:flex;flex-direction:column;gap:4px"><h3 style="font-size:32px;font-weight:900;color:#F2F7FB;line-height:1.3">{h}</h3>'
            f'<p style="font-size:24px;color:#BFD0E0">{p}</p></div><p style="{MONO};font-size:24px;color:{MUTED}">{pages}</p></div>')
def drow(h, pages):
    return ('<div style="display:flex;flex-direction:row;justify-content:space-between;align-items:center;border-top:1px solid #1F3049;padding:14px 0 0">'
            f'<p style="font-size:24px;font-weight:700;color:#F2F7FB">{h}</p><p style="{MONO};font-size:24px;color:{MUTED}">{pages}</p></div>')
DETAIL = [('系統與設計邏輯', 'layers', 'principles'), ('開發環境與工作方式', 'stack', 'testenv'), ('更新歷程：61 次更新', 'growth', 'phase10'),
          ('程式碼介紹', 'filemap', 'urlparams'), ('技術突破與測試', 'ghost', 'tests'), ('10/12 報告的內容', 'questions', 'mobile-speed')]
rng = lambda a, b: 'P.@%s@–@%s@' % (a, b)  # 最後一步才換成新頁碼
t = rd('agenda')
body = ('<div style="display:flex;flex-direction:column;gap:16px">'
        f'<p style="{MONO};font-size:24px;letter-spacing:6px;color:{G}">AGENDA · 今天的內容</p>'
        '<h2 style="font-size:72px;font-weight:900;line-height:1.15;color:#F2F7FB">兩個部分：先報告，再附詳細資料</h2></div>'
        '<div style="display:flex;flex-direction:row;gap:56px;align-items:start"><div style="flex:1;display:flex;flex-direction:column;gap:16px">'
        f'<p style="{MONO};font-size:24px;letter-spacing:4px;color:{G}">第一部分 · 報告</p>' +
        arow('01', '老師上次的 9 個問題', '一題一頁，照老師提問的順序', rng('fbq', 'fb9')) +
        arow('02', '還要用真手機確認的事', '提示音、長時間錄製、每秒格數', 'P.@fbcheck@') +
        arow('03', '限制與下一步', '還沒做到的地方、接下來的規劃', rng('limits', 'end')) + '</div>'
        '<div style="width:600px;display:flex;flex-direction:column;gap:14px;background:#0E1928;border:1px solid #1F3049;border-radius:20px;padding:32px 36px">'
        f'<p style="{MONO};font-size:24px;letter-spacing:4px;color:{B}">第二部分 · 詳細資料</p>'
        '<p style="font-size:24px;color:#BFD0E0;line-height:1.5">報告時不逐頁講，老師可以之後慢慢看</p>' +
        ''.join(drow(h, rng(a, b)) for h, a, b in DETAIL) + '</div></div>')
t = re.sub(r'(<section[^>]*>\n).*?(\n<div style="position:absolute;left:128px;bottom:64px)', lambda m: m.group(1) + body + m.group(2), t, count=1, flags=re.S)
t = aside(t, '開始之前，先說明今天的簡報分成兩部分。第一部分是報告，共十六頁：先一題一頁回覆老師上次的九個問題，再說明還要請組員用真手機確認的三件事，最後是限制和下一步。第二部分是詳細資料，包括系統設計、開發環境、六十一次更新各改了什麼、程式碼和技術細節，以及上次十月十二號報告的內容，報告時不會逐頁講，老師可以之後慢慢看。')
wr('agenda', t)

# ---------- 附錄首頁 ----------
t = rd('appendix')
t = rep(t, '>更新歷程：54 次更新<', '>更新歷程：61 次更新<')
t = rep(t, '>技術突破與測試</h3></div></div>', '>技術突破與測試</h3></div>'
        '<div style="flex:1;display:flex;flex-direction:column;gap:8px">'
        f'<p style="{MONO};font-size:24px;color:{B}">P.@questions@–@mobile-speed@</p>'
        '<h3 style="font-size:32px;font-weight:900;color:#F2F7FB;line-height:1.3">10/12 報告的內容</h3></div></div>')
t = aside(t, '報告的部分到這裡。後面是詳細資料，包括系統和設計邏輯、開發環境和工作方式、六十一次更新各改了什麼、程式碼介紹、技術突破和測試，最後一節是上次十月十二號報告的內容：當時回覆的六個問題、真人實測和手機上的改進。報告時不會逐頁講，老師可以之後慢慢看。')
wr('appendix', t)

# ---------- 限制、下一步、結尾 ----------
t = rd('limits')
t = rep(t, '次數與深度在實驗中（?lab=squat），對錯判斷與門檻待討論', '次數與深度在實驗中（?lab=squat）；蹲到位定為 90°，前傾的門檻還沒定')
wr('limits', t)
t = rd('roadmap')
t = rep(t, '問題節點標紅（老師 Q3）', '問題節點標紅（10/12 報告 Q3 的後半）')
t = t.replace('完成老師 Q3 的後半段', '完成上次報告 Q3 的後半段')
wr('roadmap', t)
t = rd('end')
t = rep(t, '第 22～53 頁是詳細資料，老師可以之後慢慢看', '第 %d～%d 頁是詳細資料，老師可以之後慢慢看' % (page['appendix'], TOTAL))
t = rep(t, '後面第二十二頁開始是詳細資料。', '後面第十七頁開始是詳細資料，最後一節是上次十月十二號報告的內容。')
t = rep(t, '真人測試已經完成，網站在四種裝置上都穩定。', '老師上次的九個問題都完成了，真手機上的三件事請組員確認。')
wr('end', t)

# ---------- 更新歷程 ----------
t = rd('growth')
t = rep(t, '現在（10/6）', '現在（10/13）')
t = rep(t, 'line-height:1">8,912</p>', 'line-height:1">10,213</p>')
t = rep(t, '>行，51 個檔案；程式分 7 個資料夾<', '>行，55 個檔案；程式分 7 個資料夾<')
t = rep(t, 'line-height:1;color:#F2F7FB">54</p>', 'line-height:1;color:#F2F7FB">61</p>')
t = rep(t, '>次更新（PR #7～#60）<', '>次更新（PR #7～#67）<')
t = rep(t, 'line-height:1;color:#2EE6A6">32</p>', 'line-height:1;color:#2EE6A6">42</p>')
t = aside(t, '這頁用數字看程式的變化。第一批次結束時，整個網站只有一個 256 行的檔案；十月一號第二批次報告時是 2,967 行、22 個檔案；現在是 10,213 行、55 個檔案，程式依功能分成七個資料夾。行數增加的部分除了功能，也包括自動測試和說明文件。每次推送都會自動跑 42 項測試，每次合併前還會重跑 39 項情境測試，每次大約四十五分鐘。')
wr('growth', t)
t = rd('timeline')
t = rep(t, '54 次更新分成六個階段', '61 次更新分成七個階段')
col = ('<div style="flex:1;display:flex;flex-direction:column;gap:12px">'
       f'<p style="{MONO};font-size:24px;color:{MUTED}">10/12–10/13</p><div style="height:8px;background:{Y};border-radius:999px;opacity:1.0"></div>'
       f'<p style="{NUM};font-size:44px;font-weight:700;color:{Y};line-height:1">#61–67</p>'
       '<h3 style="font-size:32px;font-weight:900;color:#F2F7FB;line-height:1.3">老師 10/12 的 9 個問題</h3>'
       f'<p style="font-size:24px;color:#BFD0E0;line-height:1.5">已在第一部分說明（{rng("fbq", "fb9")}）</p></div>')
i = t.index('<p style="' + MONO + ';font-size:24px;color:#8299B2">10/2–10/6</p>')
j = t.index('</div></div>', i) + len('</div>')
t = t[:j] + col + t[j:]
t = t.replace('<h3 style="font-size:32px;font-weight:900;color:#F2F7FB;line-height:1.3">', '<h3 style="font-size:28px;font-weight:900;color:#F2F7FB;line-height:1.3">')
t = aside(t, '61 次更新可以分成七個階段。第一階段回答老師更早之前的問題，第六階段的驗證工具和真人錄影，都在最後一節「10/12 報告」裡說明；第七階段，也就是 PR 第 61 到 67 號，就是今天第一部分回覆的九個問題。後面幾頁只列出沒有講到的更新，講過的只標 PR 編號和頁碼，不會再講一次。')
wr('timeline', t)

t = rd('tests')
t = t.replace('32 項自動測試', '42 項自動測試').replace('目前 32 項', '目前 42 項')
wr('tests', t)
t = rd('urlparams')
t = rep(t, '例：ttweew.github.io/claude-workspace/?model=full', '例：ttweew.github.io/claude-workspace/?model=full　每秒格數平常在首頁選，?fps=60 也可以直接指定')
wr('urlparams', t)

# ---------- 頁碼、交叉引用 ----------
for s in order:
    t = rd(s)
    if s not in FB:  # 新頁面裡的 P.@id@ 已經是新頁碼
        t = remap(t)
    t = re.sub(r'P\.@([a-z0-9-]+)@–@([a-z0-9-]+)@', lambda m: 'P.%s–%s' % (P(m.group(1)), P(m.group(2))), t)
    t = re.sub(r'P\.@([a-z0-9-]+)@', lambda m: 'P.' + P(m.group(1)), t)
    assert '@' not in re.sub(r'<aside>.*?</aside>', '', t, flags=re.S) or s == 'cover', s
    t2, k = re.subn(r'(>)\d\d / (?:53|00)(<)', lambda m: m.group(1) + '%02d / %d' % (page[s], TOTAL) + m.group(2), t)
    assert k == (0 if s == 'cover' else 1), (s, k)
    wr(s, t2)

d = json.load(open(R + '/deck.json', encoding='utf8'))
d['order'] = order
d['sections'] = {
    's1': {'description': '開場與目錄：先報告，再附詳細資料', 'start': 'cover'},
    's2': {'description': '老師上次的 9 個問題：一題一頁', 'start': 'fbq'},
    's3': {'description': '還要用真手機確認的事、限制與下一步', 'start': 'fbcheck'},
    's6': {'description': '詳細資料：系統與設計邏輯', 'start': 'appendix'},
    's7': {'description': '詳細資料：開發環境與工作方式', 'start': 'stack'},
    's8': {'description': '詳細資料：更新歷程（61 次更新）', 'start': 'growth'},
    's9': {'description': '詳細資料：程式碼介紹', 'start': 'filemap'},
    's10': {'description': '詳細資料：技術突破與測試', 'start': 'ghost'},
    's11': {'description': '10/12 報告的內容：老師的 6 個問題、真人實測、手機', 'start': 'questions'},
}
json.dump(d, open(R + '/deck.json', 'w', encoding='utf8'), ensure_ascii=False, indent=2)
print('頁數', TOTAL, '詳細資料從', page['appendix'], '10/12 報告從', page['questions'])
