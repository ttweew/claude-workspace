// 光線偵測：每秒把鏡頭畫面縮成 32×24 小圖，算平均亮度；太暗時提醒使用者開燈
// 為什麼：光線暗時 AI 比較容易找不到人、點會亂跳；鏡頭也會拉長每一格的曝光時間，每秒格數跟著變少
//   （組員 10/13 用筆電測：選 60 格以上都卡在 30，光線暗時還會更少）
// 亮度用 0～255（和照片的灰階相同），用人眼對紅綠藍的敏感程度加權
// 門檻有緩衝：連續 3 秒低於 45 才提醒；回到 60 以上才收起來，在門檻附近不會一直閃

export const LIGHT = {
    darkBelow: 45,     // 平均亮度低於這個算太暗（一般室內開燈約 90～140，只開一盞小燈約 40～60）
    okAbove: 60,       // 提醒出現後，要回到這個以上才收起來
    darkSeconds: 3     // 連續幾秒太暗才提醒（開關燈、走過鏡頭前的一瞬間不算）
};

// 平均亮度（0～255）；data：getImageData 的 RGBA 陣列
export function averageLuma(data) {
    let sum = 0;
    const n = data.length / 4;
    for (let i = 0; i < data.length; i += 4) sum += 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    return n ? sum / n : 0;
}

export class LightMeter {
    constructor() {
        this.reset();
    }

    reset() {
        this.luma = null;
        this.darkCount = 0;
        this.dark = false;
    }

    // 每秒一次：這一秒的平均亮度；回傳現在是不是太暗
    update(luma) {
        this.luma = luma;
        if (this.dark) {
            if (luma >= LIGHT.okAbove) {
                this.dark = false;
                this.darkCount = 0;
            }
        } else if (luma < LIGHT.darkBelow) {
            this.darkCount++;
            if (this.darkCount >= LIGHT.darkSeconds) this.dark = true;
        } else {
            this.darkCount = 0;
        }
        return this.dark;
    }
}
