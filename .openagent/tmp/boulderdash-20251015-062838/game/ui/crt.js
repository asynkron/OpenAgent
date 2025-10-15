export function initCRTToggle(){
  const apply=(preset)=>{ document.documentElement.classList.remove('crt-subtle','crt-strong'); if(preset==='subtle') document.documentElement.classList.add('crt-subtle'); if(preset==='strong') document.documentElement.classList.add('crt-strong'); localStorage.setItem('crtPreset',preset); };
  let preset=localStorage.getItem('crtPreset')||'medium'; apply(preset);
  window.addEventListener('keydown',e=>{ if(e.key==='F1'){ preset=preset==='subtle'?'medium':'subtle'; apply(preset);} if(e.key==='F2'){ preset=preset==='strong'?'medium':'strong'; apply(preset);} });
}
