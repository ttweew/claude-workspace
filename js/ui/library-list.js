// 錄製檔清單的畫面（js/data/library.js；首頁「錄製檔」和鏡頭畫面的「錄製檔」共用）
// 每一段可以勾選；一段一段下載（每一行的「下載」）、勾選的一次下載（還是一個個檔案）、勾選的壓縮成一個 zip、刪除
// 下載過的標「已下載」；刪除前會問，還沒下載的會特別提醒

import { listRecordings, getRecordingFile, markDownloaded, deleteRecordings, itemTitle, itemDetail, sizeText } from '../data/library.js';
import { downloadBlob } from '../data/recorder.js';
import { makeZip } from '../data/zip.js';

const lists = [];   // 畫面上所有的清單（首頁、鏡頭畫面）：存了新的一段、刪除之後一起更新

// 一次下載很多個檔案時，瀏覽器會把太快連續的下載擋掉：每個之間隔一下
const GAP_MS = 400;
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

export class LibraryList {
    // root：放清單的地方（裡面要有 .lib-all、.lib-picked、.lib-items、.lib-each、.lib-zip、.lib-delete、.lib-status）
    // onChange(items)：清單變了（例如更新「錄製檔 7」的數字）
    constructor(root, onChange = () => {}) {
        this.root = root;
        this.onChange = onChange;
        this.items = [];
        this.picked = new Set();
        this.busy = false;
        const $ = sel => root.querySelector(sel);
        this.all = $('.lib-all');
        this.pickedText = $('.lib-picked');
        this.list = $('.lib-items');
        this.eachBtn = $('.lib-each');
        this.zipBtn = $('.lib-zip');
        this.deleteBtn = $('.lib-delete');
        this.status = $('.lib-status');
        this.all.addEventListener('change', () => {
            this.picked = new Set(this.all.checked ? this.items.map(i => i.id) : []);
            this.render();
        });
        this.eachBtn.addEventListener('click', () => this.downloadEach());
        this.zipBtn.addEventListener('click', () => this.downloadZip());
        this.deleteBtn.addEventListener('click', () => this.remove());
        lists.push(this);
    }

    async refresh() {
        try {
            this.items = await listRecordings();
        } catch (err) {
            this.items = [];
        }
        const ids = new Set(this.items.map(i => i.id));
        this.picked = new Set([...this.picked].filter(id => ids.has(id)));
        this.render();
        this.onChange(this.items);
        return this.items;
    }

    render() {
        this.list.replaceChildren(...this.items.map(item => {
            const li = document.createElement('li');
            const label = document.createElement('label');
            const box = document.createElement('input');
            box.type = 'checkbox';
            box.checked = this.picked.has(item.id);
            box.addEventListener('change', () => {
                if (box.checked) this.picked.add(item.id);
                else this.picked.delete(item.id);
                this.render();
            });
            const text = document.createElement('span');
            const title = document.createElement('strong');
            title.textContent = itemTitle(item);
            const detail = document.createElement('small');
            detail.textContent = itemDetail(item);
            text.append(title, detail);
            label.append(box, text);
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.textContent = '下載';
            btn.setAttribute('aria-label', '下載 ' + itemTitle(item) + '（' + itemDetail(item) + '）');
            btn.addEventListener('click', () => this.downloadOne(item));
            li.append(label, btn);
            if (item.downloaded) li.classList.add('done');
            return li;
        }));
        const chosen = this.chosen();
        const bytes = chosen.reduce((sum, i) => sum + i.size, 0);
        this.all.checked = this.items.length > 0 && chosen.length === this.items.length;
        this.pickedText.textContent = chosen.length ? '選了 ' + chosen.length + ' 段 · ' + sizeText(bytes) : '勾選要下載的段落';
        for (const b of [this.eachBtn, this.zipBtn, this.deleteBtn]) b.disabled = this.busy || !chosen.length;
    }

    chosen() {
        return this.items.filter(i => this.picked.has(i.id));
    }

    say(text) {
        this.status.textContent = text;
    }

    async downloadOne(item) {
        try {
            downloadBlob(item.name + '.json', await getRecordingFile(item.id));
            await markDownloaded([item.id]);
            this.say('已下載：' + item.name + '.json');
        } catch (err) {
            this.say('下載失敗：' + err.message);
        }
        await refreshAll();
    }

    // 勾選的一次下載（每一段還是一個檔案）
    async downloadEach() {
        const chosen = this.chosen();
        if (!chosen.length || this.busy) return;
        this.setBusy(true);
        const ok = [];
        for (const [i, item] of chosen.entries()) {
            this.say('下載中 ' + (i + 1) + '／' + chosen.length + '…');
            try {
                downloadBlob(item.name + '.json', await getRecordingFile(item.id));
                ok.push(item.id);
            } catch (err) { /* 這一段讀不到：跳過，最後告訴使用者 */ }
            if (i < chosen.length - 1) await wait(GAP_MS);
        }
        await markDownloaded(ok).catch(() => {});
        this.say(ok.length === chosen.length ? '已下載 ' + ok.length + ' 個檔案（瀏覽器問「允許下載多個檔案」時請按允許）'
            : '下載了 ' + ok.length + '／' + chosen.length + ' 個，有的讀不到');
        this.setBusy(false);
        await refreshAll();
    }

    // 勾選的壓縮成一個 zip（iPhone 只要按一次「下載」，檔案也小很多）
    async downloadZip() {
        const chosen = this.chosen();
        if (!chosen.length || this.busy) return;
        this.setBusy(true);
        try {
            const files = [];
            for (const item of chosen) files.push({ name: item.name + '.json', blob: await getRecordingFile(item.id), date: new Date(item.savedAt) });
            const zip = await makeZip(files, { onProgress: (n, total) => this.say('壓縮中 ' + n + '／' + total + '…') });
            const d = new Date();
            const pad = n => String(n).padStart(2, '0');
            downloadBlob('recordings_' + d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) + '_' + pad(d.getHours()) + pad(d.getMinutes()) + '.zip', zip);
            await markDownloaded(chosen.map(i => i.id));
            this.say('已下載 zip：' + chosen.length + ' 段，' + sizeText(zip.size) + '（壓縮前 ' + sizeText(chosen.reduce((s, i) => s + i.size, 0)) + '）');
        } catch (err) {
            this.say('壓縮失敗（可能是手機記憶體不夠）：改用「一次下載」或少選幾段');
        }
        this.setBusy(false);
        await refreshAll();
    }

    async remove() {
        const chosen = this.chosen();
        if (!chosen.length || this.busy) return;
        const fresh = chosen.filter(i => !i.downloaded).length;
        const ask = '刪除 ' + chosen.length + ' 段？' + (fresh ? '其中 ' + fresh + ' 段還沒下載過，刪了就找不回來。' : '');
        if (!confirm(ask)) return;
        try {
            await deleteRecordings(chosen.map(i => i.id));
            this.say('已刪除 ' + chosen.length + ' 段');
        } catch (err) {
            this.say('刪除失敗：' + err.message);
        }
        this.picked.clear();
        await refreshAll();
    }

    setBusy(on) {
        this.busy = on;
        this.render();
    }
}

// 所有清單一起更新（存了新的一段、別的清單下載或刪除了）
export function refreshAll() {
    return Promise.all(lists.map(l => l.refresh()));
}
