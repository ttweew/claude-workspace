// 雲端（Firebase）的設定：專案 ai-sport-analysis-bf82e（10/18 建立），主控台「專案設定 → 一般 → 你的應用程式」的 firebaseConfig
// 這段不是密碼（打開網站的人都看得到，Firebase 本來就是這樣設計的）；資料靠 firestore.rules 保護：每個人只能讀寫自己的紀錄
// 改成 null：首頁「進階設定」不會出現雲端同步，網站和沒有雲端時完全一樣（例如要暫停雲端同步）
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

// 開發、測試用的本機模擬器（firebase emulators:start）：在自己的電腦（localhost）打開網址加 ?cloud=emulator 才會用，
// 不會碰到真的資料；專案代號 demo- 開頭，模擬器不需要登入 Google 帳號
export const EMULATOR_CONFIG = { apiKey: 'demo-key', authDomain: 'demo-sport.firebaseapp.com', projectId: 'demo-sport' };
export const EMULATOR_HOSTS = { auth: 'http://127.0.0.1:9099', firestore: ['127.0.0.1', 8080] };
