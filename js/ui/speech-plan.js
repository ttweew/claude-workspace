// 說話規則（10/20）：什麼時候講、講哪一句。這個檔案只決定要講什麼，真正發出聲音的是 js/ui/voice.js
//
// 使用者 10/19 決定把嗶聲改成講話（老師希望多加 AI）。規則：
//   1. 一次一句：正在講話時不插話；新的話排隊，只排一句（最重要、最新的那句）
//   2. 過時的不講：排隊太久就丟掉（站位、錯誤 3 秒，次數 1.5 秒，倒數 0.9 秒）。例如已經做到下一下，上一下的次數就不用講了
//   3. 先講重要的：站位（看不到人、請往後退、倒數）＞ 動作錯誤 ＞ 次數（鼓勵併在次數那句：「5 下，很好」）
//   4. 同一種錯誤連續兩下才講（ErrorStreak）：偶爾一下沒做好不用唸；一直錯就每 3 下再提醒一次
//      棒式沒有「一下」：錯誤持續 2 秒才講，一直沒改每 8 秒再提醒（LastingError）
//   5. 在一下做完的空檔講：計次的動作，錯誤和次數都等這一下做完才講（做到一半不插話）
//   6. 運動中只講短句：畫面上的長句換成短的（spokenHint），一下做完只講「3 下」加一個提醒
// 使用者可以選三種模式（首頁「語音提示」）：完整、只講錯誤、不講話；不用講的就照舊嗶聲
// 自訂目標（10/25，js/analysis/goal.js）：倒數「5、4、3、2、1」、「時間到」、「完成目標」是 goal 這一類，
//   比動作錯誤重要（最後 5 秒不要被「收緊腹部」打斷），只講錯誤時也講；棒式每 10 秒報時是 count（完整才講）
// 疲勞提醒（10/28，js/analysis/fatigue.js）：越來越淺時講一次「越來越淺了」，和動作錯誤一樣（form），這一下沒有錯誤才講

export const VOICE_MODES = ['full', 'errors', 'off'];
export const VOICE_MODE_NAMES = { full: '完整', errors: '只講錯誤', off: '不講話' };

// 數字越大越重要
export const KINDS = { setup: 3, goal: 2.5, form: 2, count: 1 };
// 排隊多久還沒講就不講了（毫秒）
const LIFE = { setup: 3000, goal: 3000, form: 3000, count: 1500 };

// 這個模式講不講這一類：只講錯誤時，站位和錄製倒數改用嗶聲、次數不講，目標的提醒照講；不講話時全部用嗶聲
export function speaks(mode, kind) {
    return mode === 'full' || (mode === 'errors' && (kind === 'form' || kind === 'goal'));
}

export class SpeechPlan {
    // speaker：{ busy（正在講話）, speak(text)（開始講，成功回傳 true） }，就是 js/ui/voice.js 的 Voice
    constructor(speaker) {
        this.speaker = speaker;
        this.pending = null;   // 排隊中的那一句：{ kind, text, until }
    }

    // 提出一句話；kind 是 KINDS 的其中一類，now 是毫秒，life 可以改排隊多久會過時（倒數每秒一個數字，0.9 秒內沒講就不講）
    // 回傳 true：已經講了或排進隊伍
    offer(kind, text, now, life = LIFE[kind]) {
        if (!text || !Object.prototype.hasOwnProperty.call(KINDS, kind)) return false;
        // 只排一句：比較重要的優先；一樣重要時換成新的（舊的那句已經過時了）
        if (this.pending && this.pending.until >= now && KINDS[kind] < KINDS[this.pending.kind]) return false;
        this.pending = { kind, text, until: now + life };
        this.tick(now);
        return true;
    }

    // 每一格、每講完一句都呼叫：沒在講話就講排隊的那句；過時的丟掉
    tick(now) {
        const item = this.pending;
        if (!item) return;
        if (now > item.until) {
            this.pending = null;
            return;
        }
        if (this.speaker.busy) return;
        this.pending = null;
        this.speaker.speak(item.text);
    }

    // 關鏡頭、換動作：排隊的不講了
    clear() {
        this.pending = null;
    }
}

// 計次的動作：同一種錯誤連續兩下才講；一直錯就每 3 下再提醒一次（連續第 2、5、8…下），改好了重新算
export class ErrorStreak {
    constructor() {
        this.count = new Map();
    }

    reset() {
        this.count.clear();
    }

    // ids：這一下出現過的錯誤代號；回傳這一下做完要講的錯誤（照 ids 的順序）
    update(ids) {
        const next = new Map();
        for (const id of ids) next.set(id, (this.count.get(id) || 0) + 1);
        this.count = next;
        return [...next.keys()].filter(id => (next.get(id) - 2) % 3 === 0);
    }
}

// 棒式（計時）：錯誤持續 firstMs 才講，一直沒改每 repeatMs 再提醒一次；紅字收起來就重新算
// 紅字本來就要持續 0.4 秒才出現、恢復 0.6 秒才收起（js/analysis/form.js），偵測跳一下不會重新算
export class LastingError {
    constructor(firstMs = 2000, repeatMs = 8000) {
        this.firstMs = firstMs;
        this.repeatMs = repeatMs;
        this.reset();
    }

    reset() {
        this.since = new Map();   // 每種錯誤從什麼時候開始
        this.said = new Map();    // 上次講的時間
    }

    // ids：這一格畫面上的錯誤；now：毫秒；回傳現在要講的錯誤
    update(ids, now) {
        for (const id of [...this.since.keys()]) {
            if (!ids.includes(id)) {
                this.since.delete(id);
                this.said.delete(id);
            }
        }
        const out = [];
        for (const id of ids) {
            if (!this.since.has(id)) this.since.set(id, now);
            const last = this.said.get(id);
            if (last === undefined ? now - this.since.get(id) >= this.firstMs : now - last >= this.repeatMs) {
                this.said.set(id, now);
                out.push(id);
            }
        }
        return out;
    }
}

// 站位提示唸短一點：人在 2～3 公尺外運動，長句子聽到一半就換下一句了
// 沒有列在這裡的提示本來就很短，照唸
const SPOKEN = new Map([
    ['未偵測到人體，請站進畫面', '請站進畫面'],
    ['太近了，請往後退，讓全身入鏡', '太近了，請往後退'],
    ['看不到腳，請再往後退一點', '看不到腳，請往後退'],
    ['看不到肩膀，請調整鏡頭角度', '看不到肩膀，請調整鏡頭'],
    ['離太遠了，可以往前一點', '太遠了，往前一點'],
    ['請站到畫面中間一點', '請站到中間'],
    ['已偵測到全身', '站好了']
]);
export function spokenHint(text) {
    if (typeof text !== 'string') return '';
    if (SPOKEN.has(text)) return SPOKEN.get(text);
    // 「請側身對著鏡頭，正面拍膝蓋角度不準」這類：後半句是原因，畫面上看得到，唸前半就好
    if (text.startsWith('請側身')) return '請側身';
    return text;
}

// 一下做完要講的那一句：{ kind, text }，不用講時回傳 null
//   n：第幾下；depth：'good'、'close'、'shallow'；errorWords：這一下要講的錯誤短句（ErrorStreak 選出來的）
//   完整：「3 下」＋最多一個提醒（錯誤 ＞ 蹲不夠深）；每 5 下、這一下又做得好時加「很好」
//   只講錯誤：只講錯誤那句
export function repLine(mode, n, depth, errorWords) {
    const error = errorWords.length ? errorWords[0] : '';
    if (mode === 'errors') return error ? { kind: 'form', text: error } : null;
    if (mode !== 'full') return null;
    const count = n + ' 下';
    if (error) return { kind: 'form', text: count + '，' + error };
    if (depth === 'close') return { kind: 'count', text: count + '，再低一點' };
    if (depth === 'shallow') return { kind: 'count', text: count + '，太淺了' };
    return { kind: 'count', text: n % 5 === 0 ? count + '，很好' : count };
}
