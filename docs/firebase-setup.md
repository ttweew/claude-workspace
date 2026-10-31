# 雲端同步（Firebase）

10/18 決定後端先用 Firebase 當基礎（之後要不要改成自己的伺服器再討論）。這份文件說明雲端同步做了什麼、Firebase 專案怎麼設定、怎麼測試，以及之後怎麼換成自己的伺服器。

**目前的專案**：`ai-sport-analysis-bf82e`（10/18 建立：匿名登入、Cloud Firestore `asia-east1`、安全規則都設定好了，`npm run test:live` 檢查通過）。

## 一、做了什麼

- 首頁動作按鈕下面的「雲端同步運動紀錄」開關：**預設關閉**，使用者打開才會用到雲端；第一次運動完會在總結下面問一次要不要打開（選過就不再問）。
- 打開後，每次運動的總結存一份到雲端；這台裝置上原本的紀錄也會補傳上去。
- 上傳的只有運動總結的數字：動作、次數、到位／再低一點／太淺、最低和平均角度、每下幾秒、相似度、各種錯誤幾下、棒式每次撐幾秒。**沒有影像、沒有關鍵點座標**（白名單在 `js/cloud/sync.js`）。
- 每台裝置一個匿名帳號（不用註冊、不用輸入任何資料）；安全規則讓每個人只讀寫得到自己的紀錄。
- 沒有網路、Firebase 連不上：紀錄照樣存在這台裝置，之後自動補傳；每一筆有固定的代號（動作＋開始時間），重傳不會變成兩筆。
- 「刪除雲端的紀錄」：刪掉雲端上這台裝置的全部紀錄，並關閉同步（這台裝置上的紀錄不動）。
- `js/cloud/config.js` 還沒貼 Firebase 的設定時，雲端同步整段不會出現，網站和沒有雲端時完全一樣。

用到 Firebase 的兩個服務：**Authentication**（匿名登入）和 **Cloud Firestore**（資料庫）。免費方案（Spark）就夠用：每天 5 萬次讀、2 萬次寫，1 GB 儲存。
**Cloud Storage（存檔案）現在要付費方案才能用，所以不用**；錄影檔另外用 Google Drive。

## 二、建立 Firebase 專案（約 10 分鐘）

10/18 已經照這些步驟建好；換專案或重建時照做。

1. 用 Google 帳號登入 <https://console.firebase.google.com> →「建立專案」，名稱例如 `ai-sport-analysis`；Google Analytics 可以關掉。
2. 專案首頁 →「新增應用程式」→「網頁（`</>`）」→ 暱稱隨便取（例如 `web`），不用勾 Firebase Hosting → 註冊。
   畫面上會出現一段 `const firebaseConfig = { apiKey: …, authDomain: …, projectId: …, … }`，整段複製下來。
3. 左邊「Authentication」→「開始使用」→「登入方式」→「匿名」→ 啟用。
   匿名登入不用設定授權網域；之後加 Google 登入時，再到同一頁的「設定」→「授權網域」新增 `ttweew.github.io`。
4. 左邊「Firestore Database」→「建立資料庫」→ 位置選 **`asia-east1`（台灣）**（建立後不能改）→「正式版模式」。
   問版本選 Standard；資料庫 ID 保持 `(default)`。
5. 「Firestore Database」→「規則」分頁 → 把專案裡的 `firestore.rules` 整段貼上 →「發布」。
   之後 `firestore.rules` 有改，要再貼一次（或用指令 `npx firebase-tools deploy --only firestore:rules`）。
   發布之後跑 `npm run test:live` 確認（見「四、怎麼測試」）。
6. 把第 2 步的 `firebaseConfig` 貼到 `js/cloud/config.js` 的 `FIREBASE_CONFIG`（也可以交給 Claude 做成 PR）。

`firebaseConfig` 不是密碼：打開網站的人都看得到，Firebase 本來就是這樣設計的。資料靠第 5 步的安全規則保護。

**建議再做**：Google Cloud 主控台 →「API 和服務」→「憑證」→ 那把「Browser key」→「應用程式限制」選「網站」，加上 `https://ttweew.github.io/*` 和 `http://localhost:*`（自己電腦測試用）。別的網站就不能拿這把金鑰用我們的免費額度。

## 三、資料放在哪裡

```
users/{這台裝置的匿名帳號}/sessions/{動作-開始時間}
例：users/Xa81…/sessions/squat-1792300000000
```

每一筆的欄位見 [data-format.md](data-format.md) 的「雲端（Firestore）的資料格式」。

安全規則（`firestore.rules`）：
- 每個人只能讀、寫、刪自己的紀錄；沒登入的、別人的都不行；其他路徑一律不能讀寫。
- 每一筆的欄位、型別、範圍都要對（和 `js/cloud/sync.js` 同一套條件）：多出來的欄位、負的次數、不認得的動作或錯誤代號都進不來；儲存時間一定要用伺服器的時間。

## 四、怎麼測試

### 本機模擬器（不用真的專案）

Firebase 的本機模擬器（要 Java 11 以上；`firebase-tools` 用 `npx` 臨時下載，專案本身不用安裝套件）：

```
# 1. 安全規則：GitHub 上每次推送也會自動跑（.github/workflows/test.yml）
npx firebase-tools emulators:exec --only firestore --project demo-sport "npm run test:rules"

# 2. 開著模擬器用網站
npx firebase-tools emulators:start --only auth,firestore --project demo-sport
python3 -m http.server 8000          # 另開一個視窗
# 瀏覽器打開 http://localhost:8000/?cloud=emulator
```

- `?cloud=emulator` 只在自己的電腦（localhost）有效，不會碰到真的資料。
- `demo-sport` 是模擬器專用的專案代號（`demo-` 開頭），不用登入 Google 帳號。
- `npm test` 也測了雲端這一層（`tests/cloud.test.mjs`：上傳的欄位、補傳、被拒絕、逾時、關閉、刪除，還有 `js/cloud/config.js` 貼的設定格式），不需要模擬器。

### 真的專案

主控台改了設定、或 `firestore.rules` 重新發布之後跑一次（要有網路）：

```
npm run test:live
```

- 用和網站一樣的方式：匿名登入、存兩筆運動總結、讀回來比對；確認別人的讀不到也寫不進、被改過的資料進不來（抽幾種，每一種都擋的完整測試用模擬器）。
- 會建立兩個測試用的匿名帳號，測完連同測試紀錄一起刪掉，不會碰到別人的資料。
- 哪一步沒設定好，會直接說是哪一步（例如「匿名登入還沒啟用」「安全規則擋下來」）。

## 五、AI 教練（10/31）：Gemini 寫建議

- 首頁「AI 教練（Gemini）」開關：**預設關閉**。打開後，每組做完把這組的數字給 Google 的 Gemini，寫兩三句建議，顯示在總結最上面的「教練建議」，完整語音時唸出來。關閉、連不上時用網站內建的固定句子（`js/analysis/coach.js`），這一段一定有。
- 經過 **Firebase AI Logic** 的 **Gemini Developer API**（免費方案 Spark 就能用，不用綁信用卡）：用和雲端同步同一個 Firebase 專案，網頁裡不用放 Gemini 自己的金鑰。程式在 `js/cloud/ai-coach.js`，模型名稱在 `js/cloud/config.js` 的 `AI_MODEL`（目前 `gemini-3.5-flash-lite`）。
- **送出去的只有數字**：動作名稱、次數、到位／再低一點／太淺、最低和平均角度、每下幾秒、相似度、各種錯誤幾下、疲勞的跡象、節奏、中途卡住的是第幾下、穩定度（棒式：最久、總共幾秒）。沒有影像、骨架座標、日期、帳號。Google 的免費方案可能會用送過去的內容改進服務，所以只送這些數字。
- 不需要登入、不需要雲端同步打開；兩個開關分開。

**在 Firebase 主控台開 AI Logic（使用者做，約 3 分鐘）**：

1. 打開 [Firebase 主控台](https://console.firebase.google.com/)，選專案 `ai-sport-analysis-bf82e`。
2. 左邊選單找「AI Logic」（在「AI」或「建構」底下），按「開始使用」。
3. 選「Gemini Developer API」（不要選需要付費方案的另一個），按「啟用 API」，等它跑完，再按「繼續」。
4. 不用下載檔案、不用改程式（網站已經接好）。做完之後幾分鐘才會生效；用網站做一組、看總結的「教練建議」後面寫不寫「AI 教練，Gemini」。

還沒開的時候，Google 回的是「Firebase AI Logic API has not been used in project … or it is disabled」（10/31 實際打過一次確認），網站寫「AI 教練還沒開通（Firebase 主控台要先開 AI Logic），先用固定的建議」。

**用不到 AI 的時候（10/31 保養）**：都改用固定句子，總結寫出原因（`js/cloud/ai-coach.js` 的 `FAILURE_TEXT`、`failureOf`）：

| 情況 | 怎麼認出來 | 網站寫 |
|---|---|---|
| 沒有網路 | 瀏覽器說離線（`navigator.onLine`）：不送、不等 | 沒有網路 |
| 超過 10 秒沒回答 | 計時；載入 Firebase 的程式卡住時，下次重新載入 | 超過 10 秒沒回答 |
| AI Logic 還沒開 | Google 回 403、SDK 的錯誤代號 `api-not-enabled` | 還沒開通 |
| 免費的用量用完了 | Google 回 429（`RESOURCE_EXHAUSTED`）；Gemini Developer API 免費方案有每分鐘、每天的上限 | 太忙 |
| 模型停用、改名 | Google 回 404：改 `js/cloud/config.js` 的 `AI_MODEL` | 模型要更新 |
| 回答被 Google 擋下（安全規則）| SDK 的錯誤代號 `response-error` | 回答怪怪的 |
| 回答不能用 | 英文太多、簡體字、網址、太短（不到 6 個中文字）、太長（超過 160 字）、說了給它的話裡沒有的數字（四捨五入到整數、5 以下的小數字、不超過次數的「第幾下」可以；到位的門檻 90° 沒給它，說了也不行） | 回答怪怪的 |
| 其他（連不上、伺服器錯誤）| | 暫時連不上 |

回答能用時，列點的符號、粗體、標題、表情符號拿掉，沒有句號的補上，重複的句子只留一句，最多 3 句。這些情況用真的 Firebase AI 程式（npm 的 firebase 12.19.0，和 gstatic 上的同一份）、假的 Google 伺服器測過（測試工具 `maint31/real_sdk.py`）。

**之後可以加的**：App Check（確認是從我們的網站送的，別人拿不到這個專案的 Gemini 免費額度；要用 reCAPTCHA，使用者要在主控台多設定一次）。

## 六、之後換成自己的伺服器

- 網站只透過 `js/cloud/cloud.js` 用雲端：換成 FastAPI＋MongoDB 時，改寫這個檔案的連線、上傳、刪除；上傳的內容（`js/cloud/sync.js` 的 `cloudSession`）不用改。
- 資料搬家：把 Firestore 的資料讀出來、寫進 MongoDB；每一筆的代號、欄位都一樣。
- 帳號：匿名帳號要換成伺服器的帳號系統（建議先加 Google 登入）。

## 七、目前的限制

- 匿名帳號跟著瀏覽器：清掉瀏覽器資料、換手機，就是新的帳號，之前雲端的紀錄讀不到。之後加 Google 登入就能跨裝置。
- 雲端目前只有「存」：網站上看到的運動紀錄還是這台裝置的；成長曲線、老師看全班的資料是下一步。
- Firebase 的程式從官方網址（gstatic.com）載入，版本固定在 `js/cloud/config.js`；只有打開雲端同步才會下載（壓縮後約 250 KB），沒有網路時雲端同步暫停，其他功能照常。
