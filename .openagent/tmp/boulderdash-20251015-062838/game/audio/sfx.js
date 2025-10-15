const ctx = new (window.AudioContext||window.webkitAudioContext)();
function burst(freq, dur, type='square', gain=0.05){ const o=ctx.createOscillator(); const g=ctx.createGain(); o.type=type; o.frequency.value=freq; g.gain.value=gain; o.connect(g).connect(ctx.destination); o.start(); o.stop(ctx.currentTime+dur); }
export function sfxExplosion(){ burst(120,0.12,'square',0.07); }
export function sfxButterSparkle(){ burst(660,0.08,'sine',0.05); setTimeout(()=>burst(880,0.08,'sine',0.04),60); }
export function sfxMagicActivate(){ burst(440,0.2,'sawtooth',0.04); }
export function unlockAudio(){ if(ctx.state==='suspended') ctx.resume(); }
