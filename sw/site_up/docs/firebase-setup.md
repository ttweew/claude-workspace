# 雲端同步（Firebase）

10/18 決定後端先用 Firebase 當基礎（之後要不要改成自己的伺服器再討論）。這份文件說明雲端同步做了什麼、Firebase 專案怎麼設定、怎麼測試，以及之後怎麼換成自己的伺服器。

## 一、做了什麼

- 首頁「進階設定」的「雲端同步運動紀錄」：**預設關閉**，使用者打開才會用到雲端。
- 打開後，每次運動的總結存一份到雲端；這台裝置上原本的紀錄也會補傳上去。
- 上傳的只有運動總結的數字：動作、次數、到位／再低一點／太淺、最低和平均角度、每下幾秒、相似度、各種錯誤幾下、棒式每次撐幾秒。**沒有影像、沒有關鍵點座標**（白名單在 `js/cloud/sync.js`）。
- 每台裝置一個匿名帳號（不用註冊、不用輸入任何資料）；安全規則讓每個人只讀寫得到自己的紀錄。
- 沒有網路、Firebase 連不上：紀錄照樣存在這台裝置，之後自動補傳；每一筆有固定的代號（動作＋開始時間），重傳不會變成兩筆。
- 「刪除雲端的紀錄」：刪掉雲端上這台裝置的全部紀錄，並關閉同步（這台裝置上的紀錄不動）。
- `js/cloud/config.js` 還沒貼 Firebase 的設定時，雲端同步整段不會出現，網站和沒有雲端時完全一樣。

用到 Firebase 的兩個服務：**Authentication**（匿名登入）和 **Cloud Firestore**（資料庫）。免費方案（Spark）就夠用：每天 5 萬次讀、2 萬次寫，1 GB 儲存。
**Cloud Storage（存檔案）現在要付費方案才能用，所以不用**；錄影檔另外用 Google Drive。

## 二、建立 Firebase 專案（約 10 分鐘）

1. 用 Google 帳號登入 <https://console.firebase.google.com> →「建立專案」，名稱例如 `ai-sport-analysis`；Google Analytics 可以關掉。
2. 專案首頁 →「新增應用程式」→「網頁（`</>`）」→ 暱稱隨便取（例如 `web`），不用勾 Firebase Hosting → 註冊。
   畫面上會出現一段 `const firebaseConfig = { apiKey: …, authDomain: …, projectId: …, … }`，整段複製下來。
3. 左邊「Authentication」→「開始使用」→「登入方式」→「匿名」→ 啟用。
   同一頁的「設定」→「授權網域」→ 新增 `ttweew.github.io`（之後加 Google 登入也需要）。
4. 左邊「Firestore Database」→「建立資料庫」→ 位置選 **`asia-east1`（台灣）**（建立後不能改）→「正式版模式」。
5. 「Firestore Database」→「規則」分頁 → 把專案裡的 `firestore.rules` 整段貼上 →「發布」。
   之後 `firestore.rules` 有改，要再貼一次（或用指令 `npx firebase-tools deploy --only firestore:rules`）。
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

## 四、怎麼測試（不用真的專案）

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
- `npm test` 也測了雲端這一層（`tests/cloud.test.mjs`：上傳的欄位、補傳、被拒絕、逾時、關閉、刪除），不需要模擬器。

## 五、之後換成自己的伺服器

- 網站只透過 `js/cloud/cloud.js` 用雲端：換成 FastAPI＋MongoDB 時，改寫這個檔案的連線、上傳、刪除；上傳的內容（`js/cloud/sync.js` 的 `cloudSession`）不用改。
- 資料搬家：把 Firestore 的資料讀出來、寫進 MongoDB；每一筆的代號、欄位都一樣。
- 帳號：匿名帳號要換成伺服器的帳號系統（建議先加 Google 登入）。

## 六、目前的限制

- 匿名帳號跟著瀏覽器：清掉瀏覽器資料、換手機，就是新的帳號，之前雲端的紀錄讀不到。之後加 Google 登入就能跨裝置。
- 雲端目前只有「存」：網站上看到的運動紀錄還是這台裝置的；成長曲線、老師看全班的資料是下一步。
- Firebase 的程式從官方網址（gstatic.com）載入，版本固定在 `js/cloud/config.js`；只有打開雲端同步才會下載（壓縮後約 250 KB），沒有網路時雲端同步暫停，其他功能照常。
