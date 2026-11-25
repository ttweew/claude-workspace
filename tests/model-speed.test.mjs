// 一鍵測速（js/ai/model-speed.js，11/25）：測的順序、最多下載多少、每個模型怎麼量（暖機、只算有人的格子、太久沒人就放棄）、
// 表格和複製的文字（照能力表的順序、沒量到寫原因、和 lite 比慢幾倍）；外面組的結果先比對清單
import test from 'node:test';
import assert from 'node:assert/strict';

globalThis.location = { search: '' };
const { SPEED_PLAN, speedOrder, speedDownloadBytes, ModelTimer, speedRows, speedReport } = await import('../js/ai/model-speed.js');
const { MODEL_KEYS } = await import('../js/ai/models.js');
const { MODELS, YOLO_FILES, LITERT_ENGINE_SIZE, MEDIAPIPE_ENGINE_SIZE, firstDownloadBytes } = await import('../js/config.js');
const { phoneReport } = await import('../js/ui/phone-info.js');

test('測的順序：先測現在用的（不用換），其他照能力表的順序；不認得的名字照能力表從頭測', () => {
    assert.deepEqual(speedOrder('lite'), ['lite', 'full', 'yolo-n', 'yolo-s']);
    assert.deepEqual(speedOrder('yolo-n'), ['yolo-n', 'lite', 'full', 'yolo-s']);
    assert.deepEqual(speedOrder('full'), ['full', 'lite', 'yolo-n', 'yolo-s']);
    for (const bad of ['constructor', '__proto__', 'auto', '', undefined, null, 42]) {
        assert.deepEqual(speedOrder(bad), MODEL_KEYS, String(bad));
    }
    // 每個模型都測到、只測一次
    for (const key of MODEL_KEYS) assert.deepEqual([...speedOrder(key)].sort(), [...MODEL_KEYS].sort(), key);
});

test('最多下載多少：其他模型的檔案＋另一家的 AI 引擎（和首頁「第一次使用需下載約 … MB」同一份大小）', () => {
    const mb = key => Math.round(speedDownloadBytes(key) / 1e6);
    // 現在用 lite：full 的模型檔、YOLO 的引擎和兩個模型檔
    assert.equal(speedDownloadBytes('lite'), MODELS.full.size + LITERT_ENGINE_SIZE + YOLO_FILES['yolo-n'].size + YOLO_FILES['yolo-s'].size);
    assert.equal(mb('lite'), 43);
    // 現在用 YOLO26n：MediaPipe 的引擎和兩個模型檔、YOLO26s 的模型檔
    assert.equal(speedDownloadBytes('yolo-n'), MEDIAPIPE_ENGINE_SIZE + MODELS.lite.size + MODELS.full.size + YOLO_FILES['yolo-s'].size);
    // 引擎的大小和首頁的說明一樣（firstDownloadBytes = 引擎＋模型檔）
    assert.equal(MEDIAPIPE_ENGINE_SIZE + MODELS.lite.size, firstDownloadBytes('lite'));
    assert.equal(LITERT_ENGINE_SIZE + YOLO_FILES['yolo-n'].size, firstDownloadBytes('yolo-n'));
    // 不認得的名字當作 lite（網站預設），不會變成 NaN
    for (const bad of ['constructor', '__proto__', '', undefined]) assert.equal(speedDownloadBytes(bad), speedDownloadBytes('lite'), String(bad));
});

// 從 at0 開始每 step 毫秒一格，量 seconds 秒；person(i)：第 i 格有沒有人
function feed(timer, at0, seconds, { step = 1000 / 30, ms = i => 20 + (i % 5), person = () => true } = {}) {
    let at = at0;
    for (let i = 0; at < at0 + seconds * 1000; i++, at += step) timer.frame(ms(i), person(i), at);
    return at;
}

test('每個模型：暖機 2 秒的格子不算；量滿 8 秒而且有人的格子夠了才算好；每格幾毫秒取中位數', () => {
    const t = new ModelTimer(1000);
    // 暖機中（換好模型後 2 秒內）：很慢的格子不算
    feed(t, 1000, 2, { ms: () => 500 });
    assert.equal(t.state(2999), 'warmup');
    assert.equal(t.result().frames, 0);
    // 量 8 秒：每格 20～24 毫秒、每秒 30 格
    feed(t, 3000, 8);
    assert.equal(t.state(10999), 'measuring');
    assert.equal(t.state(11000), 'done');
    const r = t.result();
    assert.equal(r.ms, 22, '中位數');
    assert.equal(r.fps, 30, '每秒 30 格');
    assert.ok(r.frames >= 239 && r.frames <= 241, String(r.frames));
    // 量了幾秒：無條件捨去（和畫面上其他秒數一樣）
    assert.equal(t.seconds(2500), 0);
    assert.equal(t.seconds(3999), 0);
    assert.equal(t.seconds(4000), 1);
    assert.equal(t.seconds(10999), 7);
    assert.equal(SPEED_PLAN.warmupMs, 2000);
    assert.equal(SPEED_PLAN.measureMs, 8000);
});

test('每格幾毫秒只算有人的格子；每秒幾格算全部的格子；最近 1 秒沒人時卡片寫「等你站進畫面」', () => {
    const t = new ModelTimer(0);
    // 一半的格子沒有人（沒有人時特別慢：MediaPipe 要重新找人）
    feed(t, 2000, 8, { ms: i => (i % 2 ? 80 : 20), person: i => i % 2 === 0 });
    const r = t.result();
    assert.equal(r.ms, 20, '沒有人的格子不算進毫秒數');
    assert.equal(r.fps, 30, '每秒幾格：有沒有人都算');
    assert.ok(t.seesPerson(10000));
    assert.ok(!t.seesPerson(11500));
});

test('太久沒有人：量了 20 秒還不到 15 格有人就放棄這一個（不會一直等）；有人的格子夠了就算好', () => {
    const nobody = new ModelTimer(0);
    feed(nobody, 2000, 20, { person: i => i < 10 });
    assert.equal(nobody.state(21999), 'measuring');
    assert.equal(nobody.state(22000), 'nobody');
    // 前 8 秒有人的格子不夠，後來站進來了：湊滿 15 格就算好（不用等到 20 秒）
    const late = new ModelTimer(0);
    feed(late, 2000, 9, { person: i => i >= 9 * 30 - 15 });
    assert.equal(late.state(11000), 'done');
    assert.equal(late.result().frames, 15);
});

test('奇怪的格子不算：毫秒不是數字、負的、時間不是數字；最多記 3000 格（手機很快也不會一直變大）', () => {
    const t = new ModelTimer(0);
    for (const ms of [NaN, -1, Infinity, '20', null, undefined]) t.frame(ms, true, 5000);
    t.frame(20, true, NaN);
    t.frame(20, true, undefined);
    assert.equal(t.result().frames, 0);
    assert.equal(t.result().fps, 0, '沒有格子：每秒 0 格，不是 NaN');
    assert.equal(t.result().ms, 0);
    const many = new ModelTimer(0);
    for (let i = 0; i < 5000; i++) many.frame(10, true, 2000 + i);
    assert.equal(many.result().frames, 3000);
});

const done = (key, ms, fps, compute = 'GPU', detail = '') => ({ key, ms, fps, frames: 200, compute, detail, error: '' });

test('表格：照能力表的順序、沒量到的寫原因、沒測的寫「沒測」；和 lite 比慢幾倍用畫面上的毫秒算', () => {
    const rows = speedRows([
        done('yolo-n', 45, 21, 'GPU', 'WebGPU'),
        done('lite', 18, 30, 'GPU', 'Adreno'),
        { key: 'yolo-s', error: '載入失敗：這個瀏覽器不能執行 YOLO' },
        done('full', 27, 30)
    ]);
    assert.deepEqual(rows.map(r => r.key), MODEL_KEYS);
    assert.deepEqual(rows.map(r => r.label), ['MediaPipe lite', 'MediaPipe full', 'YOLO26n', 'YOLO26s']);
    assert.deepEqual(rows.map(r => r.ms), ['18 毫秒', '27 毫秒', '45 毫秒', '—']);
    assert.deepEqual(rows.map(r => r.fps), ['30 格', '30 格', '21 格', '—']);
    assert.deepEqual(rows.map(r => r.compute), ['GPU', 'GPU', 'GPU', '—']);
    assert.deepEqual(rows.map(r => r.ratio), ['', '1.5', '2.5', '']);
    assert.equal(rows[3].error, '載入失敗：這個瀏覽器不能執行 YOLO');
    // 只測了一個（按了停止）：其他寫「沒測」；lite 沒量到就不算倍數
    const partial = speedRows([done('full', 27, 30)]);
    assert.deepEqual(partial.map(r => r.error), ['沒測', '', '沒測', '沒測']);
    assert.equal(partial[1].ratio, '');
});

test('外面組的結果先比對清單：怪名字不收、數字不是數字的寫「沒量到」，不會出現 NaN、undefined', () => {
    const rows = speedRows([
        { key: 'constructor', ms: 5, fps: 30 },
        { key: '__proto__', ms: 5, fps: 30 },
        { key: 'lite', ms: NaN, fps: 30, compute: 'GPU' },
        { key: 'full', ms: 20, fps: 'x', compute: 'GPU' },
        { key: 'yolo-n', ms: 0, fps: 30, compute: 42 },
        null, 'lite', 7
    ]);
    assert.deepEqual(rows.map(r => r.key), MODEL_KEYS);
    assert.equal(rows[0].error, '沒量到');
    assert.equal(rows[1].error, '沒量到');
    // 0 毫秒（四捨五入後；測試的假 AI 很快）是量到了；運算不是文字寫「不明」
    assert.equal(rows[2].error, '');
    assert.equal(rows[2].ms, '0 毫秒');
    assert.equal(rows[2].compute, '不明');
    assert.equal(rows[2].ratio, '', 'lite 沒量到：不算倍數');
    assert.equal(rows[3].error, '沒測');
    for (const bad of [undefined, null, 'x', {}]) assert.equal(speedRows(bad).length, MODEL_KEYS.length);
    const text = JSON.stringify(rows);
    assert.ok(!/NaN|undefined|null/.test(text), text);
});

test('複製的文字：每個模型一行（照能力表的順序）、怎麼量的、手機和鏡頭（和「複製手機資訊」同樣的寫法）', () => {
    const info = {
        time: new Date(2026, 10, 25, 9, 5),
        results: [done('lite', 18, 30, 'GPU', 'Adreno 640'), done('full', 27, 30, 'GPU', 'Adreno 640'),
            done('yolo-n', 45, 21, 'GPU', 'WebGPU（背景運算）'), { key: 'yolo-s', error: '載入失敗：下載或啟動失敗（請檢查網路）' }],
        device: { os: 'Android', osVersion: '14', browser: 'Chrome 131' },
        screen: { width: 412, height: 915, dpr: 2.625 },
        ua: 'Mozilla/5.0 (Linux; Android 14)',
        size: '640×480', cameraFps: 30, cameraMax: 30, fpsSetting: '每秒 30 格'
    };
    const lines = speedReport(info).split('\n');
    assert.deepEqual(lines, [
        '【AI 速度】2026/11/25 9:05',
        'MediaPipe lite：每格 18 毫秒 · 每秒 30 格 · GPU（Adreno 640）',
        'MediaPipe full：每格 27 毫秒（lite 的 1.5 倍） · 每秒 30 格 · GPU（Adreno 640）',
        'YOLO26n：每格 45 毫秒（lite 的 2.5 倍） · 每秒 21 格 · GPU（WebGPU（背景運算））',
        'YOLO26s：沒量到（載入失敗：下載或啟動失敗（請檢查網路））',
        '（每個模型暖機 2 秒、量 8 秒，只算畫面裡有人的格子；每秒格數不會超過鏡頭的格數）',
        '系統：Android 14 · 瀏覽器：Chrome 131',
        '螢幕：412×915（像素密度 2.625）',
        '鏡頭：640×480 · 每秒 30 格（最多 30） · 設定：每秒 30 格',
        '識別字串：Mozilla/5.0 (Linux; Android 14)'
    ]);
    // 「複製手機資訊」的系統、鏡頭那兩行一樣（共用 js/ui/phone-info.js 的寫法）
    const phone = phoneReport({ ...info, compute: 'GPU', model: 'lite 模型', aiMs: 18, aiFps: 30 }).split('\n');
    assert.ok(phone.includes(lines[6]) && phone.includes(lines[8]), phone.join('\n'));
    // 什麼都沒有：不會出現 NaN、undefined
    const empty = speedReport({ time: new Date(2026, 0, 1, 0, 0), results: [] });
    assert.ok(!/NaN|undefined/.test(empty), empty);
    assert.match(empty, /MediaPipe lite：沒量到（沒測）/);
    assert.match(empty, /鏡頭：還沒開/);
});
