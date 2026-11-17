// 雲端（Firebase）的設定：專案 ai-sport-analysis-bf82e（10/18 建立），主控台「專案設定 → 一般 → 你的應用程式」的 firebaseConfig
// 這段不是密碼（打開網站的人都看得到，Firebase 本來就是這樣設計的）；資料靠 firestore.rules 保護：每個人只能讀寫自己的紀錄
// 改成 null：首頁不會出現雲端同步的開關，網站和沒有雲端時完全一樣（例如要暫停雲端同步）
// 步驟見 docs/firebase-setup.md
export const FIREBASE_CONFIG = {
    apiKey: 'AIzaSyDjXfPUrqMDoPlBjQIVPb01GypnbTHqzQI',
    authDomain: 'ai-sport-analysis-bf82e.firebaseapp.com',
    projectId: 'ai-sport-analysis-bf82e',
    storageBucket: 'ai-sport-analysis-bf82e.firebasestorage.app',
    messagingSenderId: '1088894498047',
    appId: '1:1088894498047:web:530f261ac8a2c4022f08ca'
};

// Firebase 的程式從官方網址載入（和 MediaPipe 一樣，不用安裝、不用打包）；版本固定，換版本時重跑 docs/firebase-setup.md 的測試
export const FIREBASE_VERSION = '12.19.0';
export const FIREBASE_SDK = 'https://www.gstatic.com/firebasejs/' + FIREBASE_VERSION;

// AI 教練（10/31，js/cloud/ai-coach.js）用的 Gemini 模型：經過 Firebase AI Logic 的 Gemini Developer API（免費方案就能用）
// gemini-3.5-flash-lite：2026 年 7 月正式推出、3.5 這一代最快最便宜的，寫兩三句建議夠用；
// 2.0 系列 2026/6/1 已停用、2.5 系列新的專案不能用。Google 換新模型、舊的停用時改這裡（停用了會改用固定句子，網站不會壞）
export const AI_MODEL = 'gemini-3.5-flash-lite';

// App Check（11/17）：Google 從 2026/11/2 起規定，用 Firebase AI Logic（AI 教練的 Gemini）一定要通過 App Check——
// 每次問 Gemini 都要附一張「是從我們的網站送的」通行證，別人拿上面那段設定自己寫程式問不了，也用不掉這個專案的免費額度
// 這是 reCAPTCHA Enterprise 的「網站金鑰」：Google Cloud 主控台「安全性 → Fraud Defense」建立，網域只有 ttweew.github.io，
// 不跳出要人點的框（只看分數）；Firebase 主控台「App Check」登記同一把。公開的，不是密碼（打開網站的人都看得到）
// 改成 null：不用 App Check（Gemini 會擋下來，AI 教練改用固定句子，網站其他功能照常）
export const APP_CHECK_SITE_KEY = '6LfdwiQuAAAAAPLBDbGRzYF60yqSJ97fzb9didsZ';

// 開發、測試用的本機模擬器（firebase emulators:start）：在自己的電腦（localhost）打開網址加 ?cloud=emulator 才會用，
// 不會碰到真的資料；專案代號 demo- 開頭，模擬器不需要登入 Google 帳號
export const EMULATOR_CONFIG = { apiKey: 'demo-key', authDomain: 'demo-sport.firebaseapp.com', projectId: 'demo-sport' };
export const EMULATOR_HOSTS = { auth: 'http://127.0.0.1:9099', firestore: ['127.0.0.1', 8080] };
