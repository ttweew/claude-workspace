// 錄製與重播（js/data/）：CSV、JSON 格式，讀檔的防呆，3D 檢查
import test from 'node:test';
import assert from 'node:assert/strict';
import { PoseRecorder } from '../js/data/recorder.js';
import { parseRecording, analyzeRecording } from '../js/data/replay-core.js';
import { demoFrames } from './helpers.mjs';

// 用網站的錄製程式錄一段合成深蹲
function record() {
    const recorder = new PoseRecorder();
    recorder.start({ videoWidth: 640, videoHeight: 480 });
    for (const f of demoFrames({ yaw: 5 })) recorder.add(f.t, f.raw, f.world, f.raw, f.world);
    recorder.stop();
    return recorder;
}

test('CSV：498 欄（原始 234 欄在前面），每一列欄數一樣', () => {
    const lines = record().toCSV().trim().split('\r\n');
    const header = lines[0].replace(/^﻿/, '').split(',');
    assert.equal(header.length, 498);
    assert.deepEqual(header.slice(0, 5), ['frame', 'time_ms', 'detected', 'nose_x', 'nose_y']);
    assert.ok(lines.slice(1).every(l => l.split(',').length === 498));
});

test('JSON：格式名稱、欄位說明、每一格都有原始與處理過的資料', () => {
    const json = JSON.parse(record().toJSON());
    assert.equal(json.format, 'ai-sport-pose');
    assert.deepEqual(Object.keys(json.fields), ['landmarks', 'world', 'smoothed', 'stableWorld']);
    const f = json.frames[100];
    assert.equal(f.landmarks.length, 33);
    assert.equal(f.stableWorld.length, 33);
});

test('重播：同一段錄製，讀 JSON 和讀 CSV 算出來的結果相同', async () => {
    const recorder = record();
    const a = await analyzeRecording(parseRecording(recorder.toJSON()), 640, 480, { lab: true });
    const b = await analyzeRecording(parseRecording(recorder.toCSV()), 640, 480, { lab: true });
    assert.deepEqual(Array.from(a.angles), Array.from(b.angles));
    assert.equal(a.reps.length, 5);
    assert.equal(b.reps.length, 5);
});

test('重播：CSV 最後一列只存到一半（下載中斷）時略過那一列，其他照常', () => {
    const csv = record().toCSV();
    const cut = csv.slice(0, csv.length - 400);
    const parsed = parseRecording(cut);
    assert.ok(parsed.frames.length > 100);
});

test('重播：不是本網站的檔案、時間壞掉的檔案，給清楚的中文錯誤', () => {
    assert.throws(() => parseRecording('{"hello": 1}'), /不是本網站/);
    const json = JSON.parse(record().toJSON());
    json.frames[10].t = 'abc';
    assert.throws(() => parseRecording(JSON.stringify(json)), /第 11 格的時間不正確/);
});

test('3D 檢查：合成資料的大腿長度約 40 公分；沒有公尺座標的舊檔案不顯示', async () => {
    const recorder = record();
    const r = await analyzeRecording(parseRecording(recorder.toJSON()), 640, 480);
    assert.ok(r.hasWorld);
    const thigh = Array.from(r.boneStable).filter((v, i) => i % 4 === 0 && Number.isFinite(v)).sort((x, y) => x - y);
    const median = thigh[thigh.length >> 1];
    assert.ok(Math.abs(median - 0.4) < 0.02, '大腿中間值 ' + (median * 100).toFixed(1) + ' 公分');
    const old = JSON.parse(recorder.toJSON());
    old.frames.forEach(f => { delete f.world; });
    const r2 = await analyzeRecording(parseRecording(JSON.stringify(old)), 640, 480);
    assert.equal(r2.hasWorld, false);
});
