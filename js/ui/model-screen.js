// 選好動作之後的轉場畫面：「用哪一個 AI 看你做深蹲？」（11/24 使用者：不要像設定一樣放在首頁，做一個轉場的特效讓我們選模型）
// 首頁按了「深蹲」：那顆按鈕放大成整個畫面（clip-path 從按鈕的位置展開到全螢幕，約 0.4 秒），
// 裡面依序浮上來：深蹲的示範動畫（js/ui/demo.js）、MediaPipe／YOLO 兩張卡片（js/ui/model-pick.js）、白底的「開始深蹲」
// 「← 換動作」或 Esc：縮回按鈕現在的位置，焦點回到按的那顆按鈕
// 「開始深蹲」：main.js 按 #startBtn 開鏡頭；這一層先留著（寫「正在開啟鏡頭…」、打不開時寫原因），鏡頭畫面蓋上來時 main.js 直接收掉
// 系統設定「減少動態效果」時不展開、不浮上來，直接出現、直接收起（示範動畫也停在最低點）
// 打開時首頁和導覽列設成 inert（和鏡頭畫面 showStage 一樣）：鍵盤的 Tab 只在這一層裡面跑，螢幕閱讀器只念這一層

// 按鈕在這一層裡的位置 → 剪裁的起點（clip-path 的 inset：上、右、下、左各剪掉多少，四角圓角 12 像素，和首頁的按鈕一樣）
// 純函式（node 測試）：rect 是按鈕相對這一層左上角的位置（top、left、right、bottom）、width／height 是這一層的大小
// 按鈕有一部分在畫面外（捲動中）時夾在畫面裡；不是數字（量不到）時從畫面正中間展開
export function insetFrom(rect, width, height) {
    const ok = v => typeof v === 'number' && Number.isFinite(v);
    if (!rect || ![rect.top, rect.left, rect.right, rect.bottom, width, height].every(ok) || !(width > 0) || !(height > 0)) {
        return `inset(${Math.round(height / 2) || 0}px ${Math.round(width / 2) || 0}px round 12px)`;
    }
    const clamp = (v, max) => Math.min(Math.max(0, Math.round(v)), max);
    const top = clamp(rect.top, height), left = clamp(rect.left, width);
    const bottom = clamp(height - rect.bottom, height - top), right = clamp(width - rect.right, width - left);
    return `inset(${top}px ${right}px ${bottom}px ${left}px round 12px)`;
}

// 收起來的動畫多久沒結束就直接收（transitionend 沒有來：分頁在背景、瀏覽器不支援 clip-path 動畫）：比 CSS 收起來的 0.3 秒長一點
const CLOSE_FALLBACK_MS = 600;

// root：整個畫面（role="dialog"，一開始 hidden）；back：「← 換動作」；go：「開始」；onGo()：按了「開始」
// focusTarget()：打開時焦點放哪裡（main.js：選了的那張卡片的圓點）；setInert(on)：首頁、導覽列要不要 inert
// onOpen()／onClose()：打開、收起時（main.js 填字、開始和停止示範動畫）
// 回傳 { open(from), close({ instant }), isOpen() }：from 是按的那顆按鈕；instant 不播收起來的動畫（鏡頭畫面已經蓋上來了）
export function setupModelScreen({ root, back, go, onGo, focusTarget, setInert, onOpen, onClose }) {
    let origin = null;      // 從哪一顆按鈕打開的（收起時縮回去、焦點回去）
    let frame = 0;          // 下一格才加 open（展開的動畫）
    let closing = null;     // 收起來的動畫還在跑：{ timer, done }
    const reduceMotion = () => !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

    // 剪裁的起點設成按鈕現在的位置（打開時、收起前各量一次：中間首頁可能捲動過）
    // 這一層是 position: fixed; inset: 0，大小就是畫面（不含捲軸），左上角就是按鈕位置的原點；不量這一層本身：
    // 打開時要在顯示這一層之前量（顯示之後才設，瀏覽器會先用舊的起點畫一次，動畫就從畫面正中間開始；11/24 放慢 10 倍的截圖抓到的）
    function aimAt(button) {
        const r = button && button.isConnected && button.getBoundingClientRect ? button.getBoundingClientRect() : null;
        const view = document.documentElement;
        root.style.setProperty('--ms-from', insetFrom(r && r.width > 0 ? r : null, view.clientWidth, view.clientHeight));
    }

    function finishClose(refocus) {
        if (closing) {
            clearTimeout(closing.timer);
            root.removeEventListener('transitionend', closing.done);
            closing = null;
        }
        cancelAnimationFrame(frame);
        root.hidden = true;
        root.classList.remove('open', 'closing');
        setInert(false);
        if (onClose) onClose();
        if (refocus && origin && origin.isConnected && !origin.disabled && !origin.hidden) origin.focus();
        origin = null;
    }

    function open(from) {
        if (!root.hidden && !closing) return;
        if (closing) finishClose(false);
        origin = from || null;
        aimAt(origin);
        root.classList.remove('open');
        root.hidden = false;
        root.scrollTop = 0;
        setInert(true);
        if (onOpen) onOpen();
        if (reduceMotion()) {
            root.classList.add('open');
        } else {
            // 先畫一次剪成按鈕大小的樣子（讀 offsetWidth 讓瀏覽器先算好），下一格再加 open 才會有展開的動畫
            void root.offsetWidth;
            frame = requestAnimationFrame(() => root.classList.add('open'));
        }
        const target = focusTarget && focusTarget();
        (target || back).focus({ preventScroll: true });
    }

    function close({ instant = false } = {}) {
        if (root.hidden || closing) return;
        cancelAnimationFrame(frame);
        // 還沒開始展開（剛按就按 Esc）：沒有東西可以縮，直接收
        if (instant || reduceMotion() || !root.classList.contains('open')) {
            finishClose(!instant);
            return;
        }
        aimAt(origin);
        root.classList.remove('open');
        root.classList.add('closing');
        const done = event => {
            if (event && (event.target !== root || event.propertyName !== 'clip-path')) return;
            finishClose(true);
        };
        closing = { done, timer: setTimeout(done, CLOSE_FALLBACK_MS) };
        root.addEventListener('transitionend', done);
    }

    back.addEventListener('click', () => close());
    // 開鏡頭要在按的這一下裡面（瀏覽器規定要使用者按了才能出聲、開鏡頭）
    go.addEventListener('click', () => onGo());
    // Esc 聽整頁（不是只聽這一層）：點了畫面上的空白處，焦點會跑到最外層的 <body>，按 Esc 也要收得起來
    document.addEventListener('keydown', event => {
        if (event.key === 'Escape' && !root.hidden && !closing) {
            event.preventDefault();
            close();
        }
    });

    return { open, close, isOpen: () => !root.hidden && !closing };
}
