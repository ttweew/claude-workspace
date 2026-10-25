// 錄製檔（10/20）的首頁那一列、鏡頭畫面的清單、每一段停止後存進錄製檔（10/25 從 main.js 搬出來，行為不變）
// 每一段停止後存進這支手機的「錄製檔」（js/data/library.js），像相簿一樣最後再下載；不上傳雲端也留得住
// 清單首頁一份、鏡頭畫面一份（js/ui/library-list.js），內容一樣
import { libraryAvailable, saveRecording, markDownloaded, sizeText } from '../data/library.js';
import { LibraryList, refreshAll as refreshLibraries } from './library-list.js';
import { buildFile, downloadBlob, recordingName } from '../data/recorder.js';
import { testFileName } from '../data/test-mode.js';

const $ = id => document.getElementById(id);

// recBar：錄影控制列（js/ui/rec-bar.js，左邊「錄製檔 N」、存好時的小字）；testBar：實測控制列（js/ui/test-bar.js）
// recordSaved：數據面板「存進錄製檔中…」那一行；clock(seconds)：「0:42」
// onAvailable(ok)：知道這個瀏覽器能不能存錄製檔之後（main.js 改錄製按鈕的字）
// 回傳 { ok（能不能存）, open(on, opener), hide(), keep(recorder, set, reps, autoDownload) }
export function setupLibraryPanel({ recBar, testBar, recordSaved, clock, onAvailable }) {
    const galleryPanel = $('galleryPanel');
    const galleryOpen = $('galleryOpen');
    const libraryBox = $('libraryBox');
    const librarySummary = $('librarySummary');
    let ok = false;        // 這個瀏覽器能不能存錄製檔（打得開 IndexedDB）
    let count = 0;
    let opener = null;     // 打開清單的按鈕（錄影控制列的「錄製檔」或數據面板的「看錄製檔」）：關掉清單時回到這裡

    function changed(items) {
        count = items.length;
        recBar.setCount(items.length);
        galleryOpen.hidden = !items.length;
        galleryOpen.textContent = '看錄製檔（' + items.length + '）';
        libraryBox.hidden = !items.length;
        const bytes = items.reduce((sum, i) => sum + i.size, 0);
        const fresh = items.filter(i => !i.downloaded).length;
        libraryBox.classList.toggle('attn', fresh > 0);   // 有還沒下載的：整列變黃（清除瀏覽器資料就會不見）
        // 標題「錄製檔」一行、下面一行小字寫幾段、多大、幾段還沒下載（10/21：以前擠在一行，手機上斷在奇怪的地方）
        const name = document.createElement('span');
        const info = document.createElement('small');
        info.textContent = items.length + ' 段 · ' + sizeText(bytes) + (fresh ? ' · ' + fresh + ' 段還沒下載' : ' · 都下載過了');
        name.append('錄製檔', info);
        librarySummary.replaceChildren(name);
    }
    new LibraryList($('homeLibrary'), changed);
    new LibraryList($('galleryList'), changed);

    // from：從哪個按鈕打開（Safari 按按鈕不會把焦點移過去，所以直接傳進來）
    function open(on, from = null) {
        galleryPanel.hidden = !on;
        if (on) {
            opener = from;
            refreshLibraries();
            $('galleryClose').focus();
        } else if (opener && opener.isConnected && opener.offsetParent) {
            opener.focus();
        }
    }
    $('galleryClose').addEventListener('click', () => open(false));
    // 數據面板裡也能打開錄製檔清單（10/20 使用者問「要按哪裡看到所有的檔案」：數據面板開著時錄影控制列是藏起來的）
    galleryOpen.addEventListener('click', () => open(true, galleryOpen));

    libraryAvailable().then(yes => {
        ok = yes;
        onAvailable(yes);
        if (yes) refreshLibraries();
    });

    // 停止錄製後（main.js 的 stopRecording）：這一段存進錄製檔；實測的一組照設定也馬上下載（存不了就直接下載，不會不見）
    // 一定要在 stopRecording 裡馬上呼叫：jsonChunks 一開始就記住這一段的資料，之後開始錄下一段也不會混在一起
    // set：實測的一組（沒有是 null）；reps：網站算了幾下（寫在實測控制列上）；autoDownload：實測模式「每組做完也馬上下載」
    async function keep(recorder, set, reps, autoDownload) {
        const meta = recorder.meta, frames = recorder.frameCount, seconds = recorder.seconds;
        const name = testFileName(meta) || recordingName(meta);
        if (!frames) {
            if (set) testBar.cancel('沒有錄到畫面，這組再錄一次');
            return;
        }
        recordSaved.textContent = '存進錄製檔中…';
        let blob;
        try {
            blob = await buildFile(recorder.jsonChunks(), 'application/json');
        } catch (err) {
            console.error(err);
            recordSaved.textContent = '存不下來（可能是手機記憶體不夠）';
            if (set) testBar.failed(set.condition);
            return;
        }
        let id = null;
        if (ok) {
            try {
                id = await saveRecording({ name, meta, seconds, frames, blob });
            } catch (err) {
                console.warn('存不進錄製檔：', err);
            }
        }
        const download = set && (!id || autoDownload);
        if (download) {
            downloadBlob(name + '.json', blob);
            if (id) await markDownloaded([id]).catch(() => {});
        }
        await refreshLibraries();
        if (id) {
            recordSaved.textContent = '已存進錄製檔（共 ' + count + ' 段，按「看錄製檔」下載）';
            recBar.say('已存好第 ' + count + ' 段（' + clock(seconds) + '）');
        } else {
            recordSaved.textContent = download ? '這個瀏覽器不能存錄製檔：已直接下載' : '這個瀏覽器不能存錄製檔：請按「下載 JSON」';
            recBar.say(recordSaved.textContent);
        }
        if (set) testBar.saved(set.condition, name + '.json', reps, id ? (download ? '已存好、已下載' : '已存好') : '已下載');
    }

    return {
        get ok() { return ok; },
        open,
        hide() { galleryPanel.hidden = true; },
        keep
    };
}
