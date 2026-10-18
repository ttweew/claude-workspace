// 雲端同步（js/cloud/）：上傳哪些欄位、哪幾筆還沒傳、和雲端安全規則（firestore.rules）是同一套條件
// 真的連到 Firebase 的部分在模擬器上測（tests/rules/、docs/firebase-setup.md）
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { summarize } from '../js/analysis/session.js';
import { WORKOUTS } from '../js/analysis/workouts.js';
import { FORM_RULES } from '../js/analysis/form.js';
import { sessionId, cloudSession, pendingSessions, loadSynced, saveSynced, hasSynced, forgetSynced,
         CLOUD_WORKOUTS, HOLD_WORKOUTS, ERROR_IDS, SCHEMA } from '../js/cloud/sync.js';
import { cloud, Cloud } from '../js/cloud/cloud.js';
import { FIREBASE_CONFIG } from '../js/cloud/config.js';
import { random } from './helpers.mjs';

const store = new Map();
globalThis.localStorage = { getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) };

const T = 1792300000000;
const rep = (min, depth, errors = [], similarity = 90) => ({ min, depth, errors, start: 0, end: 2.4, similarity });
const squat = () => summarize('squat', [rep(85, 'good'), rep(100, 'close', ['lean']), rep(120, 'shallow', ['lean', 'heel'], null)], T, T + 120000);
const plank = () => summarize('plank', [{ seconds: 32.4, errors: ['sag'] }, { seconds: 45.6, errors: [] }], T, T + 90000);

test('每一筆的代號：動作＋開始時間（重傳蓋掉自己，不會變兩筆）', () => {
    assert.equal(sessionId(squat()), 'squat-' + T);
    assert.equal(sessionId(plank()), 'plank-' + T);
});

test('上傳的內容：只有白名單的數字欄位，計次和計時各自的欄位', () => {
    const s = cloudSession(squat());
    assert.deepEqual(Object.keys(s).sort(), ['average', 'best', 'clean', 'close', 'count', 'date', 'errors', 'good', 'minutes',
                                             'shallow', 'similarity', 'tempo', 'v', 'workout']);
    assert.equal(s.v, SCHEMA);
    assert.deepEqual([s.count, s.good, s.close, s.shallow, s.clean], [3, 1, 1, 1, 1]);
    assert.deepEqual(s.errors, { lean: 2, heel: 1 });
    assert.equal(s.similarity, 90, '有算出相似度的那幾下平均');
    const p = cloudSession(plank());
    assert.deepEqual(Object.keys(p).sort(), ['best', 'clean', 'count', 'date', 'errors', 'minutes', 'seconds', 'total', 'v', 'workout']);
    assert.deepEqual([p.best, p.total, p.seconds], [45, 77, [32, 45]]);
    // 本機紀錄裡多出來的東西（被改過、或之後版本加的欄位）不會跟著上傳
    assert.equal(cloudSession({ ...squat(), hacked: '<img src=x>', name: '王小明' }).hacked, undefined);
});

test('格式不對的不上傳（雲端的規則也會擋，留著只會一直重試）', () => {
    const bad = {
        '自由模式': { ...squat(), workout: 'free' },
        '不認得的動作': { ...squat(), workout: 'constructor' },
        '角度是 NaN': { ...squat(), best: NaN },
        '最低比平均高': { ...squat(), best: 110 },
        '角度超過 180°': { ...squat(), best: 85, average: 200 },
        '沒有錯誤的比次數多': { ...squat(), clean: 4 },
        '錯誤比次數多': { ...squat(), errors: { lean: 4 } },
        '開始時間是文字': { ...squat(), date: String(T) },
        '開始時間不合理': { ...squat(), date: 5 },
        '棒式最久比總共久': { ...plank(), best: 100 },
        '空的': null
    };
    for (const [why, s] of Object.entries(bad)) assert.equal(cloudSession(s), null, why);
});

test('可以修的就修：不認得的錯誤代號、壞掉的分鐘數、對不起來的每次秒數，拿掉那一欄，其他照樣上傳', () => {
    const s = cloudSession({ ...squat(), errors: { lean: 2, oldError: 1 }, minutes: -3 });
    assert.deepEqual(s.errors, { lean: 2 });
    assert.equal('minutes' in s, false);
    const p = cloudSession({ ...plank(), seconds: [32] });
    assert.equal('seconds' in p, false);
    assert.equal(cloudSession({ ...squat(), similarity: 150 }).similarity, null);
});

test('還沒上傳的：不在已上傳清單、格式也對的', () => {
    const a = squat(), b = { ...plank(), date: T + 5000 }, broken = { ...squat(), date: T + 9000, best: NaN };
    const synced = new Set([sessionId(a)]);
    assert.deepEqual(pendingSessions([a, b, broken], synced), [b]);
    assert.deepEqual(pendingSessions([a, b, broken], new Set()), [a, b]);
});

test('已上傳清單：跟著雲端帳號；換帳號、壞掉時當作還沒傳；最多記 500 筆', () => {
    store.clear();
    assert.equal(hasSynced(), false);
    saveSynced('u1', new Set(['squat-1', 'plank-2']));
    assert.deepEqual([...loadSynced('u1')], ['squat-1', 'plank-2']);
    assert.equal(hasSynced(), true);
    assert.equal(loadSynced('u2').size, 0, '換了帳號（例如清掉瀏覽器資料）：全部重傳');
    store.set('cloudSynced', '{壞掉');
    assert.equal(loadSynced('u1').size, 0);
    assert.equal(hasSynced(), false);
    saveSynced('u1', new Set(Array.from({ length: 600 }, (_, i) => 'squat-' + i)));
    assert.equal(loadSynced('u1').size, 500);
    assert.ok(loadSynced('u1').has('squat-599'), '留下最新的');
    forgetSynced();
    assert.equal(hasSynced(), false);
});

test('和雲端安全規則（firestore.rules）、網站的動作和錯誤代號是同一套', () => {
    assert.deepEqual([...ERROR_IDS].sort(), [...new Set(Object.values(FORM_RULES).flat().map(r => r.id))].sort());
    assert.deepEqual([...CLOUD_WORKOUTS].sort(), Object.keys(WORKOUTS).filter(id => WORKOUTS[id].kind).sort());
    assert.deepEqual(HOLD_WORKOUTS, ['plank']);
    const rules = readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8');
    const quoted = s => [...s.matchAll(/'([a-z]+)'/g)].map(m => m[1]).sort();
    assert.deepEqual(quoted(rules.match(/e\.keys\(\)\.hasOnly\(\[([^\]]+)\]\)/)[1]), [...ERROR_IDS].sort(), '規則認得的錯誤代號');
    assert.deepEqual(quoted(rules.match(/d\.workout in \[([^\]]+)\]/)[1]), [...CLOUD_WORKOUTS].sort(), '規則認得的動作');
    assert.match(rules, new RegExp(`d\\.workout == '${HOLD_WORKOUTS[0]}' \\? validHold`), '計時的動作');
    assert.match(rules, new RegExp(`d\\.v == ${SCHEMA}\\b`), '格式版本');
});

test('網站自己算出來的總結，一定可以上傳（四個動作各 200 筆隨機的）', () => {
    const rnd = random(1018);
    for (const workout of CLOUD_WORKOUTS) {
        const ids = FORM_RULES[workout].map(r => r.id);
        for (let k = 0; k < 200; k++) {
            const n = 1 + Math.floor(rnd() * 60);
            const errs = () => ids.filter(() => rnd() < 0.3);
            const items = HOLD_WORKOUTS.includes(workout)
                ? Array.from({ length: n }, () => ({ seconds: rnd() * 300, errors: errs() }))
                : Array.from({ length: n }, () => {
                    const start = rnd() * 900;
                    return { min: 30 + rnd() * 150, depth: ['good', 'close', 'shallow'][Math.floor(rnd() * 3)], errors: errs(), start,
                             end: start + 0.3 + rnd() * 8, similarity: rnd() < 0.2 ? null : Math.round(rnd() * 100) };
                });
            const start = T + Math.floor(rnd() * 1e10);
            const s = summarize(workout, items, start, start + rnd() * 7200000);
            assert.ok(cloudSession(s), `${workout} 第 ${k} 筆：${JSON.stringify(s).slice(0, 120)}`);
        }
    }
});

test('網站還沒接上 Firebase（沒有設定）：雲端完全不動作', async () => {
    store.set('cloudSync', '1');   // 就算之前打開過
    const c = new Cloud(null);
    assert.equal(c.available, false);
    assert.equal(c.enabled, false);
    const status = await c.sync([squat()]);
    assert.equal(status.state, 'off');
    assert.equal(c.hasData, false);
    store.delete('cloudSync');
});

// 主控台複製設定時少了字、貼錯專案：網站一打開雲端同步就會失敗，在這裡先抓出來
test('js/cloud/config.js 貼的 Firebase 設定格式對', { skip: !FIREBASE_CONFIG && '還沒貼設定' }, () => {
    const c = FIREBASE_CONFIG;
    assert.match(c.apiKey, /^AIza[\w-]{35}$/, 'apiKey：AIza 開頭、共 39 個字');
    assert.match(c.projectId, /^[a-z][a-z0-9-]{4,28}[a-z0-9]$/, 'projectId：小寫英文、數字、減號，6～30 個字');
    assert.equal(c.authDomain, c.projectId + '.firebaseapp.com');
    assert.match(c.appId, /^1:\d+:web:[0-9a-f]+$/, 'appId：網頁應用程式的代號');
    assert.equal(cloud.available, true, '有設定：首頁「進階設定」會出現雲端同步');
});

// ---------- 雲端這一層的流程（js/cloud/cloud.js）：把 Firebase 換成假的，測排隊、補傳、被拒絕、逾時、關閉、刪除 ----------
// 假的 Firebase：記下存了什麼；可以指定哪幾筆被拒絕（規則還沒發布）、上傳先卡住（網路慢）
function fakeFirebase({ deny = () => false, gate = null } = {}) {
    const docs = new Map();
    let writes = 0;
    const fs = {
        doc: (db, ...path) => path.join('/'),
        serverTimestamp: () => 'SERVER_TIME',
        setDoc: (path, data) => {
            writes++;
            const save = () => {
                if (deny(path)) throw Object.assign(new Error('Missing or insufficient permissions.'), { code: 'permission-denied' });
                docs.set(path, data);
            };
            return (gate ? gate.promise : Promise.resolve()).then(save);
        },
        collection: (db, ...path) => path.join('/'),
        limit: n => n,
        query: (col, n) => ({ col, n }),
        getDocs: async q => {
            const refs = [...docs.keys()].filter(k => k.startsWith(q.col + '/')).slice(0, q.n);
            return { empty: !refs.length, size: refs.length, docs: refs.map(ref => ({ ref })) };
        },
        writeBatch: () => {
            const gone = [];
            return { delete: ref => gone.push(ref), commit: async () => gone.forEach(ref => docs.delete(ref)) };
        }
    };
    return { conn: { fs, db: {}, uid: 'u1' }, docs, writes: () => writes };
}
function gate() {
    let open;
    const promise = new Promise(resolve => { open = resolve; });
    return { promise, open };
}
function cloudWith(fb, { connect } = {}) {
    store.delete('cloudSynced');
    store.delete('cloudSync');   // 每個測試都從「關閉」開始，和 js/cloud/config.js 有沒有貼設定無關
    const c = new Cloud({ projectId: 'demo-test' });   // 有設定；連線換成假的，不會真的連到 Firebase
    c.timeoutMs = 50;
    c.connect = connect || (async () => fb.conn);
    return c;
}
const day = k => ({ ...squat(), date: T + k * 86400000 });

test('打開：這台裝置的紀錄全部傳上去；重傳不會變兩筆，之後只傳新的', async () => {
    const fb = fakeFirebase();
    const c = cloudWith(fb);
    const history = [day(0), day(1)];
    let s = await c.setEnabled(true, history);
    assert.equal(s.state, 'ok');
    assert.equal(s.text, '已同步：這台裝置的 2 筆紀錄都在雲端');
    assert.deepEqual([...fb.docs.keys()], ['users/u1/sessions/squat-' + day(0).date, 'users/u1/sessions/squat-' + day(1).date]);
    assert.equal(fb.docs.get('users/u1/sessions/squat-' + T).savedAt, 'SERVER_TIME', '時間用伺服器的');
    s = await c.sync(history);
    assert.equal(fb.writes(), 2, '已經傳過的不再傳');
    s = await c.sync([...history, day(2)]);
    assert.equal(fb.writes(), 3);
    assert.equal(s.text, '已同步：這台裝置的 3 筆紀錄都在雲端');
    assert.equal(c.hasData, true);
});

test('雲端拒絕（例如安全規則還沒發布）：說明原因，不當成傳過，規則好了下次照樣補傳', async () => {
    let denying = true;
    const fb = fakeFirebase({ deny: () => denying });
    const c = cloudWith(fb);
    const s = await c.setEnabled(true, [day(0)]);
    assert.equal(s.state, 'error');
    assert.match(s.text, /安全規則還沒發布.*1 筆還沒上傳/);
    denying = false;
    assert.equal((await c.sync([day(0)])).state, 'ok');
    assert.equal(fb.docs.size, 1);
});

test('網路太慢（逾時）：先說明，之後再試；不會卡住', async () => {
    const g = gate();
    const fb = fakeFirebase({ gate: g });
    const c = cloudWith(fb);
    const s = await c.setEnabled(true, [day(0)]);
    assert.equal(s.state, 'waiting');
    assert.match(s.text, /網路不穩：1 筆還沒上傳/);
    g.open();
    assert.equal((await c.sync([day(0)])).state, 'ok');
});

test('上傳到一半關掉：顯示「已關閉」，不會被上傳完成的結果蓋掉', async () => {
    const g = gate();
    const fb = fakeFirebase({ gate: g });
    const c = cloudWith(fb);
    c.timeoutMs = 2000;
    const running = c.setEnabled(true, [day(0)]);
    await new Promise(resolve => setTimeout(resolve, 10));
    await c.setEnabled(false, [day(0)]);
    g.open();
    await running;
    assert.equal(c.status.state, 'off');
    assert.equal(c.status.text, '已關閉：之後的運動紀錄只存在這台裝置');
});

test('上傳的時候又做完一次運動：同時只跑一個，做完再傳新的那筆', async () => {
    const g = gate();
    const fb = fakeFirebase({ gate: g });
    const c = cloudWith(fb);
    c.timeoutMs = 2000;
    const first = c.setEnabled(true, [day(0)]);
    await new Promise(resolve => setTimeout(resolve, 10));
    const second = c.sync([day(0), day(1)]);
    assert.equal(first, second, '同一個同步');
    g.open();
    const s = await second;
    assert.equal(s.text, '已同步：這台裝置的 2 筆紀錄都在雲端');
    assert.equal(fb.writes(), 2);
});

test('連不上、Firebase 還沒設定好：說明原因，紀錄先存在這台裝置', async () => {
    const cases = [
        [{ code: 'auth/admin-restricted-operation' }, /沒有開啟匿名登入/],
        [{ code: 'not-found' }, /Firestore 資料庫還沒建立/],
        [{ code: 'timeout' }, /雲端暫時連不上/],
        [new TypeError('Failed to fetch dynamically imported module'), /雲端暫時連不上/]
    ];
    for (const [err, text] of cases) {
        const c = cloudWith(null, { connect: async () => { throw err; } });
        const s = await c.setEnabled(true, [day(0)]);
        assert.equal(s.state, 'error');
        assert.match(s.text, text);
        assert.match(s.text, /紀錄先存在這台裝置/);
    }
});

test('沒有網路：不用等逾時，直接說明', async () => {
    const saved = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
    Object.defineProperty(globalThis, 'navigator', { value: { onLine: false }, configurable: true });
    try {
        let connected = false;
        const c = cloudWith(null, { connect: async () => { connected = true; } });
        const s = await c.setEnabled(true, [day(0)]);
        assert.equal(s.state, 'waiting');
        assert.equal(connected, false);
    } finally {
        if (saved) Object.defineProperty(globalThis, 'navigator', saved);
        else delete globalThis.navigator;
    }
});

test('刪除雲端的紀錄：全部刪掉、同步關閉、已上傳清單清掉；連不上時說明、雲端的還在', async () => {
    const fb = fakeFirebase();
    const c = cloudWith(fb);
    await c.setEnabled(true, Array.from({ length: 5 }, (_, k) => day(k)));
    assert.equal(fb.docs.size, 5);
    const n = await c.deleteAll();
    assert.equal(n, 5);
    assert.equal(fb.docs.size, 0);
    assert.equal(c.enabled, false);
    assert.equal(store.get('cloudSync'), '0');
    assert.equal(c.hasData, false);
    assert.equal(c.status.text, '已刪除雲端的 5 筆紀錄，雲端同步已關閉（這台裝置上的紀錄還在）');
    // 連不上
    const fb2 = fakeFirebase();
    const c2 = cloudWith(fb2);
    await c2.setEnabled(true, [day(0)]);
    c2.connect = async () => { throw Object.assign(new Error('offline'), { code: 'unavailable' }); };
    assert.equal(await c2.deleteAll(), null);
    assert.match(c2.status.text, /雲端的紀錄還沒刪掉，請連上網路再按一次/);
    assert.equal(fb2.docs.size, 1);
});
