export function createAudio() {
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  const ctx = new AudioCtx();
  const master = ctx.createGain(); master.gain.value = 0.08; master.connect(ctx.destination);

  let unlocked = false;
  const unlock = () => { if (!unlocked) { const b = ctx.createBuffer(1,1,22050); const s = ctx.createBufferSource(); s.buffer = b; s.connect(master); s.start(0); unlocked = true; }};
  window.addEventListener('pointerdown', unlock, { once: true });

  function beep(freq=440, dur=0.08, type='square', vol=0.25) {
    const o = ctx.createOscillator(); const g = ctx.createGain();
    o.type = type; o.frequency.value = freq; o.connect(g); g.connect(master);
    g.gain.setValueAtTime(0, ctx.currentTime);
    g.gain.linearRampToValueAtTime(vol, ctx.currentTime+0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
    o.start(); o.stop(ctx.currentTime + dur + 0.02);
  }

  return {
    collect(){ beep(880, 0.09, 'square', 0.2); beep(1320, 0.06, 'square', 0.15); },
    push(){ beep(220, 0.04, 'triangle', 0.12); },
    exitOpen(){ beep(660, 0.12, 'square', 0.2); setTimeout(()=>beep(990, 0.12, 'square', 0.2), 80); },
    win(){ beep(523.25, 0.12); setTimeout(()=>beep(659.25, 0.12), 120); setTimeout(()=>beep(783.99, 0.2), 240); },
    die(){ beep(220, 0.25, 'sawtooth', 0.22); },
  };
}
