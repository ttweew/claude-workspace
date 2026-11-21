// 骨架模型的能力表（js/ai/models.js，11/21）：每個模型寫清楚是哪一家、有沒有腳跟腳尖、手指、3D 座標；外面來的名字先比對清單
import test from 'node:test';
import assert from 'node:assert/strict';

globalThis.location = { search: '' };
const { PROFILES, MODEL_KEYS, isModelKey, profileOf, familyOf, hasFeet, shortName, keyOfFile } = await import('../js/ai/models.js');
const { MODELS, YOLO_FILES, firstDownloadBytes, MODEL_FROM_URL } = await import('../js/config.js');
const { MODEL_CHOICES } = await import('../js/ai/model-choice.js');

test('每個模型都有完整的能力表', () => {
    assert.ok(MODEL_KEYS.length >= 2);
    for (const key of MODEL_KEYS) {
        const p = PROFILES[key];
        assert.equal(typeof p.family, 'string', key);
        assert.ok(p.family.length > 0, key);
        assert.equal(typeof p.label, 'string', key);
        assert.equal(typeof p.short, 'string', key);
        assert.match(p.file, /^[a-z0-9_-]+$/, key + ' 錄製檔的名字');
        for (const f of ['feet', 'hands', 'world']) assert.equal(typeof p[f], 'boolean', key + ' ' + f);
    }
});

test('MediaPipe 的模型（config.js 的 MODELS）都在能力表裡，而且是 mediapipe 這一家、有腳跟腳尖', () => {
    for (const key of Object.keys(MODELS)) {
        assert.equal(familyOf(key), 'mediapipe', key);
        assert.equal(hasFeet(key), true, key);
        assert.equal(profileOf(key).world, true, key);
        // 錄製檔記的名字和以前一樣（config.js 的 MODELS 的 name），重播分析、舊的檔案照樣認得
        assert.equal(profileOf(key).file, MODELS[key].name, key);
        assert.equal(shortName(key), key, 'MediaPipe 的短名字維持 lite、full');
    }
});

test('YOLO（11/21）：每個都有模型檔，沒有腳跟腳尖、手指、3D 座標；選單也選得到', () => {
    const yolo = MODEL_KEYS.filter(k => familyOf(k) === 'yolo');
    assert.deepEqual(yolo.sort(), Object.keys(YOLO_FILES).sort());
    for (const key of yolo) {
        assert.equal(hasFeet(key), false, key);
        assert.equal(profileOf(key).hands, false, key);
        assert.equal(profileOf(key).world, false, key);
        assert.ok(MODEL_CHOICES.includes(key), key + ' 在選單裡');
        assert.match(YOLO_FILES[key].path, /^models\/yolo\/[a-z0-9-]+\.tflite$/, key);
        assert.ok(YOLO_FILES[key].size > 1e6, key);
        // 第一次要下載：LiteRT 引擎（約 11 MB）＋模型檔
        assert.ok(firstDownloadBytes(key) > YOLO_FILES[key].size + 10e6, key);
    }
    assert.equal(firstDownloadBytes('lite'), 11.8e6 + MODELS.lite.size, 'MediaPipe 的和以前一樣');
    assert.equal(firstDownloadBytes('constructor'), firstDownloadBytes('lite'), '不認得的名字當作 lite');
    assert.equal(MODEL_FROM_URL, '');
});

test('錄製檔的模型名字 → 代號：認得的換回來，不認得的（舊檔、被改過）回傳空字串', () => {
    for (const key of MODEL_KEYS) assert.equal(keyOfFile(PROFILES[key].file), key);
    for (const bad of ['', 'constructor', '__proto__', null, undefined, 3, 'pose_landmarker_heavy']) assert.equal(keyOfFile(bad), '', String(bad));
    assert.equal(shortName('yolo-n'), 'YOLO26n');
    assert.equal(shortName('constructor'), 'constructor', '不認得的原樣（只當文字顯示）');
});

test('外面來的名字先比對清單：JavaScript 內建的名字查不到東西', () => {
    for (const bad of ['constructor', '__proto__', 'toString', 'hasOwnProperty', '', null, undefined, 1, 'LITE']) {
        assert.equal(isModelKey(bad), false, String(bad));
        assert.equal(profileOf(bad), null, String(bad));
        assert.equal(familyOf(bad), '', String(bad));
    }
});

test('不認得的模型（例如很舊的錄製檔）當作有腳跟腳尖：以前只有 MediaPipe', () => {
    assert.equal(hasFeet('constructor'), true);
    assert.equal(hasFeet(undefined), true);
});
