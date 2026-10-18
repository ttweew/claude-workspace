// 雲端同步（Firebase）：運動總結存一份到雲端（Cloud Firestore），之後的成長曲線、換手機、老師看全班的資料都從這裡來
// 網站其他地方只透過這個檔案用雲端：之後要換成自己的伺服器（例如 FastAPI＋MongoDB），只要改這個檔案（資料格式見 docs/data-format.md）
// 預設關閉：首頁「進階設定」打開才會載入 Firebase、建立這台裝置的匿名帳號、上傳；關閉時網站和沒有雲端時一樣
// 上傳的只有運動總結的數字（js/cloud/sync.js 的白名單），沒有影像、沒有關鍵點座標
// 沒有網路、Firebase 載不到、雲端還沒設定好：紀錄照樣存在這台裝置，之後自動再試（每一筆有固定的代號，重傳不會變兩筆）

import { FIREBASE_CONFIG, FIREBASE_SDK, EMULATOR_CONFIG, EMULATOR_HOSTS } from './config.js';
import { sessionId, cloudSession, loadSynced, saveSynced, forgetSynced, hasSynced, pendingSessions } from './sync.js';

const KEY = 'cloudSync';
const TIMEOUT_MS = 15000;   // 下載 Firebase、登入、上傳超過這麼久沒有回應：當作暫時連不上，之後再試（Firebase 自己也會在背景繼續送）

// 開發、測試用：在自己的電腦（localhost）打開網址加 ?cloud=emulator，連到 Firebase 的本機模擬器（js/cloud/config.js）
const EMULATOR = typeof location !== 'undefined' && /^(localhost|127\.0\.0\.1)$/.test(location.hostname)
    && new URLSearchParams(location.search).get('cloud') === 'emulator';
const CONFIG = EMULATOR ? EMULATOR_CONFIG : FIREBASE_CONFIG;

function withTimeout(promise, ms, what) {
    let timer;
    const late = new Promise((_, reject) => {
        timer = setTimeout(() => reject(Object.assign(new Error(what + '超過 ' + ms / 1000 + ' 秒沒有回應'), { code: 'timeout' })), ms);
    });
    return Promise.race([promise, late]).finally(() => clearTimeout(timer));
}

// Firebase 回的錯誤 → 給使用者看的說明（詳細的原因印在主控台）；前三種是 Firebase 專案還沒設定好（docs/firebase-setup.md）
function explain(err) {
    const code = (err && err.code) || '';
    if (code === 'auth/admin-restricted-operation' || code === 'auth/operation-not-allowed') return '雲端還沒設定好（Firebase 沒有開啟匿名登入）';
    if (code === 'not-found' || code === 'failed-precondition') return '雲端還沒設定好（Firestore 資料庫還沒建立）';
    if (code === 'permission-denied') return '雲端還沒設定好（安全規則還沒發布），或這筆資料格式不對';
    return '雲端暫時連不上';
}

export class Cloud {
    // config：Firebase 的設定，平常用 js/cloud/config.js 的（測試可以傳 null，當作網站還沒接上 Firebase）
    constructor(config = CONFIG) {
        this.config = config;
        this.available = !!config;   // 網站有沒有接上 Firebase（js/cloud/config.js 有沒有貼設定）
        this.enabled = false;        // 使用者有沒有打開（網站會記住）
        try { this.enabled = this.available && localStorage.getItem(KEY) === '1'; } catch (err) { /* 不能讀就當作關閉 */ }
        this.listeners = new Set();
        this.status = { state: this.enabled ? 'working' : 'off', text: '' };
        this.ready = null;      // 載入 Firebase＋登入（只做一次；失敗了下次再試）
        this.emulated = false;  // 已經連到模擬器（只能連一次）
        this.running = null;    // 正在同步
        this.again = false;     // 同步的時候又有新的紀錄：做完再做一次
        this.latest = [];
        this.timeoutMs = TIMEOUT_MS;
    }

    // 狀態改變時通知畫面：state 是 off、working、ok、waiting（等網路）、error；text 是給使用者看的一句話
    onStatus(fn) {
        this.listeners.add(fn);
        fn(this.status);
    }
    setStatus(state, text) {
        this.status = { state, text };
        this.listeners.forEach(fn => fn(this.status));
    }

    // 這台裝置有沒有上傳過（「刪除雲端的紀錄」要不要出現）
    get hasData() {
        return this.available && hasSynced();
    }

    // 載入 Firebase、用這台裝置的匿名帳號登入（第一次會建立；之後同一個瀏覽器都是同一個帳號）
    connect() {
        if (!this.ready) {
            this.ready = (async () => {
                const [appLib, authLib, fs] = await withTimeout(Promise.all([
                    import(FIREBASE_SDK + '/firebase-app.js'),
                    import(FIREBASE_SDK + '/firebase-auth.js'),
                    import(FIREBASE_SDK + '/firebase-firestore.js')
                ]), this.timeoutMs, '下載 Firebase');
                const app = appLib.getApps().length ? appLib.getApp() : appLib.initializeApp(this.config);
                const auth = authLib.getAuth(app);
                const db = fs.getFirestore(app);
                if (EMULATOR && !this.emulated) {
                    authLib.connectAuthEmulator(auth, EMULATOR_HOSTS.auth, { disableWarnings: true });
                    fs.connectFirestoreEmulator(db, ...EMULATOR_HOSTS.firestore);
                    this.emulated = true;
                }
                await withTimeout(auth.authStateReady(), this.timeoutMs, '登入');
                if (!auth.currentUser) await withTimeout(authLib.signInAnonymously(auth), this.timeoutMs, '登入');
                return { fs, db, uid: auth.currentUser.uid };
            })();
            this.ready.catch(() => { this.ready = null; });
        }
        return this.ready;
    }

    // 打開／關閉（關閉只是之後不上傳；雲端上的紀錄要按「刪除雲端的紀錄」才會刪）
    setEnabled(on, history) {
        this.enabled = on && this.available;
        try { localStorage.setItem(KEY, this.enabled ? '1' : '0'); } catch (err) { /* 存不了：這次有效，下次打開網頁要再開一次 */ }
        if (!this.enabled) {
            this.setStatus('off', '已關閉：之後的運動紀錄只存在這台裝置');
            return Promise.resolve(this.status);
        }
        return this.sync(history);
    }

    // 把還沒上傳的紀錄傳上去（history：這台裝置的運動紀錄，js/analysis/session.js 的 loadHistory）
    // 同時只跑一個；跑的時候又有新的紀錄，做完再跑一次
    sync(history) {
        if (!this.enabled) return Promise.resolve(this.status);
        this.latest = history;
        if (this.running) {
            this.again = true;
            return this.running;
        }
        this.running = (async () => {
            try {
                do {
                    this.again = false;
                    await this.syncOnce(this.latest);
                } while (this.again && this.enabled);
            } catch (err) {
                // 預期外的錯誤也不能讓同步卡住：說明一下，下次照樣再試
                console.warn('雲端同步：', err);
                this.setStatus('error', explain(err) + '：之後會自動再試');
            } finally {
                this.running = null;
            }
            return this.status;
        })();
        return this.running;
    }

    async syncOnce(history) {
        const valid = history.filter(s => cloudSession(s));
        const skipped = history.length - valid.length;
        const note = skipped ? '（' + skipped + ' 筆格式不對，不上傳）' : '';
        // 明顯沒有網路：不用等逾時，直接說明
        if (typeof navigator !== 'undefined' && navigator.onLine === false) {
            this.setStatus('waiting', '沒有網路：紀錄先存在這台裝置，連上網路後自動上傳' + note);
            return;
        }
        this.setStatus('working', '同步中…');
        let conn;
        try {
            conn = await this.connect();
        } catch (err) {
            console.warn('雲端同步：連線失敗', err);
            this.setStatus('error', explain(err) + '：紀錄先存在這台裝置，之後會自動再試' + note);
            return;
        }
        if (!this.enabled) return;
        const synced = loadSynced(conn.uid);
        const todo = pendingSessions(valid, synced);
        const { fs, db, uid } = conn;
        // 一起送出去（Firebase 會合併成一次連線），每一筆各自等結果：一筆失敗不影響其他筆
        const results = await Promise.allSettled(todo.map(s => withTimeout(
            fs.setDoc(fs.doc(db, 'users', uid, 'sessions', sessionId(s)), { ...cloudSession(s), savedAt: fs.serverTimestamp() }), this.timeoutMs, '上傳')));
        let failure = null;
        results.forEach((r, i) => {
            if (r.status === 'fulfilled') synced.add(sessionId(todo[i]));
            else failure = failure || r.reason;
        });
        saveSynced(uid, synced);
        if (!this.enabled) return;   // 上傳的時候使用者關掉了：不要把「已關閉」蓋掉
        const left = pendingSessions(valid, synced).length;
        if (!left) {
            this.setStatus('ok', (valid.length ? '已同步：這台裝置的 ' + valid.length + ' 筆紀錄都在雲端' : '已開啟：之後的運動紀錄會存一份到雲端') + note);
        } else if (failure && failure.code === 'timeout') {
            this.setStatus('waiting', '網路不穩：' + left + ' 筆還沒上傳，之後自動再試' + note);
        } else {
            console.warn('雲端同步：上傳失敗', failure);
            this.setStatus('error', explain(failure) + '：' + left + ' 筆還沒上傳，之後會自動再試' + note);
        }
    }

    // 刪除雲端上這台裝置（這個匿名帳號）的全部紀錄，並關閉同步（不然下次又會把這台裝置的紀錄傳上去）
    // 回傳刪了幾筆；失敗回傳 null（雲端的還在，請使用者再按一次）
    async deleteAll() {
        this.enabled = false;
        try { localStorage.setItem(KEY, '0'); } catch (err) { /* 存不了就算了 */ }
        if (this.running) await this.running;
        this.setStatus('working', '刪除中…');
        try {
            const { fs, db, uid } = await this.connect();
            let total = 0;
            for (;;) {
                const page = await withTimeout(fs.getDocs(fs.query(fs.collection(db, 'users', uid, 'sessions'), fs.limit(400))), this.timeoutMs, '讀取雲端的紀錄');
                if (page.empty) break;
                const batch = fs.writeBatch(db);
                page.docs.forEach(d => batch.delete(d.ref));
                await withTimeout(batch.commit(), this.timeoutMs, '刪除');
                total += page.size;
            }
            forgetSynced();
            this.setStatus('off', '已刪除雲端的 ' + total + ' 筆紀錄，雲端同步已關閉（這台裝置上的紀錄還在）');
            return total;
        } catch (err) {
            console.warn('刪除雲端的紀錄：失敗', err);
            this.setStatus('error', explain(err) + '：雲端的紀錄還沒刪掉，請連上網路再按一次');
            return null;
        }
    }
}

export const cloud = new Cloud();
