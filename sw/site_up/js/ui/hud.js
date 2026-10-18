// 大字儀表板：站在 2～3 公尺外運動時，關節旁的小字看不清楚，改用大數字顯示
// 左、右兩組都顯示（左膝、左髖／右膝、右髖），照鏡子的方式放在畫面左右兩邊（老師 10/12 回饋）：
//   前鏡頭的畫面有鏡像，本人的左邊出現在畫面左邊，所以左側那組放左邊；
//   後鏡頭（請別人拍）沒有鏡像，本人的左邊在畫面右邊，兩組對調，數字永遠跟在身體同一邊
// 看不到的一側顯示「—」，不顯示猜出來的數字
// 側面拍時，離鏡頭遠的那一側常被身體擋住、數字比較不可靠：看得明顯比較不清楚的那一組變淡
// 顯示哪兩個關節跟著運動模式換（js/analysis/workouts.js）：深蹲、弓箭步是膝、髖，伏地挺身是肘、髖，棒式是髖、膝

import { P } from '../skeleton/landmarks.js';

// 兩側看得清楚的程度（肩、髖、膝、踝的可信度加總，最多 4）差這麼多，比較不清楚的那一組才變淡；
// 差距小於 DIM_OFF 才恢復，在門檻附近不會一直閃（和 clearerSide 換邊的門檻 0.4 相同）
const DIM_ON = 0.4;
const DIM_OFF = 0.25;

const score = (landmarks, side) => ['SHOULDER', 'HIP', 'KNEE', 'ANKLE']
    .reduce((sum, k) => sum + (landmarks[P[side + '_' + k]].visibility || 0), 0);

const JOINT_NAMES = { KNEE: '膝', HIP: '髖', ELBOW: '肘' };

export class Hud {
    // root：#hud；裡面兩個 .hud-side，第一個在畫面左邊、第二個在畫面右邊
    // 每個 .hud-side 前兩格 .metric 是兩個關節（預設膝、髖），各有 .metric-label 和 .metric-value
    // 四個角度都算不出來時（例如太近、看不到腳）整個收起來
    constructor(root) {
        this.root = root;
        this.boxes = [...root.querySelectorAll('.hud-side')].map(box => {
            const [first, second] = box.querySelectorAll('.metric');
            return {
                box,
                firstName: first.querySelector('.metric-label'), first: first.querySelector('.metric-value'),
                secondName: second.querySelector('.metric-label'), second: second.querySelector('.metric-value')
            };
        });
        this.joints = ['KNEE', 'HIP'];
        this.mirrored = true;
        this.reset();
    }

    // 要顯示的兩個關節，例如 ['ELBOW', 'HIP']
    setJoints(joints) {
        this.joints = joints;
        this.show(null);
    }

    reset() {
        this.dim = null;
        this.show(null);
    }

    // 鏡頭有沒有鏡像（main.js 開鏡頭時決定）：前鏡頭有、後鏡頭沒有
    setMirrored(mirrored) {
        this.mirrored = mirrored;
        this.show(null);
    }

    // landmarks：平滑後的 33 點；angles：computeAngles 的結果。沒有偵測到人時傳 null
    update(landmarks, angles) {
        if (!landmarks) {
            this.dim = null;
            this.show(null);
            return;
        }
        const diff = score(landmarks, 'LEFT') - score(landmarks, 'RIGHT');
        if (Math.abs(diff) >= DIM_ON) this.dim = diff > 0 ? 'RIGHT' : 'LEFT';
        else if (Math.abs(diff) < DIM_OFF) this.dim = null;
        this.show(angles);
    }

    show(angles) {
        const text = key => (angles && angles[key] !== null && angles[key] !== undefined ? Math.round(angles[key]) + '°' : '—');
        // 畫面左邊那組：有鏡像時是本人的左側，沒有鏡像時是右側
        const sides = this.mirrored ? ['LEFT', 'RIGHT'] : ['RIGHT', 'LEFT'];
        const [a, b] = this.joints;
        this.boxes.forEach((els, i) => {
            const side = sides[i];
            const name = side === 'LEFT' ? '左' : '右';
            // 名稱直接帶左右（左膝、右髖），比另外一個「左側」小標籤好認
            setText(els.firstName, name + JOINT_NAMES[a]);
            setText(els.secondName, name + JOINT_NAMES[b]);
            setText(els.first, text(side + '_' + a));
            setText(els.second, text(side + '_' + b));
            if (els.box.dataset.side !== side) els.box.dataset.side = side;
            const dim = this.dim === side;
            if (els.box.classList.contains('dim') !== dim) els.box.classList.toggle('dim', dim);
        });
        const empty = !angles || ['LEFT_' + a, 'LEFT_' + b, 'RIGHT_' + a, 'RIGHT_' + b].every(k => angles[k] === null || angles[k] === undefined);
        if (this.root.classList.contains('empty') !== empty) this.root.classList.toggle('empty', empty);
    }
}

// 內容有變才更新，比較省電
function setText(el, text) {
    if (el.textContent !== text) el.textContent = text;
}
