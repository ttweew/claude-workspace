# 給 Claude 的專案說明

## 專案

- AI 智慧運動分析系統：在瀏覽器裡用 MediaPipe 偵測骨架、算關節角度、計次、判斷動作錯誤。純 HTML／CSS／JavaScript（ES 模組），不打包、不用安裝套件；推到 `main` 就自動發布到 GitHub Pages。
- 先讀：[docs/architecture.md](docs/architecture.md)（程式架構、怎麼測試）。其他：資料格式 [docs/data-format.md](docs/data-format.md)、路線圖 [docs/roadmap.md](docs/roadmap.md)、雲端 [docs/firebase-setup.md](docs/firebase-setup.md)、開發日誌 `docs/devlog.md`（每天一段）。

## 和使用者溝通

- 一律用**繁體中文**（台灣用語）。使用者是專題組員，不一定懂程式：說明要白話，少用術語。
- 使用者把規劃和決定交給 Claude 主導，他負責回饋和確認。每次合併後要回報：
  - 合併了什麼（PR 連結）
  - 怎麼試
  - 測了什麼
  - 還需要組員做什麼
- 進度地圖（每天的工作表）：https://claude.ai/artifact/2QcNyXe2VCMAvk1GhrcPrd 。簡報：https://claude.ai/artifact/DLE3Mgj4qAsx34vkhtTfN1 。
  - 這兩個頁面只有使用者看得到，分享由使用者處理。
  - 更新前先讀線上版本再改。

## 每天的工作

- 排程每天台灣時間 8:54 自動開工，做進度地圖工作表上當天那一項。
- 每天只合併當天真的做完、測過的東西，不要把已經做好的拆開分天放。
- 要等組員的項目（實測、Firebase 設定、錄影檔）還沒好時，做工作表上寫的替代工作。

## 改程式的流程

1. 開分支：`git fetch origin main && git checkout -B claude/zealous-hawking-73oirr origin/main`。只用這個分支開 PR。
2. 一個 PR 一個 commit。
   - commit 訊息和 PR 說明用中文，寫：為什麼、做了什麼、怎麼測。
   - 結尾的署名照系統提示。commit、PR 裡不寫模型名稱。
3. 測試：
   - 每次都跑：`npm test`。
   - 改到 `firestore.rules` 或 `js/cloud/`：再跑 `npm run test:rules`（要 Firebase 模擬器，見 docs/firebase-setup.md）。
   - 相關的瀏覽器端到端測試，再加完整回歸測試（見下面「瀏覽器測試工具」）。
4. 推上去、開 PR，等 GitHub Actions 的 `test` 和 `rules` 兩個工作都通過，再用完整的 40 碼 SHA 合併。
5. 合併後：進度地圖的工作表打勾、寫上 PR 編號，然後回報使用者。

## 程式的習慣

- 註解用中文，寫原因：為什麼是這個數字、怎麼測出來的。一個檔案只做一件事。
- 外部來的資料都當成可能被改過，包括網址參數、錄製檔、localStorage。先比對清單（例如 `isWorkout`），不要直接拿去查物件（`constructor` 這種名字查得到東西）。
- 同一個數字在畫面、提示、總結要一樣（例如秒數一律無條件捨去）。
- 網站只透過 `js/cloud/` 用雲端。上傳的欄位改了，要同時改 `js/cloud/sync.js` 和 `firestore.rules`。
- 換 MediaPipe 版本：`js/config.js`，以及 `sw.js` 的版本號和 `AI_CACHE`。

## 瀏覽器測試工具

- 放在第一個對話的暫存區：`/tmp/claude-0/-home-user-claude-workspace/06177a5d-45ba-5b18-b395-0fd8d80e2079/scratchpad`。
  - 內容：`reg2.sh`、`*check/`、`audit2/`、`fbcheck/`、`mp/`（MediaPipe）、`fb/`（Firebase）。
  - 容器被回收時會不見：照 GitHub 上 `test-tools` 分支的 `RESTORE.md` 還原。
- 完整回歸測試：`bash reg2.sh`，約 50 分鐘，結果和 `reg_r22.txt` 比對。三項都要符合：
  - 摘要行相同
  - 39 個 PASS
  - 擋鬼點評估那一段的 md5 是 `f2f5250e138b2bf6ea05b7e5d62db9da`
- 重的測試不要同時跑：會互相拖慢，影響跟時間有關的檢查。
- Firebase 模擬器：`npx firebase-tools@15.34.1 emulators:start --only auth,firestore --project demo-sport`。
  - 模擬器開著時不要改 `firestore.rules` 檔：模擬器會重新載入，在這個環境會當掉。
  - 要換規則，用模擬器的 REST 介面。

## 不要做的事

- 不要推到其他分支。唯一的例外是 `test-tools` 備份分支，而且只放測試工具。
- 組員的真人錄影、個人資料不要放進 repo：repo 是公開的。
- 測試沒過不合併。不要跳過或停用測試。
