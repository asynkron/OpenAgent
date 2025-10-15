export function showLevelSelector(levels,onPick){
  const div=document.createElement('div'); div.id='level-selector'; div.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.85);color:#fff;display:flex;align-items:center;justify-content:center;';
  const panel=document.createElement('div'); panel.style.cssText='padding:16px;background:#111;border:1px solid #333;max-width:480px;width:90%';
  const h=document.createElement('h3'); h.textContent='Select Cave'; panel.appendChild(h);
  levels.forEach((lv,i)=>{ const b=document.createElement('button'); b.textContent=`${i+1}. ${lv.name}`; b.style.display='block'; b.style.margin='6px 0'; b.onclick=()=>{ document.body.removeChild(div); onPick(i); }; panel.appendChild(b); });
  div.appendChild(panel); document.body.appendChild(div);
}
