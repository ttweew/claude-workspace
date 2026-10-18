# 階段 1：首頁、重播頁加導覽列；首頁手機版精簡、步驟移到功能介紹前；重播摘要不斷行
import re
R = '/home/user/claude-workspace/'
def nav(current):
    items = [('./', '首頁', '<path d="M4 11l8-6 8 6v8a1 1 0 0 1-1 1h-4v-5h-6v5H5a1 1 0 0 1-1-1z"/>'),
             ('replay.html', '重播分析', '<path d="M4 19h16M6 15l4-5 3 3 5-7"/>'),
             ('help.html', '使用說明', '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6V14M12 17.5v.01"/>')]
    links = '\n'.join(f'''            <a href="{h}"{' aria-current="page"' if h == current else ''}>
                <svg viewBox="0 0 24 24" aria-hidden="true">{icon}</svg>{label}
            </a>''' for h, label, icon in items)
    return f'''    <nav class="site-nav" aria-label="網站導覽">
        <a class="nav-brand" href="./">
            <svg class="brand-mark" viewBox="0 0 32 32" aria-hidden="true">
                <rect width="32" height="32" rx="9"/>
                <g><circle cx="16" cy="7.5" r="2.6"/><path d="M16 11v8M9 14l7-2 7 2M16 19l-5 7M16 19l5 7"/></g>
            </svg>
            <span class="nav-name">AI 運動分析</span>
        </a>
        <div class="nav-links">
{links}
        </div>
    </nav>
'''
def sub(s, old, new, n=1):
    assert s.count(old) == n, (old[:60], s.count(old)); return s.replace(old, new)

# 使用說明頁：導覽列改用同一份產生（三頁一致）
s = open(R + 'help.html', encoding='utf-8').read()
s = re.sub(r'    <nav class="site-nav".*?</nav>\n', nav('help.html'), s, flags=re.S)
open(R + 'help.html', 'w', encoding='utf-8').write(s)

# 首頁
s = open(R + 'index.html', encoding='utf-8').read()
s = sub(s, '<body>\n    <div class="page">', '<body>\n' + nav('./') + '\n    <div class="page">')
# 開始前的準備移到功能介紹前面：第一次來的人最需要知道怎麼擺手機
steps = re.search(r'            <section aria-labelledby="stepsTitle">.*?</section>\n\n', s, flags=re.S).group(0)
s = s.replace(steps, '')
s = sub(s, '            <section aria-labelledby="featuresTitle">', steps + '            <section aria-labelledby="featuresTitle">')
s = sub(s, '<p>&copy; 2026 AI 智慧運動分析系統 · 專題作品 · <a href="replay.html">錄製資料重播分析</a></p>',
        '<p>&copy; 2026 AI 智慧運動分析系統 · 專題作品 · <a href="help.html">使用說明</a> · <a href="replay.html">重播分析</a></p>')
s = sub(s, '<p class="note">動作判斷與次數計算開發中，目前可以看骨架、角度與入鏡提示。</p>',
        '<p class="note">動作判斷與次數計算開發中，目前可以看骨架、角度與入鏡提示。第一次使用可以先看<a href="help.html">使用說明</a>。</p>')
open(R + 'index.html', 'w', encoding='utf-8').write(s)

# 重播頁
s = open(R + 'replay.html', encoding='utf-8').read()
s = sub(s, '<body>\n    <div class="page replay">', '<body>\n' + nav('replay.html') + '\n    <div class="page replay">')
s = sub(s, '            <a class="back" href="./">← 回首頁</a>\n', '')
open(R + 'replay.html', 'w', encoding='utf-8').write(s)

# 重播摘要：每一段（例如「14.5 秒」「436 格」）不在中間斷行
s = open(R + 'js/replay.js', encoding='utf-8').read()
s = sub(s, """        dt.textContent = k;
        dd.textContent = v;""", """        dt.textContent = k;
        // 以「 · 」分段，每一段放在一起不拆開（例如「436 格」不會把「格」擠到下一行）
        v.split(' · ').forEach((part, i) => {
            if (i) dd.append(' · ');
            const span = document.createElement('span');
            span.textContent = part;
            dd.append(span);
        });""")
open(R + 'js/replay.js', 'w', encoding='utf-8').write(s)
s = open(R + 'css/replay.css', encoding='utf-8').read()
s = sub(s, """.summary dd {
    margin: 2px 0 0;
    font-weight: 700;
    overflow-wrap: anywhere;
}""", """.summary dd {
    margin: 2px 0 0;
    font-weight: 700;
}
/* 每一段盡量不拆開；真的放不下（很長的名稱）才在段內換行 */
.summary dd span {
    display: inline-block;
    max-width: 100%;
    overflow-wrap: anywhere;
}""")
s = sub(s, """.back {
    color: var(--info);
    text-decoration: none;
}
.back:hover, .back:focus-visible {
    text-decoration: underline;
}
""", "")
open(R + 'css/replay.css', 'w', encoding='utf-8').write(s)

# 首頁手機版：功能介紹改成 2×2 小格
s = open(R + 'css/style.css', encoding='utf-8').read()
s = sub(s, """.feature p {
    margin: 0;
    color: var(--muted);
    font-size: 14px;
}""", """.feature p {
    margin: 0;
    color: var(--muted);
    font-size: 14px;
}
/* 手機：功能介紹排成 2×2 小格，不用滑那麼久才看到下面的內容 */
@media (max-width: 560px) {
    .features {
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 10px;
    }
    .feature {
        padding: 14px;
    }
    .feature svg {
        width: 32px;
        height: 32px;
    }
    .feature h3 {
        margin: 10px 0 4px;
        font-size: 15px;
    }
    .feature p {
        font-size: 13px;
        line-height: 1.5;
    }
}""")
s = sub(s, """footer a, .panel-note a {""", """footer a, .panel-note a, .note a {""")
open(R + 'css/style.css', 'w', encoding='utf-8').write(s)
# 鏡頭畫面開啟時：疊在導覽列上面，導覽列也不能點、鍵盤 Tab 不會跳過去
s = open(R + 'js/main.js', encoding='utf-8').read()
s = sub(s, """const page = document.querySelector('.page');
function showStage(on) {
    if (stage.hidden !== on) return;
    stage.hidden = !on;
    page.inert = on;""", """const page = document.querySelector('.page');
const siteNav = document.querySelector('.site-nav');
function showStage(on) {
    if (stage.hidden !== on) return;
    stage.hidden = !on;
    page.inert = on;
    if (siteNav) siteNav.inert = on;""")
open(R + 'js/main.js', 'w', encoding='utf-8').write(s)
s = open(R + 'css/style.css', encoding='utf-8').read()
s = sub(s, """#stage {
    position: fixed;
    inset: 0;""", """#stage {
    position: fixed;
    inset: 0;
    z-index: 30;  /* 蓋過固定在上方的導覽列 */""")
open(R + 'css/style.css', 'w', encoding='utf-8').write(s)
print('階段 1 已套用')
