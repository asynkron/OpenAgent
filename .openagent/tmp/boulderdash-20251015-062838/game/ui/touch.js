export function attachDPad(onDir){
  const d=document.createElement('div'); d.id='dpad'; d.style.cssText='position:fixed;left:10px;bottom:10px;opacity:.8;';
  const mk=(t,dx,dy)=>{ const b=document.createElement('button'); b.textContent=t; b.style.margin='4px'; let iv=null; const start=()=>{ onDir(dx,dy); iv=setInterval(()=>onDir(dx,dy),150); }; const stop=()=>{ if(iv){clearInterval(iv); iv=null;} }; b.onmousedown=start; b.onmouseup=stop; b.ontouchstart=(e)=>{e.preventDefault();start();}; b.ontouchend=(e)=>{e.preventDefault();stop();}; return b; };
  const wrap=document.createElement('div'); wrap.appendChild(mk('↑',0,-1)); wrap.appendChild(document.createElement('br')); wrap.appendChild(mk('←',-1,0)); wrap.appendChild(mk('→',1,0)); wrap.appendChild(document.createElement('br')); wrap.appendChild(mk('↓',0,1));
  d.appendChild(wrap); document.body.appendChild(d);
}
