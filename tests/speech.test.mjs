// 說話規則（js/ui/speech-plan.js）、語音模式的記憶（js/ui/voice.js）、計次準確率（js/analysis/session.js）、複製手機資訊（js/ui/phone-info.js）
import test from 'node:test';
import assert from 'node:assert/strict';
import { SpeechPlan, ErrorStreak, LastingError, speaks, spokenHint, repLine, VOICE_MODES, KINDS } from '../js/ui/speech-plan.js';
import { FORM_RULES } from '../js/analysis/form.js';
import { NO_PERSON } from '../js/analysis/framing.js';
import { LUNGE_CONFIG, PUSHUP_CONFIG, PLANK_CONFIG } from '../js/analysis/workouts.js';
import { SQUAT_CONFIG } from '../js/analysis/squat.js';
import { phoneReport } from '../js/ui/phone-info.js';

const store = new Map();
globalThis.localStorage = { getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) };
const { loadVoiceMode, saveVoiceMode } = await import('../js/ui/voice.js');
const { summarize, describe, saveSession, loadHistory, clearHistory, parseActual, countAccuracy, setActual, countsReps } = await import('../js/analysis/session.js');

// 假的講話：每句講 dur 毫秒；said 記下每一句和開始的時間
function fakeSpeaker(dur = 1000) {
    const sp = {
        said: [], until: -Infinity, now: 0,
        get busy() { return sp.now < sp.until; },
        speak(text) { sp.said.push([sp.now, text]); sp.until = sp.now + dur; return true; }
    };
    return sp;
}
function run(plan, sp, from, to, step = 50) {
    for (let t = from; t <= to; t += step) { sp.now = t; plan.tick(t); }
}

test('說話規則：一次一句；講話中排隊只留一句，比較重要的優先、一樣重要換成新的', () => {
    const sp = fakeSpeaker(1000), plan = new SpeechPlan(sp);
    sp.now = 0;
    plan.offer('count', '1 下', 0);                 // 沒在講話：馬上講
    plan.offer('count', '2 下', 100);               // 講話中：排隊
    plan.offer('count', '3 下', 200);               // 一樣重要：換成新的（2 下已經過時）
    plan.offer('setup', '請往後退', 300);            // 比較重要：換掉次數
    assert.equal(plan.offer('count', '4 下', 400), false);   // 比排隊中的不重要：不排
    run(plan, sp, 400, 3000);
    assert.deepEqual(sp.said.map(x => x[1]), ['1 下', '請往後退']);
    assert.equal(sp.said[1][0], 1000);              // 上一句講完才接著講，不插話
});

test('說話規則：過時的不講（次數 1.5 秒、倒數自己給的時間）', () => {
    const sp = fakeSpeaker(2500), plan = new SpeechPlan(sp);
    plan.offer('form', '胸口挺起來', 0);
    plan.offer('count', '3 下', 100);               // 要等 2.5 秒才輪到，超過 1.5 秒：過時了
    run(plan, sp, 100, 6000);
    assert.deepEqual(sp.said.map(x => x[1]), ['胸口挺起來']);
    // 倒數：每秒一個數字，每句講 0.5 秒，都來得及講
    const sp2 = fakeSpeaker(500), plan2 = new SpeechPlan(sp2);
    for (const [t, n] of [[0, '5'], [1000, '4'], [2000, '3']]) {
        run(plan2, sp2, t - 950, t - 50);
        sp2.now = t;
        plan2.offer('setup', n, t, 900);
    }
    assert.deepEqual(sp2.said.map(x => x[1]), ['5', '4', '3']);
    // 講得很慢（一句 1.5 秒）：「4」晚 0.5 秒才講（還沒過時）；「3」0.9 秒內輪不到，過時了不講
    const sp3 = fakeSpeaker(1500), plan3 = new SpeechPlan(sp3);
    for (const [t, n] of [[0, '5'], [1000, '4'], [2000, '3']]) {
        run(plan3, sp3, t - 950, t - 50);
        sp3.now = t;
        plan3.offer('setup', n, t, 900);
    }
    run(plan3, sp3, 2050, 5000);
    assert.deepEqual(sp3.said, [[0, '5'], [1500, '4']]);
    // 沒有內容、不認得的類別：不講
    assert.equal(plan2.offer('setup', '', 4000), false);
    assert.equal(plan2.offer('constructor', '亂來', 4000), false);
    assert.equal(plan2.offer('__proto__', '亂來', 4000), false);
});

test('說話規則：先講重要的（站位 ＞ 錯誤 ＞ 次數）；三種模式講哪些', () => {
    assert.ok(KINDS.setup > KINDS.form && KINDS.form > KINDS.count);
    assert.deepEqual(VOICE_MODES, ['full', 'errors', 'off']);
    for (const kind of Object.keys(KINDS)) assert.equal(speaks('full', kind), true);
    assert.deepEqual(Object.keys(KINDS).filter(k => speaks('errors', k)), ['form']);
    assert.deepEqual(Object.keys(KINDS).filter(k => speaks('off', k)), []);
    assert.equal(speaks('奇怪的模式', 'form'), false);
});

test('錯誤連續兩下才講；一直錯每 3 下再提醒；改好了重新算', () => {
    const s = new ErrorStreak();
    const said = [['lean'], ['lean'], ['lean', 'heel'], ['lean', 'heel'], ['lean'], [], ['lean'], ['lean']].map(ids => s.update(ids));
    // 第 1 下不講；第 2 下講 lean；第 3 下 heel 第一次；第 4 下 heel 連續第 2 下；第 5 下 lean 連續第 5 下再提醒；中斷後重新算
    assert.deepEqual(said, [[], ['lean'], [], ['heel'], ['lean'], [], [], ['lean']]);
    s.reset();
    assert.deepEqual(s.update(['lean']), []);
});

test('棒式：錯誤持續 2 秒才講，沒改每 8 秒再提醒；收起來重新算', () => {
    const e = new LastingError();
    const out = [];
    for (let t = 0; t <= 20000; t += 100) for (const id of e.update(t < 15000 ? ['sag'] : [], t)) out.push([id, t]);
    assert.deepEqual(out, [['sag', 2000], ['sag', 10000]]);
    assert.deepEqual(e.update(['sag'], 21000), []);       // 收起來之後重新出現：又要等 2 秒
    assert.deepEqual(e.update(['sag'], 23000), ['sag']);
});

test('運動中只講短句：站位提示換成短的；網站上每一句站位提示都講得出來', () => {
    assert.equal(spokenHint(NO_PERSON.text), '請站進畫面');
    assert.equal(spokenHint('已偵測到全身'), '站好了');
    for (const config of [SQUAT_CONFIG, LUNGE_CONFIG, PUSHUP_CONFIG, PLANK_CONFIG]) assert.equal(spokenHint(config.frontPrompt), '請側身');
    assert.equal(spokenHint('請側身對著鏡頭，正面拍膝蓋角度不準'), '請側身');
    assert.equal(spokenHint('看不到腳，請再往後退一點'), '看不到腳，請往後退');
    assert.equal(spokenHint('別的提示'), '別的提示');
    assert.equal(spokenHint(undefined), '');
    for (const text of ['太近了，請往後退，讓全身入鏡', '看不到肩膀，請調整鏡頭角度', '離太遠了，可以往前一點', '請站到畫面中間一點']) {
        assert.ok(spokenHint(text).length < text.length, text);
    }
});

test('一下做完講的那一句：次數＋最多一個提醒；只講錯誤；不講話', () => {
    assert.deepEqual(repLine('full', 3, 'good', []), { kind: 'count', text: '3 下' });
    assert.deepEqual(repLine('full', 3, 'close', []), { kind: 'count', text: '3 下，再低一點' });
    assert.deepEqual(repLine('full', 3, 'shallow', []), { kind: 'count', text: '3 下，太淺了' });
    assert.deepEqual(repLine('full', 3, 'close', ['胸口挺起來', '腳跟踩穩']), { kind: 'form', text: '3 下，胸口挺起來' });
    assert.deepEqual(repLine('full', 5, 'good', []), { kind: 'count', text: '5 下，很好' });
    assert.deepEqual(repLine('full', 5, 'close', []), { kind: 'count', text: '5 下，再低一點' });
    assert.deepEqual(repLine('errors', 3, 'close', []), null);
    assert.deepEqual(repLine('errors', 3, 'good', ['胸口挺起來']), { kind: 'form', text: '胸口挺起來' });
    assert.equal(repLine('off', 3, 'good', ['胸口挺起來']), null);
    // 每一種錯誤都有短句可以講（運動中只講短句）
    for (const rule of Object.values(FORM_RULES).flat()) assert.ok(rule.speech && rule.speech.length <= 10, rule.id);
});

test('語音模式：記住選擇；舊版關掉語音的設定變成「不講話」；被改過的值用預設', () => {
    store.clear();
    assert.equal(loadVoiceMode(), 'full');
    store.set('voiceOn', '0');
    assert.equal(loadVoiceMode(), 'off');
    saveVoiceMode('errors');
    assert.equal(loadVoiceMode(), 'errors');
    for (const bad of ['constructor', '__proto__', 'FULL', '']) {
        store.set('voiceMode', bad);
        store.delete('voiceOn');
        assert.equal(loadVoiceMode(), 'full', bad);
    }
});

test('計次準確率：填的字只收 0～999 的整數；準確率怎麼算', () => {
    assert.equal(parseActual('10'), 10);
    assert.equal(parseActual(' １２ '), 12);
    for (const bad of ['', ' ', '9.5', '-1', '1e3', '1000', 'abc', '0x10', null, undefined]) assert.equal(parseActual(bad), null, String(bad));
    assert.equal(countAccuracy(9, 10), 90);
    assert.equal(countAccuracy(11, 10), 90);
    assert.equal(countAccuracy(10, 10), 100);
    assert.equal(countAccuracy(30, 10), 0);       // 最低 0%
    assert.equal(countAccuracy(0, 0), 100);
    assert.equal(countAccuracy(2, 0), 0);
});

test('計次準確率：記到這一次的紀錄、總結多一行；棒式沒有；被改過的值不寫', () => {
    clearHistory();
    const rep = (min, depth) => ({ min, depth, errors: [], start: 0, end: 2 });
    const a = summarize('squat', [rep(85, 'good'), rep(88, 'good'), rep(95, 'close')], 1000, 61000);
    saveSession(a);
    const b = summarize('squat', [rep(85, 'good')], 2000, 62000);
    saveSession(b);
    assert.equal(countsReps(a), true);
    setActual(a, 4);
    const saved = loadHistory();
    assert.equal(saved[0].actual, 4);              // 用開始時間找到第一筆，第二筆不動
    assert.equal(saved[1].actual, undefined);
    assert.ok(describe(a).includes('你數的 4 下，網站算 3 下：計次準確率 75%'));
    for (const bad of [-1, 1.5, '4', 1000, null]) {
        assert.ok(!describe({ ...a, actual: bad }).some(l => l.startsWith('你數的')), String(bad));
    }
    const p = summarize('plank', [{ seconds: 30, errors: [] }], 0, 60000);
    assert.equal(countsReps(p), false);
    assert.ok(!describe({ ...p, actual: 1 }).some(l => l.startsWith('你數的')));
    assert.equal(countsReps({ workout: 'constructor' }), false);
    assert.equal(countsReps(null), false);
});

test('複製手機資訊：系統、螢幕、AI 速度；還沒量到、還沒開鏡頭時照樣寫得出來', () => {
    const text = phoneReport({
        time: new Date(2026, 9, 20, 9, 5), device: { os: 'Android', osVersion: '10', browser: 'Samsung Internet' },
        screen: { width: 412, height: 915, dpr: 2.625 }, ua: 'UA', compute: 'GPU', computeDetail: 'Mali-G76',
        model: 'lite', aiMs: 31.6, aiFps: 30, cameraFps: 30, cameraMax: 30, size: '640×480', fpsSetting: '自動，目前 30 格',
        luma: 120.4, wake: '螢幕保持亮著', baseline: { knee: 171, tilt: -6.54 }
    });
    assert.equal(text, ['【手機資訊】2026/10/20 9:05', '系統：Android 10 · 瀏覽器：Samsung Internet', '螢幕：412×915（像素密度 2.625）',
        '運算：GPU（Mali-G76）', 'AI 模型 lite · AI 每格 32 毫秒 · AI 每秒 30 格', '鏡頭：640×480 · 每秒 30 格（最多 30） · 設定：自動，目前 30 格',
        '畫面亮度 120 · 螢幕保持亮著 · 校正：站直膝 171°、手機傾斜 6.5°', '識別字串：UA'].join('\n'));
    const empty = phoneReport({ time: new Date(2026, 0, 1, 0, 0), device: {}, aiMs: null, luma: null });
    assert.match(empty, /AI 每格還在量/);
    assert.match(empty, /鏡頭：還沒開/);
    assert.match(empty, /瀏覽器：不明/);
});
