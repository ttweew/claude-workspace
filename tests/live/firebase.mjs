// 真的 Firebase 專案（js/cloud/config.js 的 FIREBASE_CONFIG）：用和網站一樣的方式確認主控台的設定都對
//   匿名登入有開、資料庫建好了、發布的安全規則和專案裡的 firestore.rules 一樣（自己的收、別人的擋、被改過的擋）
// 會建立兩個測試用的匿名帳號和幾筆測試紀錄，測完全部刪掉；不會碰到別人的資料
// 執行：npm run test:live（要有網路）。主控台改了設定、或 firestore.rules 重新發布之後跑一次
// 每一種被改過的資料都擋的完整測試在 tests/rules/（用本機模擬器），這裡只抽幾種，確認發布的是同一份規則
import { isDeepStrictEqual } from 'node:util';
import { FIREBASE_CONFIG as CFG } from '../../js/cloud/config.js';
import { cloudSession, sessionId } from '../../js/cloud/sync.js';
import { summarize } from '../../js/analysis/session.js';

if (!CFG) {
    console.log('js/cloud/config.js 還沒貼 Firebase 的設定（步驟見 docs/firebase-setup.md）');
    process.exit(1);
}
const ROOT = `projects/${CFG.projectId}/databases/(default)/documents`;
const API = 'https://firestore.googleapis.com/v1/';
const FS = API + ROOT;
const AUTH = 'https://identitytoolkit.googleapis.com/v1/accounts';
// 和從網站送出的一樣：API 金鑰限制成只有網站能用之後，這裡也用得了
const SITE = { Referer: 'https://ttweew.github.io/claude-workspace/' };

let ok = true;
function check(cond, msg) {
    console.log((cond ? 'PASS ' : 'FAIL ') + msg);
    ok &&= !!cond;
    return cond;
}

async function call(method, url, { token, body } = {}) {
    const headers = { ...SITE, 'Content-Type': 'application/json' };
    if (token) headers.Authorization = 'Bearer ' + token;
    const res = await fetch(url, { method, headers, body: body && JSON.stringify(body) });
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch { /* 不是 JSON 就只看狀態 */ }
    return { status: res.status, json, message: json?.error?.message || text.slice(0, 200) };
}

// Firebase 回的錯誤訊息 → 主控台哪一步還沒做（對照 docs/firebase-setup.md 的步驟）
function why(r) {
    const m = r.message;
    if (/CONFIGURATION_NOT_FOUND/.test(m)) return 'Authentication 還沒按「開始使用」';
    if (/ADMIN_ONLY_OPERATION|OPERATION_NOT_ALLOWED/.test(m)) return '匿名登入還沒啟用';
    if (/API_KEY_INVALID|API key not valid/.test(m)) return 'apiKey 不對';
    if (/REFERER|REFERRER/i.test(m)) return 'API 金鑰限制了網站：要加上 https://ttweew.github.io/* 和 http://localhost:*';
    if (/Datastore Mode/i.test(m)) return '資料庫建成了 Datastore 模式，要用 Firestore（原生）模式';
    if (/does not exist|has not been used|SERVICE_DISABLED|is disabled/.test(m)) return 'Firestore 資料庫還沒建立';
    if (r.status === 403) return '安全規則擋下來（規則還沒發布，或貼的不是 firestore.rules）';
    return `${r.status} ${m}`;
}

// JavaScript 的值 ↔ Firestore 的格式（和 tests/rules/rules.test.mjs 一樣：整數存成 integer，有小數的存成 double）
function value(v) {
    if (v === null) return { nullValue: null };
    if (typeof v === 'boolean') return { booleanValue: v };
    if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
    if (typeof v === 'string') return { stringValue: v };
    if (Array.isArray(v)) return { arrayValue: { values: v.map(value) } };
    return { mapValue: { fields: fields(v) } };
}
const fields = o => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, value(v)]));
function plain(v) {
    const [k, x] = Object.entries(v)[0];
    if (k === 'integerValue') return Number(x);
    if (k === 'nullValue') return null;
    if (k === 'mapValue') return Object.fromEntries(Object.entries(x.fields || {}).map(([a, b]) => [a, plain(b)]));
    if (k === 'arrayValue') return (x.values || []).map(plain);
    return x;
}

async function signUp() {
    const r = await call('POST', `${AUTH}:signUp?key=${CFG.apiKey}`, { body: { returnSecureToken: true } });
    return r.status === 200 ? { token: r.json.idToken, uid: r.json.localId } : r;
}
// 寫一筆（和網站一樣：savedAt 用伺服器的時間）；as 是誰在操作，null 是沒登入
async function write(path, data, as, serverTime = true) {
    const w = { update: { name: `${ROOT}/${path}`, fields: fields(data) } };
    if (serverTime) w.updateTransforms = [{ fieldPath: 'savedAt', setToServerValue: 'REQUEST_TIME' }];
    return call('POST', `${FS}:commit`, { token: as?.token, body: { writes: [w] } });
}

// 網站算出來的總結（一小時前做的深蹲和棒式）
const T = Date.now() - 3600000;
const rep = (min, depth, errors = []) => ({ min, depth, errors, start: 0, end: 2.4, similarity: 90 });
const SQUAT = cloudSession(summarize('squat', [rep(85, 'good'), rep(100, 'close', ['lean']), rep(120, 'shallow', ['lean', 'heel'])], T, T + 120000));
const PLANK = cloudSession(summarize('plank', [{ seconds: 32.4, errors: ['sag'] }, { seconds: 45.6, errors: [] }], T + 1000, T + 90000));
const doc = (u, d) => `users/${u.uid}/sessions/${sessionId(d)}`;

console.log('專案：' + CFG.projectId);
const users = [];
const stray = [];
try {
    const a = await signUp();
    if (!check(a.token, '匿名登入' + (a.token ? '' : '：' + why(a)))) throw new Error('stop');
    users.push(a);
    const b = await signUp();
    if (!check(b.token, '第二個匿名帳號' + (b.token ? '' : '：' + why(b)))) throw new Error('stop');
    users.push(b);

    // 自己的紀錄
    let r = await write(doc(a, SQUAT), SQUAT, a);
    if (!check(r.status === 200, '自己的紀錄寫得進去（深蹲）' + (r.status === 200 ? '' : '：' + why(r)))) throw new Error('stop');
    r = await write(doc(a, PLANK), PLANK, a);
    check(r.status === 200, '自己的紀錄寫得進去（棒式）' + (r.status === 200 ? '' : '：' + why(r)));
    r = await write(doc(a, SQUAT), SQUAT, a);
    check(r.status === 200, '同一筆重傳（斷線後補傳）蓋掉自己的');
    r = await call('GET', `${FS}/${doc(a, SQUAT)}`, { token: a.token });
    const got = Object.fromEntries(Object.entries(r.json?.fields || {}).map(([k, v]) => [k, plain(v)]));
    const { savedAt, ...rest } = got;
    const lag = Math.round((Date.now() - Date.parse(savedAt)) / 1000);
    check(r.status === 200 && isDeepStrictEqual(rest, SQUAT) && Math.abs(lag) < 300,
          `讀回來和上傳的一樣，savedAt 是伺服器的時間（和這台電腦差 ${lag} 秒）`);
    r = await call('GET', `${FS}/users/${a.uid}/sessions`, { token: a.token });
    check(r.status === 200 && r.json?.documents?.length === 2, `列出自己的紀錄：${r.json?.documents?.length ?? r.status} 筆`);

    // 別人的、沒登入
    r = await write(doc(b, SQUAT), SQUAT, b);
    check(r.status === 200, '另一個帳號寫自己的');
    const other = doc(b, SQUAT);
    check((await call('GET', `${FS}/${other}`, { token: a.token })).status === 403, '讀不到別人的紀錄');
    check((await call('GET', `${FS}/users/${b.uid}/sessions`, { token: a.token })).status === 403, '列不出別人的紀錄');
    check((await write(other, SQUAT, a)).status === 403, '寫不進別人的紀錄');
    check((await call('DELETE', `${FS}/${other}`, { token: a.token })).status === 403, '刪不掉別人的紀錄');
    check((await call('GET', `${FS}/${other}`)).status === 403, '沒登入讀不到');
    check((await write(other, SQUAT, null)).status === 403, '沒登入寫不進');

    // 其他地方（規則不對、寫進去了的話，最後一起刪掉）
    for (const [path, name] of [[`users/${a.uid}`, '帳號那一層'], ['everyone/list', '別的集合']]) {
        stray.push(path);
        check((await write(path, SQUAT, a)).status === 403, `其他地方寫不進（${name}）`);
    }

    // 被改過的資料
    const bad = {
        '多一個欄位': { ...SQUAT, hacked: true },
        '到位＋再低一點＋太淺 ≠ 次數': { ...SQUAT, good: 3 },
        '不認得的錯誤代號': { ...SQUAT, errors: { hack: 1 } },
        '角度超過 180°': { ...SQUAT, average: 200 }
    };
    for (const [name, d] of Object.entries(bad)) check((await write(doc(a, SQUAT), d, a)).status === 403, '被改過的擋下來：' + name);
    check((await write(`users/${a.uid}/sessions/squat-1`, SQUAT, a)).status === 403, '被改過的擋下來：代號和開始時間對不起來');
    check((await write(doc(a, SQUAT), { ...SQUAT, savedAt: 1 }, a, false)).status === 403, '被改過的擋下來：savedAt 自己填');

    // 刪掉自己的
    for (const d of [SQUAT, PLANK]) check((await call('DELETE', `${FS}/${doc(a, d)}`, { token: a.token })).status === 200, '刪得掉自己的：' + sessionId(d));
} catch (err) {
    if (err.message !== 'stop') check(false, '出錯：' + err.message);
} finally {
    // 測試資料和測試帳號全部刪掉（規則對的話，其他地方本來就寫不進去，刪除也會被擋，沒關係）
    for (const path of stray) await call('DELETE', `${FS}/${path}`, { token: users[0].token });
    for (const u of users) {
        const r = await call('GET', `${FS}/users/${u.uid}/sessions`, { token: u.token });
        for (const d of r.json?.documents || []) await call('DELETE', API + d.name, { token: u.token });
        const left = (await call('GET', `${FS}/users/${u.uid}/sessions`, { token: u.token })).json?.documents?.length || 0;
        const del = await call('POST', `${AUTH}:delete?key=${CFG.apiKey}`, { body: { idToken: u.token } });
        check(!left && del.status === 200, '測完刪掉測試紀錄和測試帳號' + (del.status === 200 ? '' : '：' + why(del)));
    }
}
console.log(ok ? 'ALL PASS' : 'SOME FAIL');
process.exitCode = ok ? 0 : 1;
