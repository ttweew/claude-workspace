# 階段 2：鏡頭畫面工具列（「結束」最明顯、功能按鈕加圖示、開關狀態）
R = '/home/user/claude-workspace/'
def sub(s, old, new, n=1):
    assert s.count(old) == n, (old[:70], s.count(old)); return s.replace(old, new)
ICON = lambda d: f'<svg viewBox="0 0 24 24" aria-hidden="true">{d}</svg>'
s = open(R + 'index.html', encoding='utf-8').read()
s = sub(s, '''            <button id="stopBtn" class="primary">關閉鏡頭</button>''',
'''            <!-- 結束：最常用、最重要的按鈕，放最左邊、實心強調 -->
            <button id="stopBtn" class="primary" title="關閉鏡頭，回到首頁">''' + ICON('<path d="M6 6l12 12M18 6L6 18"/>') + '''<span class="btn-text">結束</span></button>''')
s = sub(s, '''            <button id="labelBtn" title="也可以直接點畫面上的點，查看它的編號與名稱">顯示編號</button>
            <button id="dataBtn" title="顯示關鍵點的 x、y、z 數值，並可錄製匯出">數據</button>
            <button id="fullscreenBtn">全螢幕</button>''',
'''            <!-- 功能按鈕靠右：圖示＋文字；開關類的按鈕用 aria-pressed 告訴螢幕閱讀器現在是開還是關 -->
            <button id="labelBtn" class="tool" aria-pressed="false" title="也可以直接點畫面上的點，查看它的編號與名稱">''' + ICON('<path d="M5 5h6l8 8-6 6-8-8z"/><circle cx="8.5" cy="8.5" r="1.2"/>') + '''<span class="btn-text">顯示編號</span></button>
            <button id="dataBtn" class="tool" aria-pressed="false" title="顯示關鍵點的 x、y、z 數值，並可錄製匯出">''' + ICON('<path d="M4 5h16v14H4zM4 10h16M10 10v9"/>') + '''<span class="btn-text">數據</span></button>
            <button id="fullscreenBtn" class="tool">''' + ICON('<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>') + '''<span class="btn-text">全螢幕</span></button>''')
open(R + 'index.html', 'w', encoding='utf-8').write(s)

s = open(R + 'js/main.js', encoding='utf-8').read()
s = sub(s, """    dataBtn.textContent = (dataPanel.hidden ? '數據' : '隱藏數據') + (recorder.recording ? ' ●' : '');""",
"""    setBtnText(dataBtn, (dataPanel.hidden ? '數據' : '隱藏數據') + (recorder.recording ? ' ●' : ''));
    dataBtn.setAttribute('aria-pressed', String(!dataPanel.hidden));""")
s = sub(s, """    labelBtn.textContent = showLabels ? '隱藏編號' : '顯示編號';""",
"""    setBtnText(labelBtn, showLabels ? '隱藏編號' : '顯示編號');
    labelBtn.setAttribute('aria-pressed', String(showLabels));""")
s = sub(s, """    fullscreenBtn.textContent = document.fullscreenElement ? '離開全螢幕' : '全螢幕';""",
"""    setBtnText(fullscreenBtn, document.fullscreenElement ? '離開全螢幕' : '全螢幕');""")
s = sub(s, """function updateLabelBtn() {""", """// 工具列按鈕：只換文字，保留前面的圖示
function setBtnText(button, text) {
    const span = button.querySelector('.btn-text');
    if (span.textContent !== text) span.textContent = text;
}

function updateLabelBtn() {""")
open(R + 'js/main.js', 'w', encoding='utf-8').write(s)

s = open(R + 'css/style.css', encoding='utf-8').read()
s = sub(s, """#toolbar button, #toolbar select {
    min-height: 36px;
    padding: 0 12px;""", """#toolbar button, #toolbar select {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    min-height: 36px;
    padding: 0 12px;""")
s = sub(s, """#toolbar select option {
    color: #1B2536;
}""", """#toolbar select option {
    color: #1B2536;
}
#toolbar svg {
    width: 18px;
    height: 18px;
    flex: none;
    fill: none;
    stroke: currentColor;
    stroke-width: 2;
    stroke-linecap: round;
    stroke-linejoin: round;
}
/* 功能按鈕靠右，和「結束」分開，不會誤按（有鏡頭選單時，選單在中間佔剩下的寬度） */
#labelBtn {
    margin-left: auto;
}
/* 開啟中的功能（顯示編號、數據）：綠色外框 */
#toolbar .tool[aria-pressed="true"] {
    border-color: rgba(46, 230, 166, 0.7);
    background: rgba(46, 230, 166, 0.16);
}
/* 窄螢幕：功能按鈕只留文字（圖示佔空間），一行才放得下；「結束」保留 ✕ */
@media (max-width: 480px) {
    #toolbar .tool svg {
        display: none;
    }
}""")
open(R + 'css/style.css', 'w', encoding='utf-8').write(s)
print('階段 2 已套用')
