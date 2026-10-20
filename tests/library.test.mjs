// 錄影像手機一樣（10/20）：暫停、繼續（js/data/recorder.js）、錄製檔清單的整理和文字（js/data/library.js）、壓縮成 zip（js/data/zip.js）
// 存進手機（IndexedDB）、下載、刪除在瀏覽器測試
import test from 'node:test';
import assert from 'node:assert/strict';
import { PoseRecorder } from '../js/data/recorder.js';
import { parseRecording } from '../js/data/replay-core.js';
import { cleanItem, itemTitle, itemDetail, sizeText } from '../js/data/library.js';
import { makeZip, crc32 } from '../js/data/zip.js';
import { demoFrames } from './helpers.mjs';

// 每 33 毫秒一格（約每秒 30 格），從 from 毫秒錄到 to 毫秒
function feed(recorder, from, to, frame) {
    for (let t = from; t <= to; t += 33) recorder.add(t, frame.raw, frame.world, frame.raw, frame.world);
}

test('暫停：暫停中的畫面不錄；已錄時間不算暫停的時間；每一格的時間是真的（中間空一段），meta.pauses 記下停了多久', () => {
    const f = demoFrames({ yaw: 5 })[0];
    const r = new PoseRecorder();
    r.start({ videoWidth: 640, videoHeight: 480 });
    feed(r, 1000, 3000, f);
    const before = r.frameCount;
    r.pause(3010);
    assert.equal(r.paused, true);
    feed(r, 3020, 6000, f);
    assert.equal(r.frameCount, before, '暫停中不錄');
    assert.equal(r.recording, true, '暫停中還是在錄製中（還沒結束）');
    r.resume(6010);
    feed(r, 6020, 8000, f);
    r.stop();
    assert.equal(r.paused, false);
    // 錄了 0～2 秒、6.02～8 秒：已錄約 4 秒，不是 7 秒
    assert.ok(Math.abs(r.seconds - 3.98) < 0.05, '已錄 ' + r.seconds);
    const json = JSON.parse(r.toJSON());
    assert.deepEqual(json.meta.pauses, [{ from: 2010, to: 5010 }]);
    const gap = json.frames.findIndex((fr, i) => i && fr.t - json.frames[i - 1].t > 1000);
    assert.ok(gap > 0 && json.frames[gap].t - json.frames[gap - 1].t >= 3000, '暫停的地方時間空一段');
    // 重播分析讀得回來
    assert.equal(parseRecording(r.toJSON()).frames.length, r.frameCount);
});

test('暫停：錄製上限不算暫停的時間；沒有暫停過的錄製檔和以前一模一樣（沒有 pauses 這一項）', () => {
    const f = demoFrames({ yaw: 5 })[0];
    const r = new PoseRecorder();
    r.start({}, 10);
    feed(r, 0, 6000, f);
    r.pause(6000);
    r.resume(30000);
    assert.equal(r.add(30100, f.raw, f.world), true, '暫停了 24 秒，已錄才 6 秒，還可以錄');
    feed(r, 30200, 33900, f);
    assert.equal(r.recording, true);
    assert.equal(r.add(34200, f.raw, f.world), false, '已錄超過 10 秒才自動停止');
    // 按停止時還在暫停：最後那段不記；暫停兩次、還沒錄到第一格就暫停也不會出錯
    const r2 = new PoseRecorder();
    r2.start({});
    r2.pause(0);
    r2.resume(500);
    feed(r2, 600, 1000, f);
    r2.pause(1100);
    r2.pause(1200);
    r2.stop();
    assert.equal(JSON.parse(r2.toJSON()).meta.pauses, undefined);
    const plain = new PoseRecorder();
    plain.start({ workout: 'squat' });
    feed(plain, 0, 500, f);
    plain.stop();
    assert.ok(!plain.toJSON().includes('pauses'));
});

test('錄製檔清單：從這台裝置讀回來的項目被改過時整理掉（名字只留英文數字底線、動作和實測資訊比對清單）', () => {
    const good = { id: 3, name: 'test_A_squat_heel_20261020_210512', savedAt: 1792500000000, workout: 'squat',
        test: { subject: 'A', condition: 'heel', reps: 5 }, seconds: 42.4, frames: 1260, size: 3_500_000, downloaded: true };
    const item = cleanItem(good);
    assert.equal(item.name, good.name);
    assert.equal(item.test.name, '故意腳跟離地');
    assert.equal(itemTitle(item), '深蹲 · 受測者 A · 故意腳跟離地 5 下');
    assert.match(itemDetail(item), /^\d+\/\d+ \d\d:\d\d · 0:42 · 3\.3 MB · 已下載$/);
    for (const bad of [null, 'x', {}, { id: 0 }, { id: -1 }, { id: 1.5 }, { id: '3' }]) assert.equal(cleanItem(bad), null, JSON.stringify(bad));
    const odd = cleanItem({ id: 7, name: '../../etc/passwd', workout: 'constructor', test: { subject: 'A', condition: 'constructor' },
        seconds: -5, frames: 'many', size: NaN, downloaded: 'yes', savedAt: 'today' });
    assert.deepEqual(odd, { id: 7, name: 'pose_7', savedAt: 0, workout: 'free', test: null, seconds: 0, frames: 0, size: 0, downloaded: false });
    assert.equal(itemTitle(odd), '自由模式');
    assert.equal(itemTitle(cleanItem({ id: 8, name: 'pose_20261020_210512', workout: 'plank' })), '棒式');
    // 實測資訊和動作對不上（伏地挺身沒有腳跟離地）：當成一般錄製檔
    assert.equal(cleanItem({ ...good, workout: 'pushup' }).test, null);
    assert.equal(sizeText(820 * 1024), '820 KB');
    assert.equal(sizeText(10), '1 KB');
    assert.equal(sizeText(12.34 * 1024 * 1024), '12.3 MB');
});

// 讀 zip 的目錄（測試用）：每個檔案的名字、壓縮方式、大小、CRC，順便檢查記號和位置都對
async function readZip(blob) {
    const buf = new Uint8Array(await blob.arrayBuffer());
    const v = new DataView(buf.buffer);
    const end = buf.length - 22;
    assert.equal(v.getUint32(end, true), 0x06054B50, '結尾的記號');
    const count = v.getUint16(end + 10, true), dirSize = v.getUint32(end + 12, true), dirStart = v.getUint32(end + 16, true);
    assert.equal(dirStart + dirSize, end);
    const out = [];
    let p = dirStart;
    for (let i = 0; i < count; i++) {
        assert.equal(v.getUint32(p, true), 0x02014B50, '目錄的記號');
        const method = v.getUint16(p + 10, true), crc = v.getUint32(p + 16, true), packed = v.getUint32(p + 20, true), size = v.getUint32(p + 24, true);
        const nameLen = v.getUint16(p + 28, true), offset = v.getUint32(p + 42, true);
        const name = new TextDecoder().decode(buf.subarray(p + 46, p + 46 + nameLen));
        assert.equal(v.getUint32(offset, true), 0x04034B50, name + ' 的檔頭');
        const data = buf.subarray(offset + 30 + nameLen, offset + 30 + nameLen + packed);
        out.push({ name, method, crc, packed, size, data });
        p += 46 + nameLen;
    }
    return out;
}

test('壓縮成 zip：檔名、大小、CRC 都對；壓縮後解得回原本的內容；同名的加 _2；壓縮了沒有變小就不壓', async () => {
    assert.equal(crc32(new TextEncoder().encode('hello')), 0x3610A686, 'CRC-32 的標準答案');
    const big = JSON.stringify({ frames: Array.from({ length: 2000 }, (_, i) => ({ t: i * 33, landmarks: [[0.51234, 0.30111, -0.4, 0.999]] })) });
    const files = [
        { name: 'pose_20261020_210512.json', blob: new Blob([big]), date: new Date(2026, 9, 20, 21, 5, 12) },
        { name: 'pose_20261020_210512.json', blob: new Blob(['{}']), date: new Date(2026, 9, 20, 21, 5, 13) },
        { name: 'empty.json', blob: new Blob([]), date: new Date('壞掉的日期') }
    ];
    const seen = [];
    const zip = await makeZip(files, { onProgress: (n, total) => seen.push(n + '/' + total) });
    assert.deepEqual(seen, ['1/3', '2/3', '3/3']);
    const entries = await readZip(zip);
    assert.deepEqual(entries.map(e => e.name), ['pose_20261020_210512.json', 'pose_20261020_210512_2.json', 'empty.json']);
    const first = entries[0];
    assert.equal(first.method, 8, '大檔案有壓縮');
    assert.ok(first.packed < big.length / 5, '壓縮後 ' + first.packed + '，原本 ' + big.length);
    assert.equal(first.size, big.length);
    assert.equal(first.crc, crc32(new TextEncoder().encode(big)));
    const back = await new Response(new Blob([first.data]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).text();
    assert.equal(back, big, '解壓縮後和原本一樣');
    assert.equal(entries[1].method, 0, '很小的檔案壓了沒變小：不壓');
    assert.equal(new TextDecoder().decode(entries[1].data), '{}');
    assert.equal(entries[2].size, 0);
    // 不壓縮（舊的瀏覽器）也是正確的 zip
    const stored = await readZip(await makeZip(files.slice(0, 1), { compress: false }));
    assert.equal(stored[0].method, 0);
    assert.equal(new TextDecoder().decode(stored[0].data), big);
});
