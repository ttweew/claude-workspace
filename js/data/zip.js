// 把好幾個檔案壓縮成一個 zip（錄製檔清單的「壓縮成 zip」，10/20）
// iPhone 一次下載很多個檔案時，每一個都要按一次「下載」；壓成一個 zip 只要按一次，檔案也小很多（錄製檔是文字，約剩 1/5）
// 壓縮用瀏覽器內建的 CompressionStream（deflate，和一般 zip 一樣）；舊的瀏覽器沒有時改成不壓縮，只裝在一起，照樣打得開
// 格式照 PKWARE 的 APPNOTE：每個檔案前面一段檔頭，最後是目錄；大小要在 4 GB、65535 個檔案以內

const TABLE = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
        t[n] = c >>> 0;
    }
    return t;
})();

// CRC-32（zip 用來檢查檔案有沒有壞掉）；可以一段一段算，prev 是前一段的結果
export function crc32(bytes, prev = 0) {
    let c = (prev ^ 0xFFFFFFFF) >>> 0;
    for (let i = 0; i < bytes.length; i++) c = TABLE[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
}

// zip 裡的時間是 DOS 格式（2 秒為單位、當地時間）
function dosTime(date) {
    const d = date instanceof Date && !Number.isNaN(date.getTime()) && date.getFullYear() >= 1980 ? date : new Date(1980, 0, 1);
    return {
        time: (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1),
        date: ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()
    };
}

// 同一個名字出現兩次（例如同一秒錄的）：第二個加上 _2，解壓縮時才不會互相蓋掉
function uniqueName(name, used) {
    let out = name, n = 2;
    const dot = name.lastIndexOf('.');
    while (used.has(out)) out = (dot > 0 ? name.slice(0, dot) : name) + '_' + n++ + (dot > 0 ? name.slice(dot) : '');
    used.add(out);
    return out;
}

const MAX = 0xFFFFFFFF;

// 壓縮一個檔案（zip 的 deflate）；瀏覽器不支援或壓縮失敗回傳 null
async function deflate(blob) {
    if (typeof CompressionStream !== 'function') return null;
    try {
        return await new Response(blob.stream().pipeThrough(new CompressionStream('deflate-raw'))).blob();
    } catch (err) {
        return null;
    }
}

// files：[{ name, blob, date }]；compress：要不要壓縮；onProgress(做完幾個, 總共幾個)；回傳 zip 的 Blob
// 一次只把一個檔案讀進記憶體算 CRC；壓縮後沒有變小的就不壓縮
export async function makeZip(files, { compress = true, onProgress } = {}) {
    if (files.length > 0xFFFF) throw new Error('檔案太多，請分批下載');
    const enc = new TextEncoder();
    const used = new Set();
    const parts = [], dir = [];
    let offset = 0;
    for (let i = 0; i < files.length; i++) {
        const f = files[i];
        const name = enc.encode(uniqueName(f.name, used));
        const size = f.blob.size;
        const crc = crc32(new Uint8Array(await f.blob.arrayBuffer()));
        const packed = compress ? await deflate(f.blob) : null;
        const body = packed && packed.size < size ? packed : f.blob;
        const method = body === f.blob ? 0 : 8;   // 0：不壓縮；8：deflate
        const { time, date } = dosTime(f.date);
        const head = new DataView(new ArrayBuffer(30));
        head.setUint32(0, 0x04034B50, true);   // 檔頭的記號
        head.setUint16(4, 20, true);           // 解開要 2.0 版
        head.setUint16(6, 0x0800, true);       // 檔名是 UTF-8
        head.setUint16(8, method, true);
        head.setUint16(10, time, true);
        head.setUint16(12, date, true);
        head.setUint32(14, crc, true);
        head.setUint32(18, body.size, true);   // 壓縮後的大小
        head.setUint32(22, size, true);        // 原本的大小
        head.setUint16(26, name.length, true);
        head.setUint16(28, 0, true);
        parts.push(head.buffer, name, body);
        dir.push({ name, size, packed: body.size, method, crc, time, date, offset });
        offset += 30 + name.length + body.size;
        if (offset > MAX) throw new Error('檔案太大，請分批下載');
        if (onProgress) onProgress(i + 1, files.length);
    }
    const dirStart = offset;
    for (const e of dir) {
        const v = new DataView(new ArrayBuffer(46));
        v.setUint32(0, 0x02014B50, true);      // 目錄的記號
        v.setUint16(4, 20, true);
        v.setUint16(6, 20, true);
        v.setUint16(8, 0x0800, true);
        v.setUint16(10, e.method, true);
        v.setUint16(12, e.time, true);
        v.setUint16(14, e.date, true);
        v.setUint32(16, e.crc, true);
        v.setUint32(20, e.packed, true);
        v.setUint32(24, e.size, true);
        v.setUint16(28, e.name.length, true);
        v.setUint32(42, e.offset, true);       // 其餘欄位（註解、屬性）都是 0
        parts.push(v.buffer, e.name);
        offset += 46 + e.name.length;
    }
    const end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054B50, true);        // 結尾的記號
    end.setUint16(8, dir.length, true);
    end.setUint16(10, dir.length, true);
    end.setUint32(12, offset - dirStart, true);
    end.setUint32(16, dirStart, true);
    parts.push(end.buffer);
    return new Blob(parts, { type: 'application/zip' });
}
