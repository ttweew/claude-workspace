// 首頁「語音提示」三選一（10/19 從進階設定拿出來；10/22 從 main.js 搬出來）
// 三種模式（js/ui/speech-plan.js）：完整（站位、倒數、錯誤、次數都用講的）、只講錯誤、不講話（全部用嗶聲）
// 選了就記住（js/ui/voice.js）；瀏覽器不能講話時三個都鎖住，說明只有嗶聲
import { saveVoiceMode } from './voice.js';
import { VOICE_MODES } from './speech-plan.js';

// mode：目前的模式；supported：這個瀏覽器能不能講話；onChange(mode)：換了模式（main.js 改用新的模式、不講話時停掉正在講的）
export function setupVoicePick(mode, supported, onChange) {
    const pick = document.getElementById('voicePick');
    for (const input of pick.querySelectorAll('input[name="voiceMode"]')) {
        input.checked = input.value === mode;
        input.disabled = !supported;
        input.addEventListener('change', () => {
            // 網頁上的值可能被改過：只認得清單裡的
            if (!input.checked || !VOICE_MODES.includes(input.value)) return;
            saveVoiceMode(input.value);
            onChange(input.value);
        });
    }
    if (!supported) document.getElementById('voiceNote').textContent = '這個瀏覽器不能講話，提示只有嗶聲';
}
