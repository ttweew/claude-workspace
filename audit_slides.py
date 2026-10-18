# 地基審查（10/18）：第 1 頁怎麼測、測出來的例子；第 2 頁找到並修好的問題（分四類）
AUD = NUMS['audit']
tests = ''.join(
    '<div style="display:flex;flex-direction:row;gap:20px;align-items:baseline;border-top:2px solid #1F3049;padding:12px 0 0">'
    f'<p style="{NUM};font-size:40px;font-weight:700;line-height:1;color:{c};width:170px;white-space:nowrap">{n}</p>'
    f'<p style="flex:1;font-size:24px;color:#BFD0E0;line-height:1.4">{d}</p></div>'
    for n, d, c in AUD['tests'])
wr('audit', slide('audit', head('FOUNDATION · 地基審查（10/18）', '先打好地基：穩定、自我修復、安全、數字', '組員 10/18：後端先等等，把串接、自我修復、安全漏洞、每個數字都檢查一遍', '完成') +
    ROW(56) + COL(12, 900) + label('怎麼測') + tests + '</div>' +
    COL(24) + label('測出來的例子', Y) +
    item('故意改過的網址', '改之前：網址加 ?workout=constructor，網頁出錯、AI 一直停在「準備中」；改之後照常使用', RD) +
    item('長時間運行 12 分鐘', '伏地挺身 194 下一下不漏、不多算；錄滿 10 分鐘 17,959 格；不錄的時候記憶體不會一直漲', G) +
    item('鏡頭畫面停住', '3 秒自動繼續播放，8 秒自動重開鏡頭（次數保留），重開還是不行才請使用者處理', B) +
    '</div></div>' +
    ref('還沒做、要真手機測過才做：AI 檔案存進手機前核對檔案指紋、內容安全政策（CSP）'),
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
