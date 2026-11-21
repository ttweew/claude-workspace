// 骨架模型的能力表（js/ai/models.js，11/21）：每個模型寫清楚是哪一家、有沒有腳跟腳尖、手指、3D 座標；外面來的名字先比對清單
import test from 'node:test';
import assert from 'node:assert/strict';

globalThis.location = { search: '' };
const { PROFILES, MODEL_KEYS, isModelKey, profileOf, familyOf, hasFeet } = await import('../js/ai/models.js');
const { MODELS } = await import('../js/config.js');

test('每個模型都有完整的能力表', () => {
    assert.ok(MODEL_KEYS.length >= 2);
    for (const key of MODEL_KEYS) {
        const p = PROFILES[key];
        assert.equal(typeof p.family, 'string', key);
        assert.ok(p.family.length > 0, key);
        assert.equal(typeof p.label, 'string', key);
        for (const f of ['feet', 'hands', 'world']) assert.equal(typeof p[f], 'boolean', key + ' ' + f);
    }
});

test('MediaPipe 的模型（config.js 的 MODELS）都在能力表裡，而且是 mediapipe 這一家、有腳跟腳尖', () => {
    for (const key of Object.keys(MODELS)) {
        assert.equal(familyOf(key), 'mediapipe', key);
        assert.equal(hasFeet(key), true, key);
        assert.equal(profileOf(key).world, true, key);
    }
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
