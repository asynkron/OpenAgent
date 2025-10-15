import { TILE } from './world.js';

function mkCanvas(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; const ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = false; draw(ctx, w, h); return c;
}

function shade(ctx, w, h, color) {
  const g = ctx.createLinearGradient(0,0,w,h);
  g.addColorStop(0, color);
  g.addColorStop(1, 'black');
  ctx.fillStyle = g; ctx.fillRect(0,0,w,h);
}

function brick(ctx, w, h) {
  ctx.fillStyle = '#6e6e6e'; ctx.fillRect(0,0,w,h);
  ctx.fillStyle = '#515151';
  for (let y=0;y<h;y+=6) for (let x=((y/6)%2)*4;x<w;x+=8) ctx.fillRect(x,y,6,2);
}

function steel(ctx, w, h) {
  ctx.fillStyle = '#1a1f2b'; ctx.fillRect(0,0,w,h);
  ctx.strokeStyle = '#334'; ctx.lineWidth = 1;
  ctx.strokeRect(0.5,0.5,w-1,h-1);
  ctx.strokeStyle = '#99a'; ctx.globalAlpha = 0.15; ctx.beginPath(); ctx.moveTo(0,0); ctx.lineTo(w,h); ctx.moveTo(w,0); ctx.lineTo(0,h); ctx.stroke(); ctx.globalAlpha = 1.0;
}

function dirt(ctx, w, h) {
  ctx.fillStyle = '#3b2b17'; ctx.fillRect(0,0,w,h);
  ctx.fillStyle = '#5a4325';
  for (let i=0;i<40;i++) { const x = Math.random()*w|0; const y = Math.random()*h|0; ctx.fillRect(x,y,1,1); }
  ctx.globalAlpha = 0.2; ctx.fillStyle = '#a87a3a'; for (let i=0;i<12;i++){ const x=Math.random()*w|0, y=Math.random()*h|0; ctx.fillRect(x,y,1,1);} ctx.globalAlpha = 1;
}

function boulder(ctx, w, h) {
  ctx.fillStyle = '#999'; ctx.beginPath(); ctx.arc(w/2, h/2, w*0.45, 0, Math.PI*2); ctx.fill();
  ctx.fillStyle = '#666'; ctx.beginPath(); ctx.arc(w/2+1, h/2+1, w*0.45, 0, Math.PI*2); ctx.fill();
  ctx.fillStyle = '#ccc'; ctx.fillRect(w*0.55, h*0.28, 2, 2);
}

function gem(ctx, w, h, hue) {
  const c = `hsl(${hue},85%,60%)`;
  ctx.fillStyle = c;
  ctx.beginPath(); ctx.moveTo(w/2,2); ctx.lineTo(w-3,h/2); ctx.lineTo(w/2,h-2); ctx.lineTo(3,h/2); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 1; ctx.stroke();
}

function exitClosed(ctx, w, h) {
  ctx.fillStyle = '#1a1f2b'; ctx.fillRect(0,0,w,h);
  ctx.fillStyle = '#2f3d5c'; ctx.fillRect(2,2,w-4,h-4);
  ctx.fillStyle = '#111'; ctx.fillRect(w/2-2,3,4,h-6);
}

function exitOpen(ctx, w, h) {
  const g = ctx.createRadialGradient(w/2,h/2,2,w/2,h/2,w/2);
  g.addColorStop(0, 'rgba(100,255,180,0.9)'); g.addColorStop(1, 'rgba(20,40,30,0.05)');
  ctx.fillStyle = g; ctx.fillRect(0,0,w,h);
}

function playerSprite(frame) {
  const c = mkCanvas(16,16,(ctx,w,h)=>{
    ctx.fillStyle = '#f7d21b';
    ctx.fillRect(5,4,6,8);
    ctx.fillStyle = '#222'; ctx.fillRect(6,6,1,1); ctx.fillRect(9,6,1,1);
    ctx.fillStyle = '#ffef6a'; ctx.fillRect(6,10,4,2);
    // arms/legs wiggle
    if ((frame>>2)%2===0) { ctx.fillStyle = '#d7b10f'; ctx.fillRect(4,12,8,2); ctx.fillRect(6,14,4,2); }
    else { ctx.fillStyle = '#d7b10f'; ctx.fillRect(5,12,6,2); ctx.fillRect(6,14,4,2);}    
  });
  return c;
}

export function createAssets() {
  const cache = new Map();

  function getSprite(tile, x, y, tick) {
    const key = `${tile}`;
    if (cache.has(key)) return cache.get(key);
    let c;
    if (tile === TILE.EMPTY) c = mkCanvas(16,16,(ctx)=>ctx.clearRect(0,0,16,16));
    else if (tile === TILE.DIRT) c = mkCanvas(16,16,dirt);
    else if (tile === TILE.WALL) c = mkCanvas(16,16,brick);
    else if (tile === TILE.STEEL) c = mkCanvas(16,16,steel);
    else if (tile === TILE.BOULDER) c = mkCanvas(16,16,boulder);
    else if (tile === TILE.GEM) c = mkCanvas(16,16,(ctx,w,h)=>gem(ctx,w,h, 160));
    else if (tile === TILE.EXIT_CLOSED) c = mkCanvas(16,16,exitClosed);
    else if (tile === TILE.EXIT_OPEN) c = mkCanvas(16,16,exitOpen);
    cache.set(key, c); return c;
  }

  function player(tick) { return playerSprite(tick); }

  return { getSprite, player };
}
