# 階段 3：數據面板可以收合表格（只留錄製列），手機上不會蓋住大半個畫面
R = '/home/user/claude-workspace/'
def sub(s, old, new, n=1):
    assert s.count(old) == n, (old[:70], s.count(old)); return s.replace(old, new)
s = open(R + 'index.html', encoding='utf-8').read()
s = sub(s, """                <button id="jsonBtn" hidden>下載 JSON</button>
            </div>
            <div class="panel-body">""", """                <button id="jsonBtn" hidden>下載 JSON</button>
                <!-- 收合表格：只留上面這一列（錄製、下載），畫面上的人不會被擋住 -->
                <button id="panelToggle" class="panel-toggle" aria-expanded="true" aria-controls="panelBody">收合表格</button>
            </div>
            <div class="panel-body" id="panelBody">""")
open(R + 'index.html', 'w', encoding='utf-8').write(s)

s = open(R + 'js/main.js', encoding='utf-8').read()
s = sub(s, """const jsonBtn = document.getElementById('jsonBtn');""", """const jsonBtn = document.getElementById('jsonBtn');
const panelToggle = document.getElementById('panelToggle');
const panelBody = document.getElementById('panelBody');""")
s = sub(s, """dataBtn.addEventListener('click', toggleDataPanel);""", """dataBtn.addEventListener('click', toggleDataPanel);
// 數據面板的表格可以收合，只留錄製列；選擇會記在瀏覽器裡
const PANEL_KEY = 'panelCollapsed';
function setPanelCollapsed(collapsed) {
    panelBody.hidden = collapsed;
    panelToggle.setAttribute('aria-expanded', String(!collapsed));
    panelToggle.textContent = collapsed ? '展開表格' : '收合表格';
    try {
        localStorage.setItem(PANEL_KEY, collapsed ? '1' : '0');
    } catch (err) {
        // 無法儲存也不影響使用
    }
}
panelToggle.addEventListener('click', () => setPanelCollapsed(!panelBody.hidden));
try {
    if (localStorage.getItem(PANEL_KEY) === '1') setPanelCollapsed(true);
} catch (err) {
    // 無痕模式等情況可能無法讀取，就用預設的展開
}""")
open(R + 'js/main.js', 'w', encoding='utf-8').write(s)

s = open(R + 'css/style.css', encoding='utf-8').read()
s = sub(s, """#recordInfo {
    font-variant-numeric: tabular-nums;
}""", """#recordInfo {
    font-variant-numeric: tabular-nums;
}
/* 收合表格的按鈕靠右 */
.panel-head .panel-toggle {
    margin-left: auto;
}
.panel-body[hidden] {
    display: none;
}""")
open(R + 'css/style.css', 'w', encoding='utf-8').write(s)
print('階段 3 已套用')
