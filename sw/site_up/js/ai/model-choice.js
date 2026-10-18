// 骨架模型的選擇（自動調整的第 3 步）：lite、full 或 'auto'（自動），網站會記住；網址的 ?model= 優先，但不記住
// 自動：先用比較準的 full；開鏡頭量到這台裝置用 full 跟不上，就改用 lite 並記在這台裝置上，下次直接用 lite
// 選單再選一次「自動」會忘掉記住的結果，重新判斷

import { MODEL_FROM_URL } from '../config.js';

export const MODEL_CHOICES = ['lite', 'full', 'auto'];
const CHOICE_KEY = 'poseModel';
const AUTO_KEY = 'autoModel';   // 自動判斷的結果（目前只會記 'lite'）

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

// 使用者選的：'lite'、'full' 或 'auto'
export function getModelChoice() {
    return choice;
}
export function setModelChoice(value) {
    if (!MODEL_CHOICES.includes(value)) return;
    choice = value;
    write(CHOICE_KEY, value);
    if (value === 'auto') write(AUTO_KEY, null);
}

// 自動判斷出這台裝置用 full 跟不上：記住，下次直接用 lite
export function rememberAutoModel(key) {
    write(AUTO_KEY, key);
}
// 自動時是不是用記住的結果（不是第一次判斷）
export function autoRemembered() {
    return choice === 'auto' && read(AUTO_KEY) === 'lite';
}

// 實際要用哪個模型：'lite' 或 'full'
export function modelToLoad() {
    if (choice !== 'auto') return choice;
    return read(AUTO_KEY) === 'lite' ? 'lite' : 'full';
}
