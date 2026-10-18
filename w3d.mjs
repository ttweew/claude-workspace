import { makeDemoRecording } from '/home/user/claude-workspace/js/data/synth.js';
import { parseRecording, analyzeRecording, WORLD_BONES, WORLD_KNEES, ANGLE_KEYS, VIEW_CODES } from '/home/user/claude-workspace/js/data/replay-core.js';
for (const yaw of [8, 45, 85]) for (const wn of [0, 0.03]) {
  const rec = makeDemoRecording({ yaw, worldNoise: wn });
  const p = parseRecording(JSON.stringify(rec));
  const r = await analyzeRecording(p, 640, 480);
  const med = (a, k, c) => { const v = []; for (let i = k; i < a.length; i += c) if (!isNaN(a[i])) v.push(a[i]); v.sort((x,y)=>x-y); return [v[v.length>>1]*100, (v[Math.floor(v.length*.9)]-v[Math.floor(v.length*.1)])*100, v.length]; };
  const out = WORLD_BONES.map(([k],j)=>k+' raw '+med(r.boneRaw,j,4).map(x=>x.toFixed(1)).join('/')+' st '+med(r.boneStable,j,4).map(x=>x.toFixed(1)).join('/'));
  // knee 3d vs truth: true knee from depths? compare to 2D side angles
  const A = ANGLE_KEYS.length;
  const kd = WORLD_KNEES.map(([key],j)=>{ const a=ANGLE_KEYS.indexOf(key); let sr=0,ss=0,n=0; for(let i=0;i<r.n;i++){ const ref=r.angles[i*A+a]; const x=r.knee3dRaw[i*2+j], y=r.knee3dStable[i*2+j]; if(!isNaN(ref)&&!isNaN(x)&&!isNaN(y)&&VIEW_CODES[r.view[i]]==='side'){sr+=Math.abs(x-ref);ss+=Math.abs(y-ref);n++;}} return key+' n'+n+' raw'+(sr/n).toFixed(1)+' st'+(ss/n).toFixed(1); });
  console.log('yaw',yaw,'noise',wn, r.hasWorld, '\n ', out.join('\n  '), '\n ', kd.join(' | '));
}
