# 11/4 保養（11/3 提前做）：把草稿套到主要資料夾（PR A 合併、分支重開之後才跑）
import shutil, re
W = '/home/user/claude-workspace'
S = '/tmp/claude-0/-home-user-claude-workspace/06177a5d-45ba-5b18-b395-0fd8d80e2079/scratchpad/main1104/draft'
def sub1(path, a, b):
    s = open(path, encoding='utf-8').read()
    assert s.count(a) == 1, (path, a[:60], s.count(a))
    open(path, 'w', encoding='utf-8').write(s.replace(a, b))
# 1. 測試用的網站伺服器可以開別的資料夾（發布時加了版本號的複本）
sub1(W + '/tests/browser/harness.mjs',
     "// 在本機開網站（127.0.0.1、隨便一個沒用的 port）；回傳 { base, close }\nexport function serve() {",
     "// 在本機開網站（127.0.0.1、隨便一個沒用的 port）；回傳 { base, close }\n// root：網站的資料夾（預設是這個專案；11/4 保養：發布時每個檔案加了版本號的複本）\nexport function serve(root = ROOT) {")
sub1(W + '/tests/browser/harness.mjs',
     "        const file = normalize(join(ROOT, path === '/' ? 'index.html' : path));\n        if (!file.startsWith(ROOT)) { res.writeHead(403).end(); return; }",
     "        const file = normalize(join(root, path === '/' ? 'index.html' : path));\n        if (!file.startsWith(root)) { res.writeHead(403).end(); return; }")
# 2. 新的瀏覽器測試
shutil.copy(S + '/ai-site.test.mjs', W + '/tests/browser/ai-site.test.mjs')
# 3. 資料一致性：首頁錄的檔案，重播分析每一下的 AI 判斷和 node 算的一樣
c = W + '/tests/browser/consistency.test.mjs'
sub1(c, "import { cloudSession, sessionId } from '../../js/cloud/sync.js';",
     "import { cloudSession, sessionId } from '../../js/cloud/sync.js';\nimport { parseRecording, analyzeRecording } from '../../js/data/replay-core.js';\nimport { aiJudge, judgeText } from '../../js/analysis/ai-judge.js';")
sub1(c, "    assert.deepEqual(replay.reps.map(r => [r[0], r[2], depthWord(r[3])]), home.reps.map(r => [r[0], r[1], r[2]]));\n    assert.deepEqual(page.errors, []);",
     "    assert.deepEqual(replay.reps.map(r => [r[0], r[2], depthWord(r[3])]), home.reps.map(r => [r[0], r[1], r[2]]));\n"
     "    // AI 判斷（11/4 保養）：首頁錄的檔案，重播分析每一下最後一欄和 node 用同一套程式算的一樣\n"
     "    const parsed = parseRecording(recording);\n"
     "    const node = await analyzeRecording(parsed, parsed.meta.videoWidth, parsed.meta.videoHeight, { workout: 'squat' });\n"
     "    assert.deepEqual(replay.reps.map(r => r[r.length - 1]), node.reps.map(it => { const j = aiJudge('squat', it); return judgeText(j.label) + '（' + Math.round(j.confidence * 100) + '%）'; }));\n"
     "    assert.deepEqual(page.errors, []);")
print('ok')
# 4. 文件：架構（測試的表）、路線圖第 61 項
a = W + '/docs/architecture.md'
sub1(a, '| `tests/browser/harness.mjs` | 共用工具：在本機開網站；', '| `tests/browser/harness.mjs` | 共用工具：在本機開網站（也可以開別的資料夾，例如發布時加了版本號的複本）；')
sub1(a, '重播分析讀同一個錄製檔，數字都一樣；棒式撐到一半才錄、還在撐就停止錄製的檔案，重播都寫出來 |',
     '重播分析讀同一個錄製檔，數字都一樣；棒式撐到一半才錄、還在撐就停止錄製的檔案，重播都寫出來；重播分析每一下的 AI 判斷和 node 算的一樣（11/4） |')
s = open(a, encoding='utf-8').read()
i = s.index('| `tests/browser/ai.test.mjs` |')
j = s.index('\n', i) + 1
s = s[:j] + '| `tests/browser/ai-site.test.mjs` | AI 判斷放進網站之後（11/4 保養）：背景執行緒開不起來（改在主畫面算）時重播分析、實測報表的 AI 判斷都一樣；斷網（有網路時打開過重播分析）後重新整理、讀檔，AI 判斷照常，模型檔存在手機裡；照 `.github/workflows/deploy.yml` 加版本號的發布版，模型檔的 import 也加到、網頁和背景執行緒要的程式都帶版本號、AI 判斷照常；320 寬、axe-core |\n' + s[j:]
open(a, 'w', encoding='utf-8').write(s)
r = W + '/docs/roadmap.md'
sub1(r, '要真人的實測檔才算得出能報告的準確率：檔案來了用同一個指令重新訓練 |',
     '要真人的實測檔才算得出能報告的準確率：檔案來了用同一個指令重新訓練。整合測試（11/4 保養，11/3 提前做，`tests/browser/ai-site.test.mjs`）：背景執行緒開不起來、斷網、發布時加版本號、首頁錄的檔案、320 寬，AI 判斷都照常、和 node 算的一樣 |')
print('docs ok')
