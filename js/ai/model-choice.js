// 骨架模型的選擇（自動調整的第 3 步）：lite、full 或 'auto'（自動），網站會記住；網址的 ?model= 優先，但不記住
// 自動：先用比較準的 full；開鏡頭量到這台裝置用 full 跟不上，就改用 lite 並記在這台裝置上，下次直接用 lite
// 選單再選一次「自動」會忘掉記住的結果，重新判斷
// 11/21 起也可以選 YOLO（'yolo-n'、'yolo-s'，實驗）：別家的模型，沒有腳跟、腳尖（js/ai/models.js 的能力表）
//   「自動」只在 MediaPipe 的兩個裡面選：換成 YOLO 會少掉腳跟離地的判斷，要使用者自己決定

import { MODEL_FROM_URL } from '../config.js';

export const MODEL_CHOICES = ['lite', 'full', 'auto', 'yolo-n', 'yolo-s'];
const CHOICE_KEY = 'poseModel';
const AUTO_KEY = 'autoModel';   // 自動判斷的結果（目前只會記 'lite'）

// 哪一家（11/24，選好動作之後的轉場畫面「用哪一個 AI」只選 MediaPipe 還是 YOLO，js/ui/model-pick.js、model-screen.js）：
// 大小（lite、full、自動；YOLO26n、26s）還是在「進階設定」選。每一家記住上次選的大小，換回來時用它
// （例如進階設定選了 full，在首頁改用 YOLO、再改回 MediaPipe：還是 full，不會變回 lite）
export const FAMILIES = ['mediapipe', 'yolo'];
const FAMILY_OF = { lite: 'mediapipe', full: 'mediapipe', auto: 'mediapipe', 'yolo-n': 'yolo', 'yolo-s': 'yolo' };
const FAMILY_FIRST = { mediapipe: 'lite', yolo: 'yolo-n' };   // 這一家還沒選過：各自最快的那個
const LAST_KEY = 'lastModel.';   // + 家：'lastModel.mediapipe'、'lastModel.yolo'

function read(key) {
    try {
        return localStorage.getItem(key);
    } catch (err) {
        return null;  // 不能讀就用預設
    }
}
function write(key, value) {
    try {
        if (value === null) localStorage.removeItem(key);
        else localStorage.setItem(key, value);
    } catch (err) {
        // 不能存就不記
    }
}

let choice = MODEL_FROM_URL || (MODEL_CHOICES.includes(read(CHOICE_KEY)) ? read(CHOICE_KEY) : 'lite');

// 使用者選的：'lite'、'full'、'auto'、'yolo-n' 或 'yolo-s'
export function getModelChoice() {
    return choice;
}
export function setModelChoice(value) {
    if (!MODEL_CHOICES.includes(value)) return;
    choice = value;
    write(CHOICE_KEY, value);
    write(LAST_KEY + FAMILY_OF[value], value);
    if (value === 'auto') write(AUTO_KEY, null);
}

// 選項是哪一家：'mediapipe'、'yolo'；不認得的（存的資料、網址被改過）回傳 ''，不會拿去查物件
export function familyOfChoice(value) {
    return MODEL_CHOICES.includes(value) ? FAMILY_OF[value] : '';
}
// 首頁選了這一家要用哪一個：現在就是這一家 → 不變；不然用這一家上次選的，沒選過用最快的；不認得的家回傳 null
export function choiceForFamily(family) {
    if (!FAMILIES.includes(family)) return null;
    if (familyOfChoice(choice) === family) return choice;
    const last = read(LAST_KEY + family);
    return familyOfChoice(last) === family ? last : FAMILY_FIRST[family];
}

// 自動判斷出這台裝置用 full 跟不上：記住，下次直接用 lite
export function rememberAutoModel(key) {
    write(AUTO_KEY, key);
}
// 自動時是不是用記住的結果（不是第一次判斷）
export function autoRemembered() {
    return choice === 'auto' && read(AUTO_KEY) === 'lite';
}

// 實際要用哪個模型：'lite'、'full'、'yolo-n' 或 'yolo-s'
export function modelToLoad() {
    if (choice !== 'auto') return choice;
    return read(AUTO_KEY) === 'lite' ? 'lite' : 'full';
}
