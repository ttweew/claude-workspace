// 雲端的安全規則（firestore.rules）：在 Firebase 的本機模擬器上，用和網站一樣的方式寫入，確認該收的收、該擋的擋
// 執行（要先有 Java）：npx firebase-tools emulators:exec --only firestore --project demo-sport "npm run test:rules"
// 不用安裝套件：直接用模擬器的 REST 介面；登入用模擬器接受的「沒有簽章的測試用身分」（只有模擬器認得）
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { cloudSession, sessionId } from '../../js/cloud/sync.js';
import { summarize } from '../../js/analysis/session.js';
import { FORM_RULES } from '../../js/analysis/form.js';
import { random } from '../helpers.mjs';

const HOST = process.env.FIRESTORE_EMULATOR_HOST;   // emulators:exec 會設定，例如 127.0.0.1:8080
const PROJECT = 'demo-sport';
const ROOT = `projects/${PROJECT}/databases/(default)/documents`;
const API = `http://${HOST}/v1/${ROOT}`;
const skip = HOST ? false : '沒有開 Firestore 模擬器（FIRESTORE_EMULATOR_HOST），見 docs/firebase-setup.md';

// GitHub 上一定要真的跑：沒開模擬器就失敗，不能全部略過、看起來像通過
test('有開 Firestore 模擬器', { skip: !process.env.CI }, () => assert.ok(HOST, '沒有 FIRESTORE_EMULATOR_HOST'));

// ---------- 和模擬器溝通 ----------
const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
function token(uid) {
    const now = Math.floor(Date.now() / 1000);
    return b64({ alg: 'none', kid: 'fakekid', typ: 'JWT' }) + '.' + b64({
        iss: 'https://securetoken.google.com/' + PROJECT, aud: PROJECT, iat: now, exp: now + 3600, auth_time: now,
        sub: uid, user_id: uid, firebase: { sign_in_provider: 'anonymous', identities: {} }
    }) + '.';
}
// as：誰在操作（uid）；null 是沒登入；'owner' 是管理者（不受規則限制，只用來準備資料）
const headers = as => (as === null ? {} : { Authorization: 'Bearer ' + (as === 'owner' ? 'owner' : token(as)) });

// JavaScript 的值 → Firestore 的格式（和 Firebase 的程式一樣：整數存成 integer，有小數的存成 double）
function value(v) {
    if (v === null) return { nullValue: null };
    if (typeof v === 'boolean') return { booleanValue: v };
    if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
    if (typeof v === 'string') return { stringValue: v };
    if (Array.isArray(v)) return { arrayValue: { values: v.map(value) } };
    return { mapValue: { fields: fields(v) } };
}
const fields = o => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, value(v)]));

// 寫一筆（和網站一樣：savedAt 用伺服器的時間）；回傳 HTTP 狀態，200 收、403 擋
async function write(uid, id, data, { as = uid, serverTime = true, path } = {}) {
    const w = { update: { name: `${ROOT}/${path || `users/${uid}/sessions/${id}`}`, fields: fields(data) } };
    if (serverTime) w.updateTransforms = [{ fieldPath: 'savedAt', setToServerValue: 'REQUEST_TIME' }];
    const res = await fetch(`${API}:commit`, { method: 'POST', headers: headers(as), body: JSON.stringify({ writes: [w] }) });
    return res.status;
}
const read = async (path, as) => (await fetch(`${API}/${path}`, { headers: headers(as) })).status;
const remove = async (path, as) => (await fetch(`${API}/${path}`, { method: 'DELETE', headers: headers(as) })).status;

test.before(async () => {
    if (skip) return;
    // 用專案裡的規則檔（不管模擬器啟動時讀到哪一份），清掉之前的資料
    const rules = readFileSync(new URL('../../firestore.rules', import.meta.url), 'utf8');
    const res = await fetch(`http://${HOST}/emulator/v1/projects/${PROJECT}:securityRules`, {
        method: 'PUT', body: JSON.stringify({ rules: { files: [{ name: 'firestore.rules', content: rules }] } })
    });
    assert.equal(res.status, 200, '規則載入失敗：' + await res.text());
    await fetch(`http://${HOST}/emulator/v1/${ROOT}`, { method: 'DELETE' });
});

// ---------- 網站算出來的總結 ----------
const rep = (min, depth, errors = [], start = 0, end = 2.4) => ({ min, depth, errors, start, end, similarity: 90 });
const T = 1792300000000;
const SQUAT = cloudSession(summarize('squat', [rep(85, 'good'), rep(100, 'close', ['lean']), rep(120, 'shallow', ['lean', 'heel'])], T, T + 120000));
const PLANK = cloudSession(summarize('plank', [{ seconds: 32.4, errors: ['sag'] }, { seconds: 45.6, errors: [] }], T + 1000, T + 90000));
const idOf = d => sessionId(d);

test('自己的紀錄：計次、計時都收，讀得到、重傳蓋掉自己、刪得掉', { skip }, async () => {
    assert.equal(await write('alice', idOf(SQUAT), SQUAT), 200);
    assert.equal(await write('alice', idOf(PLANK), PLANK), 200);
    assert.equal(await write('alice', idOf(SQUAT), SQUAT), 200, '同一筆重傳（斷線後補傳）');
    assert.equal(await read(`users/alice/sessions/${idOf(SQUAT)}`, 'alice'), 200);
    assert.equal(await read('users/alice/sessions', 'alice'), 200, '列出自己的全部紀錄');
    assert.equal(await remove(`users/alice/sessions/${idOf(PLANK)}`, 'alice'), 200);
});

test('別人的、沒登入：讀不到、寫不進、刪不掉', { skip }, async () => {
    assert.equal(await write('bob', idOf(SQUAT), SQUAT, { as: 'owner' }), 200);
    assert.equal(await read(`users/bob/sessions/${idOf(SQUAT)}`, 'alice'), 403);
    assert.equal(await read('users/bob/sessions', 'alice'), 403, '列出別人的紀錄');
    assert.equal(await write('bob', idOf(SQUAT), SQUAT, { as: 'alice' }), 403);
    assert.equal(await remove(`users/bob/sessions/${idOf(SQUAT)}`, 'alice'), 403);
    assert.equal(await read(`users/bob/sessions/${idOf(SQUAT)}`, null), 403);
    assert.equal(await write('bob', idOf(SQUAT), SQUAT, { as: null }), 403);
});

test('其他地方一律不能讀寫', { skip }, async () => {
    assert.equal(await write('alice', null, SQUAT, { path: 'users/alice' }), 403);
    assert.equal(await write('alice', null, SQUAT, { path: 'everyone/list' }), 403);
    assert.equal(await read('users/alice', 'alice'), 403);
});

test('被改過的資料進不來（每一種都擋）', { skip }, async () => {
    const bad = {
        '多一個欄位': { ...SQUAT, hacked: true },
        '次數是負的': { ...SQUAT, count: -1 },
        '次數是 0': { ...SQUAT, count: 0, good: 0, close: 0, shallow: 0, clean: 0, errors: {} },
        '沒有錯誤的比次數多': { ...SQUAT, clean: 4 },
        '到位＋再低一點＋太淺 ≠ 次數': { ...SQUAT, good: 3 },
        '不認得的錯誤代號': { ...SQUAT, errors: { hack: 1 } },
        '錯誤比次數多': { ...SQUAT, errors: { lean: 4 } },
        '錯誤次數有小數': { ...SQUAT, errors: { lean: 1.5 } },
        '角度超過 180°': { ...SQUAT, best: 85, average: 200 },
        '最低比平均高': { ...SQUAT, best: 110 },
        '相似度超過 100': { ...SQUAT, similarity: 101 },
        '相似度是文字': { ...SQUAT, similarity: '95' },
        '格式版本不對': { ...SQUAT, v: 2 },
        '每下秒數是負的': { ...SQUAT, tempo: -1 },
        '計次的動作多了棒式的欄位': { ...SQUAT, seconds: [1, 2, 3] },
        '棒式多了計次的欄位': { ...PLANK, good: 2 },
        '棒式最久比總共久': { ...PLANK, best: 100 },
        '棒式每一次的秒數個數不對': { ...PLANK, seconds: [32] },
        '少了次數': Object.fromEntries(Object.entries(SQUAT).filter(([k]) => k !== 'count'))
    };
    for (const [why, d] of Object.entries(bad)) assert.equal(await write('alice', idOf(SQUAT.workout === d.workout ? SQUAT : PLANK), d), 403, why);
    // 代號和內容對不起來、動作不認得、時間不是數字、savedAt 自己填
    assert.equal(await write('alice', 'squat-1', SQUAT), 403, '代號和開始時間對不起來');
    assert.equal(await write('alice', 'constructor-' + T, { ...SQUAT, workout: 'constructor' }), 403, '不認得的動作');
    assert.equal(await write('alice', 'free-' + T, { ...SQUAT, workout: 'free' }), 403, '自由模式沒有總結');
    assert.equal(await write('alice', idOf(SQUAT), { ...SQUAT, date: String(T) }), 403, '時間是文字');
    assert.equal(await write('alice', idOf(SQUAT), { ...SQUAT, savedAt: 1 }, { serverTime: false }), 403, 'savedAt 自己填');
});

test('網站算出來的每一筆總結，雲端都收（四個動作各 25 筆隨機的）', { skip }, async () => {
    const rnd = random(20261018);
    const pick = list => list[Math.floor(rnd() * list.length)];
    for (const workout of ['squat', 'pushup', 'lunge', 'plank']) {
        const ids = [...new Set(FORM_RULES[workout].map(r => r.id))];
        for (let k = 0; k < 25; k++) {
            const n = 1 + Math.floor(rnd() * 40);
            const errs = () => ids.filter(() => rnd() < 0.3);
            const items = workout === 'plank'
                ? Array.from({ length: n }, () => ({ seconds: rnd() * 120, errors: errs() }))
                : Array.from({ length: n }, () => {
                    const start = rnd() * 600;
                    return { min: 40 + rnd() * 130, depth: pick(['good', 'close', 'shallow']), errors: errs(), start, end: start + 0.5 + rnd() * 6,
                             similarity: rnd() < 0.2 ? null : Math.round(rnd() * 100) };
                });
            const start = T + k * 3600000;
            const d = cloudSession(summarize(workout, items, start, start + 60000 + rnd() * 3600000));
            assert.ok(d, `${workout} 第 ${k} 筆：網站自己算的總結格式要對`);
            assert.equal(await write('carol', sessionId(d), d), 200, `${workout} 第 ${k} 筆：${JSON.stringify(d).slice(0, 160)}`);
        }
    }
});
