// 錄製檔清單（10/20 使用者要求：像手機相簿一樣先存起來，最後再一起下載）
// 每一段停止錄製後，JSON 自動存進這台裝置的瀏覽器（IndexedDB：關掉網頁、重新整理都還在，手機空間夠就放得下）
// 兩個表：items（名字、時間、長度、大小…，列清單只讀這個）、files（錄製檔本身，下載時才讀，不會一次全部讀進記憶體）
// 存的資料可能被改過（清單是從這台裝置讀回來的）：顯示前都先整理（cleanItem），代號、動作都比對清單

import { isWorkout, WORKOUTS } from '../analysis/workouts.js';
import { testInfo } from './test-mode.js';

const DB_NAME = 'recordings';
const VERSION = 1;

let opening = null;
function openDb() {
    if (!opening) {
        opening = new Promise((resolve, reject) => {
            if (typeof indexedDB === 'undefined') throw new Error('這個瀏覽器不能存錄製檔');
            const req = indexedDB.open(DB_NAME, VERSION);
            req.onupgradeneeded = () => {
                const db = req.result;
                if (!db.objectStoreNames.contains('items')) db.createObjectStore('items', { keyPath: 'id', autoIncrement: true });
                if (!db.objectStoreNames.contains('files')) db.createObjectStore('files');
            };
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        });
        // 打不開（例如無痕模式不允許）：下次再試一次，不要一直拿同一個失敗的結果
        opening.catch(() => { opening = null; });
    }
    return opening;
}

// 一次交易做完（成功才算數，失敗整個不存）；fn(stores) 回傳的值在交易完成後 resolve
async function run(names, mode, fn) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(names, mode);
        const stores = Object.fromEntries(names.map(n => [n, tx.objectStore(n)]));
        let result;
        Promise.resolve(fn(stores)).then(r => { result = r; }, reject);
        tx.oncomplete = () => resolve(result);
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error || new Error('沒有存成功'));
    });
}
const done = req => new Promise((resolve, reject) => { req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error); });

// 這個瀏覽器能不能用錄製檔清單（打得開資料庫）
export async function libraryAvailable() {
    try {
        await openDb();
        return true;
    } catch (err) {
        return false;
    }
}

// 存一段：name（檔名，不含 .json）、meta（錄製檔的 meta）、seconds、frames、blob（JSON）；回傳編號
export async function saveRecording({ name, meta, seconds, frames, blob }) {
    return run(['items', 'files'], 'readwrite', async s => {
        const id = await done(s.items.add({
            name, savedAt: Date.now(), workout: meta && meta.workout, test: meta && meta.test,
            seconds, frames, size: blob.size, downloaded: false
        }));
        s.files.put(blob, id);
        return id;
    });
}

// 清單（新的在前面）；壞掉的項目不列出來
export async function listRecordings() {
    const raw = await run(['items'], 'readonly', s => done(s.items.getAll()));
    return raw.map(cleanItem).filter(Boolean).sort((a, b) => b.savedAt - a.savedAt || b.id - a.id);
}

export async function getRecordingFile(id) {
    const blob = await run(['files'], 'readonly', s => done(s.files.get(id)));
    if (!(blob instanceof Blob)) throw new Error('這一段的檔案不見了');
    return blob;
}

export async function markDownloaded(ids) {
    return run(['items'], 'readwrite', async s => {
        for (const id of ids) {
            const item = await done(s.items.get(id));
            if (item) s.items.put({ ...item, downloaded: true });
        }
    });
}

export async function deleteRecordings(ids) {
    return run(['items', 'files'], 'readwrite', s => {
        for (const id of ids) {
            s.items.delete(id);
            s.files.delete(id);
        }
    });
}

const NAME = /^[A-Za-z0-9_]{1,80}$/;
const num = v => typeof v === 'number' && Number.isFinite(v) && v >= 0;

// 從這台裝置讀回來的一筆：欄位不對的整理掉（名字只留英文數字底線，才能直接當檔名）；編號不對的整筆不用
export function cleanItem(raw) {
    if (!raw || typeof raw !== 'object' || !Number.isInteger(raw.id) || raw.id < 1) return null;
    const workout = isWorkout(raw.workout) ? raw.workout : 'free';
    return {
        id: raw.id,
        name: typeof raw.name === 'string' && NAME.test(raw.name) ? raw.name : 'pose_' + raw.id,
        savedAt: num(raw.savedAt) ? raw.savedAt : 0,
        workout,
        test: testInfo({ workout, test: raw.test }),
        seconds: num(raw.seconds) ? raw.seconds : 0,
        frames: Number.isInteger(raw.frames) && raw.frames >= 0 ? raw.frames : 0,
        size: num(raw.size) ? raw.size : 0,
        downloaded: raw.downloaded === true
    };
}

// 清單上的字：「深蹲 · 受測者 A · 故意上身前傾 5 下」「深蹲」「自由模式」
export function itemTitle(item) {
    const w = item.workout === 'free' ? '自由模式' : WORKOUTS[item.workout].name;
    return item.test ? w + ' · 受測者 ' + item.test.subject + ' · ' + item.test.name + ' ' + item.test.amount + ' ' + item.test.unit : w;
}

// 「10/20 21:05 · 0:42 · 3.4 MB」；長度和數據面板的「已錄 0:42」一樣四捨五入到秒
export function itemDetail(item) {
    const d = new Date(item.savedAt);
    const pad = n => String(n).padStart(2, '0');
    const s = Math.round(item.seconds);
    return (d.getMonth() + 1) + '/' + d.getDate() + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes())
        + ' · ' + Math.floor(s / 60) + ':' + pad(s % 60) + ' · ' + sizeText(item.size) + (item.downloaded ? ' · 已下載' : '');
}

export function sizeText(bytes) {
    if (bytes >= 1024 * 1024) return (bytes / 1024 / 1024).toFixed(1) + ' MB';
    return Math.max(1, Math.round(bytes / 1024)) + ' KB';
}
