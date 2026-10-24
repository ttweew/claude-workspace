// 讀 zip（實測報表用，10/21）：錄製檔清單「壓縮成 zip 下載」的檔案直接丟進來，不用先解壓縮
// 也讀得了 Windows、Mac 自己壓的 zip（不壓縮或 deflate 兩種，絕大部分的 zip 都是這兩種）；zip64、加密的不支援
// 檔案可能被改過：每個位置、長度都先檢查在檔案範圍內；解出來的內容用 CRC-32 核對，壞掉的那個檔案跳過，其他照樣讀
// 格式照 PKWARE 的 APPNOTE：最後面的「目錄結尾」→ 目錄（每個檔案的名字、大小、在哪裡）→ 每個檔案的檔頭和內容

import { crc32 } from './zip.js';

const MAX_FILES = 2000;                       // 一次最多看這麼多個（實測 4 個人 × 13 組約 50 個）
const MAX_SIZE = 400 * 1024 * 1024;           // 一個檔案最大 400 MB（和重播分析一樣：再大手機的瀏覽器會當掉）
// 解出來的檔案加起來最多 1 GB：實測 4 個人 × 13 組約 50 個、每個 2～7 MB，約 250 MB
// 10/24 安全複查：以前只限一個檔案，被改過的 zip 放很多個「寫 400 MB、壓得很小」的檔案，加起來會把記憶體用完；超過的跳過
const MAX_TOTAL = 1024 * 1024 * 1024;

// 找「目錄結尾」：在檔案最後 22 個位元組到 22＋65535（後面可能有註解）之間，從後往前找記號 50 4B 05 06
function findEnd(view) {
    const min = Math.max(0, view.byteLength - 22 - 0xFFFF);
    for (let p = view.byteLength - 22; p >= min; p--) {
        if (view.getUint32(p, true) === 0x06054B50) return p;
    }
    return -1;
}

// 解壓縮到 size 個位元組（目錄寫的大小）就停：被改過的 zip 可能寫很小、解出來卻很大，不先停會把手機的記憶體用完
async function inflate(bytes, size) {
    if (typeof DecompressionStream !== 'function') throw new Error('這個瀏覽器不能解壓縮');
    const reader = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw')).getReader();
    const out = new Uint8Array(size);
    let n = 0;
    for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        if (n + value.length > size) {
            reader.cancel().catch(() => {});
            throw new Error('比寫的大');
        }
        out.set(value, n);
        n += value.length;
    }
    return out.subarray(0, n);
}

// blob：zip 檔；keep(name)：要不要這個檔案（例如只要 .json）；maxTotal：解出來加起來最多幾個位元組（測試用小一點的）
// 回傳 { files: [{ name, blob }], skipped: 跳過幾個（壞掉、不支援、太大） }
export async function readZip(blob, keep = () => true, maxTotal = MAX_TOTAL) {
    const buf = new Uint8Array(await blob.arrayBuffer());
    const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
    const end = findEnd(view);
    if (end < 0) throw new Error('不是 zip 檔，或檔案不完整');
    const count = view.getUint16(end + 10, true);
    const dirSize = view.getUint32(end + 12, true);
    let p = view.getUint32(end + 16, true);
    if (p + dirSize > end) throw new Error('zip 檔不完整');
    const files = [];
    let skipped = 0, total = 0;
    for (let i = 0; i < Math.min(count, MAX_FILES); i++) {
        if (p + 46 > end || view.getUint32(p, true) !== 0x02014B50) throw new Error('zip 檔的目錄壞掉了');
        const flags = view.getUint16(p + 8, true), method = view.getUint16(p + 10, true);
        const crc = view.getUint32(p + 16, true), packed = view.getUint32(p + 20, true), size = view.getUint32(p + 24, true);
        const nameLen = view.getUint16(p + 28, true), extraLen = view.getUint16(p + 30, true), commentLen = view.getUint16(p + 32, true);
        const local = view.getUint32(p + 42, true);
        const nameBytes = buf.subarray(p + 46, p + 46 + nameLen);
        // 名字：有 UTF-8 記號（第 11 位元）就用 UTF-8；沒有的（舊的 Windows 壓縮）中文會亂碼，但英文數字的檔名照樣讀得到
        const name = (flags & 0x800 ? new TextDecoder() : new TextDecoder('latin1')).decode(nameBytes);
        p += 46 + nameLen + extraLen + commentLen;
        if (name.endsWith('/') || !keep(name)) continue;
        try {
            if (flags & 1) throw new Error('加密');
            if (size > MAX_SIZE || packed === 0xFFFFFFFF || size === 0xFFFFFFFF || total + size > maxTotal) throw new Error('太大');
            if (local + 30 > buf.length || view.getUint32(local, true) !== 0x04034B50) throw new Error('檔頭');
            const start = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
            if (start + packed > buf.length) throw new Error('不完整');
            const data = buf.subarray(start, start + packed);
            const out = method === 0 ? data : method === 8 ? await inflate(data, size) : null;
            if (!out || out.length !== size || crc32(out) !== crc) throw new Error('內容不對');
            files.push({ name: name.split('/').pop(), blob: new Blob([out], { type: 'application/json' }) });
            total += size;
        } catch (err) {
            skipped++;
        }
    }
    return { files, skipped: skipped + Math.max(0, count - MAX_FILES) };
}
