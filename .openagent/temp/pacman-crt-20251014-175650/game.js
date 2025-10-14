(() => {
  'use strict';

  // Canvas and contexts
  const canvas = document.getElementById('game');
  const screen = canvas.getContext('2d'); // final composite target

  const TILE = 8; const COLS = 28; const ROWS = 31;
  const WIDTH = COLS * TILE; const HEIGHT = ROWS * TILE;
  canvas.width = WIDTH; canvas.height = HEIGHT;

  // Offscreen scene buffer for post-processing
  const scene = document.createElement('canvas');
  scene.width = WIDTH; scene.height = HEIGHT;
  const ctx = scene.getContext('2d'); // all game drawing happens here first

  // Settings for lighting and glow (more settings added in later phases)
  const settings = {
    crt: { warp: 0.18, aberration: 0.12, enabled: true },
    lighting: {
      enabled: true,
      ambient: 0.55,            // base darkness over the whole scene
      frightenedBoost: 0.20,    // reduce darkness when frightened (brighten maze)
      radius: 56,               // light radius around Pac-Man (px)
      powerGlow: 0.10           // extra lighten around power pellets (subtle)
    },
    ghostGlow: {
      enabled: true,
      strength: 0.45,
      frightenedStrength: 0.85
    }
  };

  const COLORS = {
    wall: '#1a2aff', pellet: '#ffe7a1', power: '#ffd28a', bg: '#000312',
    pacman: '#ffe12b', blinky: '#ff0000', pinky: '#ffb8ff', inky: '#00ffff', clyde: '#ffb852',
    eyes: '#ffffff', mouth: '#000', gate: '#8bd8ff'
  };

  // Map (26 rows) padded to 31
  const MAP = [
    '############################',
    '#............##............#',
    '#.####.#####.##.#####.####.#',
    '#o####.#####.##.#####.####o#',
    '#.####.#####.##.#####.####.#',
    '#..........................#',
    '#.####.##.########.##.####.#',
    '#......##....##....##......#',
    '######.#####.##.#####.######',
    '     #.#####.##.#####.#     ',
    '     #.##          ##.#     ',
    '     #.## ###--### ##.#     ',
    '######.## #      # ##.######',
    '      .   #      #   .      ',
    '######.## #      # ##.######',
    '     #.## ######## ##.#     ',
    '     #.##          ##.#     ',
    '     #.## ######## ##.#     ',
    '######.## ######## ##.######',
    '#............##............#',
    '#.####.#####.##.#####.####.#',
    '#o..##................##..o#',
    '###.##.##.########.##.##.###',
    '#......##....##....##......#',
    '#.##########.##.##########.#',
    '#..........................#',
    '############################',
  ];
  while (MAP.length < ROWS) { if (MAP.length % 2 === 0) MAP.unshift('############################'); else MAP.push('############################'); }

  // Utils
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const rnd = (a, b) => Math.floor(Math.random() * (b - a + 1)) + a;

  function tileAt(x, y) { if (y < 0 || y >= ROWS) return '#'; if (x < 0 || x >= COLS) return '#'; return MAP[y][x] || '#'; }
  const isWall = t => t === '#'; const isGate = t => t === '-';

  // Pellets
  const pellets = []; for (let y=0;y<ROWS;y++){ pellets[y]=[]; for (let x=0;x<COLS;x++){ const ch=tileAt(x,y); pellets[y][x] = ch==='.'?1:(ch==='o'?2:0); } }

  // Gate scan
  const gatesSet = new Set(); const gateList = [];
  for (let y=0;y<ROWS;y++) for (let x=0;x<COLS;x++) if (tileAt(x,y)==='-'){ const id=y*COLS+x; gatesSet.add(id); gateList.push({x,y}); }
  let GATE_TILE = {x:14,y:12}, HOUSE_TILE={x:14,y:16};
  if (gatesSet.size){ let sx=0,sy=0,n=0; for(const id of gatesSet){ sx+=id%COLS; sy+=Math.floor(id/COLS); n++; } if(n){ GATE_TILE={x:Math.round(sx/n),y:Math.round(sy/n)}; }}

  // Movement / neighbors
  function canWalk(x, y, ent){ const t = tileAt(x,y); if (isWall(t)) return false; if (isGate(t)) { if (!ent) return false; if (ent.type==='pacman') return false; if (ent.mode==='eyes') return true; return state.readyTime<=0; } return true; }
  function neighbors(x, y, ent){ const r=[]; if (canWalk(x+1,y,ent)) r.push([x+1,y,'right']); if (canWalk(x-1,y,ent)) r.push([x-1,y,'left']); if (canWalk(x,y+1,ent)) r.push([x,y+1,'down']); if (canWalk(x,y-1,ent)) r.push([x,y-1,'up']); return r; }
  const manhattan = (ax,ay,bx,by)=>Math.abs(ax-bx)+Math.abs(ay-by);
  const DIRS={up:{x:0,y:-1},down:{x:0,y:1},left:{x:-1,y:0},right:{x:1,y:0}}; const OPP={up:'down',down:'up',left:'right',right:'left'};

  // BFS for eyes mode targets (computed once)
  const eyesProbe = { type:'ghost', mode:'eyes' };
  function walliness(x, y){ let c=0; const pts=[[1,0],[-1,0],[0,1],[0,-1]]; for(const [dx,dy] of pts){ if (isWall(tileAt(x+dx,y+dy))) c++; } return c; }
  const interiorTargets = []; const interiorTargetIds = new Set();
  for (const g of gateList){
    const cand = [];
    for (const [nx,ny] of [[g.x+1,g.y],[g.x-1,g.y],[g.x,g.y+1],[g.x,g.y-1]]){
      if (nx<0||nx>=COLS||ny<0||ny>=ROWS) continue;
      if (!canWalk(nx,ny,eyesProbe)) continue;
      if (tileAt(nx,ny)==='-') continue;
      cand.push({x:nx,y:ny, walls: walliness(nx,ny)});
    }
    cand.sort((a,b)=> (b.y - a.y) || (b.walls - a.walls));
    if (cand.length){ const best=cand[0]; const id = best.y*COLS+best.x; if(!interiorTargetIds.has(id)){ interiorTargets.push(best); interiorTargetIds.add(id);} }
  }
  function bfsNextDir(sx, sy, targetsSet, ent){
    const startId = sy*COLS+sx; if (targetsSet.has(startId)) return null;
    const q = []; const prev = new Map(); const seen = new Uint8Array(COLS*ROWS);
    q.push([sx,sy]); seen[startId]=1; let endKey=null;
    while(q.length){ const [x,y]=q.shift(); const id=y*COLS+x; if(targetsSet.has(id)){ endKey=id; break; }
      for(const [nx,ny,dir] of neighbors(x,y,ent)){ const nid=ny*COLS+nx; if(seen[nid]) continue; seen[nid]=1; prev.set(nid,{px:x,py:y,dir}); q.push([nx,ny]); }
    }
    if(endKey==null) return null; let curId=endKey; let cur=prev.get(curId); let firstDir=null;
    while(cur){ const pid=cur.py*COLS+cur.px; if(pid===startId){ firstDir=cur.dir; break; } curId=pid; cur=prev.get(curId); }
    return firstDir;
  }

  // Game state
  const state = { score:0, lives:3, pelletsRemaining: pellets.flat().filter(v=>v>0).length, frightenedUntil:0, level:1, readyTime:180 };
  let gameState='playing'; // playing | dying | gameover
  const pacDeath={active:false,start:0,dur:1100};

  // HUD
  const hudScore=document.getElementById('score'); const hudLives=document.getElementById('lives');
  function updateHUD(){ hudScore.textContent=String(state.score); hudLives.innerHTML=''; for(let i=0;i<state.lives;i++){ const s=document.createElement('span'); s.style.display='inline-block'; s.style.width='10px'; s.style.height='10px'; s.style.borderRadius='50% 50% 0 50%'; s.style.transform='rotate(45deg)'; s.style.background=COLORS.pacman; s.style.boxShadow='0 0 6px rgba(255, 225, 43, 0.6)'; hudLives.appendChild(s);} }
  updateHUD();

  // Simple settings panel (UI) with sliders for CRT warp and chromatic aberration
  ;(function setupSettingsUI(){
    const persistKey = 'pm_settings';
    // Load persisted
    try{ const saved = JSON.parse(localStorage.getItem(persistKey)||'{}'); if(saved.crt){ Object.assign(settings.crt, saved.crt); } }catch{}
    const panel = document.createElement('div');
    panel.style.cssText = 'position:absolute; right:8px; top:8px; font:10px monospace; color:#9fd; background:rgba(0,0,0,0.45); padding:6px 8px; border:1px solid rgba(160,200,255,0.25); border-radius:6px; backdrop-filter: blur(2px); user-select:none; z-index:10;';
    const mkRow = (label, input)=>{ const row=document.createElement('div'); row.style.marginBottom='4px'; const l=document.createElement('label'); l.textContent=label; l.style.marginRight='6px'; l.style.display='inline-block'; l.style.minWidth='90px'; row.appendChild(l); row.appendChild(input); return row; };
    const warp = document.createElement('input'); warp.type='range'; warp.min='0'; warp.max='1'; warp.step='0.01'; warp.value=String(settings.crt.warp);
    const ab = document.createElement('input'); ab.type='range'; ab.min='0'; ab.max='1'; ab.step='0.01'; ab.value=String(settings.crt.aberration);
    const en = document.createElement('input'); en.type='checkbox'; en.checked = !!settings.crt.enabled;
    panel.appendChild(mkRow('CRT Warp', warp));
    panel.appendChild(mkRow('Chromatic Aber.', ab));
    const enRow = document.createElement('div'); enRow.style.marginTop='2px'; const enLbl=document.createElement('label'); enLbl.textContent='Enable CRT'; enLbl.style.marginLeft='6px'; enRow.appendChild(en); enRow.appendChild(enLbl); panel.appendChild(enRow);
    function persist(){ try{ localStorage.setItem(persistKey, JSON.stringify({crt: settings.crt})); }catch{} }
    warp.addEventListener('input', ()=>{ settings.crt.warp = parseFloat(warp.value)||0; persist(); });
    ab.addEventListener('input', ()=>{ settings.crt.aberration = parseFloat(ab.value)||0; persist(); });
    en.addEventListener('change', ()=>{ settings.crt.enabled = !!en.checked; persist(); });
    document.body.appendChild(panel);
  })();


  // Audio manager (synth SFX)
  const AudioMgr={ ctx:null,gain:null,muted:false,wakaFlip:false, init(){ if (this.ctx) return; const AC=window.AudioContext||window.webkitAudioContext; if(!AC) return; this.ctx=new AC(); this.gain=this.ctx.createGain(); this.gain.gain.value=0.18; this.gain.connect(this.ctx.destination); }, ensure(){ if(!this.ctx) this.init(); return !!this.ctx && !this.muted; }, playTone({freq=440,dur=0.08,type='square',gain=0.08,delay=0}){ if(!this.ensure()) return; const now=this.ctx.currentTime+delay; const o=this.ctx.createOscillator(); const g=this.ctx.createGain(); o.type=type; o.frequency.setValueAtTime(freq, now); o.connect(g); g.connect(this.gain); g.gain.setValueAtTime(0.0001, now); g.gain.linearRampToValueAtTime(gain, now+0.01); g.gain.exponentialRampToValueAtTime(0.0001, now+dur); o.start(now); o.stop(now+dur+0.05); }, pellet(){ if(!this.ensure()) return; const f=this.wakaFlip?420:520; this.wakaFlip=!this.wakaFlip; this.playTone({freq:f,dur:0.05,type:'square',gain:0.06}); }, power(){ if(!this.ensure()) return; this.playTone({freq:220,dur:0.14,type:'sawtooth',gain:0.09}); this.playTone({freq:180,dur:0.14,type:'sawtooth',gain:0.07,delay:0.05}); }, eaten(){ if(!this.ensure()) return; const base=320; this.playTone({freq:base,dur:0.08,type:'triangle',gain:0.08}); this.playTone({freq:base*1.25,dur:0.08,type:'triangle',gain:0.08,delay:0.08}); this.playTone({freq:base*1.5,dur:0.1,type:'triangle',gain:0.08,delay:0.16}); }, death(){ if(!this.ensure()) return; const seq=[520,440,360,280,220,180]; seq.forEach((f,i)=>this.playTone({freq:f,dur:0.12,type:'sine',gain:0.09,delay:i*0.1})); }, start(){ if(!this.ensure()) return; this.playTone({freq:660,dur:0.1,type:'square',gain:0.08}); this.playTone({freq:880,dur:0.16,type:'square',gain:0.08,delay:0.12}); } };
  window.addEventListener('pointerdown', ()=>AudioMgr.init(), {once:true});
  window.addEventListener('keydown', ()=>AudioMgr.init(), {once:true});

  // Input
  window.addEventListener('keydown', (e) => {
    if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key)) e.preventDefault();
    if (gameState !== 'playing') return;
    if (e.key==='ArrowUp') pacman.nextDir='up';
    if (e.key==='ArrowDown') pacman.nextDir='down';
    if (e.key==='ArrowLeft') pacman.nextDir='left';
    if (e.key==='ArrowRight') pacman.nextDir='right';
  }, { passive:false });

  // Helpers
  function wrapTunnel(px){ if (px < 0) return WIDTH - 1; if (px >= WIDTH) return 0; return px; }
  const toTile=(px,py)=>[Math.floor(px/TILE),Math.floor(py/TILE)]; const centerOf=(tx,ty)=>[tx*TILE+TILE/2,ty*TILE+TILE/2];

  function makeEntity({x,y,speed,dir,color,type}){ return { x,y,speed,dir,nextDir:dir,color,type,mode:'normal',respawnUntil:0,dead:false }; }
  const pacman = makeEntity({ x:14*TILE+TILE/2, y:23*TILE+TILE/2, speed:1.08, dir:'left', color:COLORS.pacman, type:'pacman' });
  const ghosts=[
    makeEntity({x:14*TILE+TILE/2,y:14*TILE+TILE/2,speed:0.96,dir:'left', color:COLORS.blinky,type:'blinky'}),
    makeEntity({x:13*TILE+TILE/2,y:16*TILE+TILE/2,speed:0.94,dir:'right',color:COLORS.pinky, type:'pinky'}),
    makeEntity({x:14*TILE+TILE/2,y:16*TILE+TILE/2,speed:0.94,dir:'left', color:COLORS.inky,  type:'inky'}),
    makeEntity({x:15*TILE+TILE/2,y:16*TILE+TILE/2,speed:0.92,dir:'right',color:COLORS.clyde, type:'clyde'}),
  ];

  function atTileCenter(ent){ const cx=(ent.x%TILE), cy=(ent.y%TILE), eps=0.5; return Math.abs(cx-TILE/2)<eps && Math.abs(cy-TILE/2)<eps; }
  function tryTurn(ent, dir){ if(!atTileCenter(ent)) return false; const [tx,ty]=toTile(ent.x,ent.y); const d=DIRS[dir]; const nx=tx+d.x, ny=ty+d.y; if(canWalk(nx,ny,ent)){ ent.dir=dir; const [cx,cy]=centerOf(tx,ty); ent.x=cx; ent.y=cy; return true; } return false; }

  // Tunnel wrap fix: wrap before collision checks
  function stepEntity(ent){
    if (ent.type==='pacman' && ent.nextDir && ent.nextDir!==ent.dir) tryTurn(ent, ent.nextDir);
    const d=DIRS[ent.dir]||DIRS.left;
    let nx=ent.x + d.x*ent.speed; let ny=ent.y + d.y*ent.speed;
    nx = wrapTunnel(nx);
    const [ntx, nty] = toTile(nx, ny);
    const [ct, rt] = toTile(ent.x, ent.y);
    ent.x = nx; ent.y = ny;
    if (isWall(tileAt(ntx, nty)) || (isGate(tileAt(ntx, nty)) && (ent.type==='pacman' || (ent.type!=='pacman' && ent.mode!=='eyes' && state.readyTime>0)))){
      const [cx,cy]=centerOf(ct,rt); ent.x=cx; ent.y=cy; if (ent.type==='pacman' && ent.nextDir && ent.nextDir!==ent.dir) tryTurn(ent, ent.nextDir);
    }
  }

  function eatPellets(){
    const [tx,ty]=toTile(pacman.x,pacman.y);
    if (pellets[ty] && pellets[ty][tx]===1){
      pellets[ty][tx]=0; state.score+=10; state.pelletsRemaining--; updateHUD();

  // Simple settings panel (UI) with sliders for CRT warp and chromatic aberration
  ;(function setupSettingsUI(){
    const persistKey = 'pm_settings';
    // Load persisted
    try{ const saved = JSON.parse(localStorage.getItem(persistKey)||'{}'); if(saved.crt){ Object.assign(settings.crt, saved.crt); } }catch{}
    const panel = document.createElement('div');
    panel.style.cssText = 'position:absolute; right:8px; top:8px; font:10px monospace; color:#9fd; background:rgba(0,0,0,0.45); padding:6px 8px; border:1px solid rgba(160,200,255,0.25); border-radius:6px; backdrop-filter: blur(2px); user-select:none; z-index:10;';
    const mkRow = (label, input)=>{ const row=document.createElement('div'); row.style.marginBottom='4px'; const l=document.createElement('label'); l.textContent=label; l.style.marginRight='6px'; l.style.display='inline-block'; l.style.minWidth='90px'; row.appendChild(l); row.appendChild(input); return row; };
    const warp = document.createElement('input'); warp.type='range'; warp.min='0'; warp.max='1'; warp.step='0.01'; warp.value=String(settings.crt.warp);
    const ab = document.createElement('input'); ab.type='range'; ab.min='0'; ab.max='1'; ab.step='0.01'; ab.value=String(settings.crt.aberration);
    const en = document.createElement('input'); en.type='checkbox'; en.checked = !!settings.crt.enabled;
    panel.appendChild(mkRow('CRT Warp', warp));
    panel.appendChild(mkRow('Chromatic Aber.', ab));
    const enRow = document.createElement('div'); enRow.style.marginTop='2px'; const enLbl=document.createElement('label'); enLbl.textContent='Enable CRT'; enLbl.style.marginLeft='6px'; enRow.appendChild(en); enRow.appendChild(enLbl); panel.appendChild(enRow);
    function persist(){ try{ localStorage.setItem(persistKey, JSON.stringify({crt: settings.crt})); }catch{} }
    warp.addEventListener('input', ()=>{ settings.crt.warp = parseFloat(warp.value)||0; persist(); });
    ab.addEventListener('input', ()=>{ settings.crt.aberration = parseFloat(ab.value)||0; persist(); });
    en.addEventListener('change', ()=>{ settings.crt.enabled = !!en.checked; persist(); });
    document.body.appendChild(panel);
  })();

      AudioMgr.pellet();
      spawnSparks(pacman.x,pacman.y,'#ffdca6',3);
    } else if (pellets[ty] && pellets[ty][tx]===2){
      pellets[ty][tx]=0; state.score+=50; state.pelletsRemaining--; updateHUD();

  // Simple settings panel (UI) with sliders for CRT warp and chromatic aberration
  ;(function setupSettingsUI(){
    const persistKey = 'pm_settings';
    // Load persisted
    try{ const saved = JSON.parse(localStorage.getItem(persistKey)||'{}'); if(saved.crt){ Object.assign(settings.crt, saved.crt); } }catch{}
    const panel = document.createElement('div');
    panel.style.cssText = 'position:absolute; right:8px; top:8px; font:10px monospace; color:#9fd; background:rgba(0,0,0,0.45); padding:6px 8px; border:1px solid rgba(160,200,255,0.25); border-radius:6px; backdrop-filter: blur(2px); user-select:none; z-index:10;';
    const mkRow = (label, input)=>{ const row=document.createElement('div'); row.style.marginBottom='4px'; const l=document.createElement('label'); l.textContent=label; l.style.marginRight='6px'; l.style.display='inline-block'; l.style.minWidth='90px'; row.appendChild(l); row.appendChild(input); return row; };
    const warp = document.createElement('input'); warp.type='range'; warp.min='0'; warp.max='1'; warp.step='0.01'; warp.value=String(settings.crt.warp);
    const ab = document.createElement('input'); ab.type='range'; ab.min='0'; ab.max='1'; ab.step='0.01'; ab.value=String(settings.crt.aberration);
    const en = document.createElement('input'); en.type='checkbox'; en.checked = !!settings.crt.enabled;
    panel.appendChild(mkRow('CRT Warp', warp));
    panel.appendChild(mkRow('Chromatic Aber.', ab));
    const enRow = document.createElement('div'); enRow.style.marginTop='2px'; const enLbl=document.createElement('label'); enLbl.textContent='Enable CRT'; enLbl.style.marginLeft='6px'; enRow.appendChild(en); enRow.appendChild(enLbl); panel.appendChild(enRow);
    function persist(){ try{ localStorage.setItem(persistKey, JSON.stringify({crt: settings.crt})); }catch{} }
    warp.addEventListener('input', ()=>{ settings.crt.warp = parseFloat(warp.value)||0; persist(); });
    ab.addEventListener('input', ()=>{ settings.crt.aberration = parseFloat(ab.value)||0; persist(); });
    en.addEventListener('change', ()=>{ settings.crt.enabled = !!en.checked; persist(); });
    document.body.appendChild(panel);
  })();

      state.frightenedUntil = performance.now() + 6000; // brighten maze via lighting
      startShockwave(pacman.x, pacman.y);
      AudioMgr.power();
      screenFlash(240, 0.22);
      addToast('POWER!', pacman.x, pacman.y, '#ffd28a', 900);
      spawnSparks(pacman.x,pacman.y,'#ffe9b8',6);
    }
  }

  function resetPositions(death){
    pacman.x=14*TILE+TILE/2; pacman.y=23*TILE+TILE/2; pacman.dir='left'; pacman.nextDir='left';
    for(const g of ghosts){ g.mode='normal'; g.respawnUntil=0; }
    ghosts[0].x=14*TILE+TILE/2; ghosts[0].y=14*TILE+TILE/2; ghosts[0].dir='left';
    ghosts[1].x=13*TILE+TILE/2; ghosts[1].y=16*TILE+TILE/2; ghosts[1].dir='right';
    ghosts[2].x=14*TILE+TILE/2; ghosts[2].y=16*TILE+TILE/2; ghosts[2].dir='left';
    ghosts[3].x=15*TILE+TILE/2; ghosts[3].y=16*TILE+TILE/2; ghosts[3].dir='right';
    state.readyTime = death ? 120 : 1200;
    const [itx,ity]=toTile(pacman.x,pacman.y); depositScentAt(itx,ity); lastPacTile=[itx,ity];
    startIris('in', 900); AudioMgr.start();
  }

  // ----- Scent system -----
  const SCENT_MAX=1000, SCENT_DECAY=1;
  const scent = Array.from({length:ROWS},()=>Array(COLS).fill(0));
  function depositScentAt(tx,ty){ if(tx<0||tx>=COLS||ty<0||ty>=ROWS) return; if(tileAt(tx,ty)==='#') return; scent[ty][tx]=SCENT_MAX; }
  function decayScent(){ for(let y=0;y<ROWS;y++) for(let x=0;x<COLS;x++){ const v=scent[y][x]; if(v>0) scent[y][x]=v-SCENT_DECAY<=0?0:v-SCENT_DECAY; } }

  // Particles
  const particles=[]; function spawnSparks(x,y,color,count=4){ for(let i=0;i<count;i++){ particles.push({x,y, vx:(Math.random()-0.5)*1.4, vy:(Math.random()-0.7)*1.6, life:260, color}); } }
  function updateParticles(dtMs){ for(let i=particles.length-1;i>=0;i--){ const p=particles[i]; p.x+=p.vx; p.y+=p.vy; p.vy+=0.02; p.life-=dtMs; if(p.life<=0) particles.splice(i,1); } }
  function drawParticles(){ ctx.save(); for(const p of particles){ const a=clamp(p.life/260,0,1); ctx.fillStyle=`rgba(255, 230, 180, ${0.4*a})`; ctx.fillRect(p.x-0.5,p.y-0.5,1,1); } ctx.restore(); }

  // Toasts
  const toasts=[]; function addToast(text,x,y,color='#fff',dur=800){ toasts.push({text,x,y,start:performance.now(),dur,color}); }
  function drawToasts(now){ ctx.save(); ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.font='6px monospace'; for(let i=toasts.length-1;i>=0;i--){ const t=toasts[i]; const k=clamp((now-t.start)/t.dur,0,1); const dy = -6*k; const alpha = 1 - k; ctx.fillStyle = `rgba(255,255,255,${alpha*0.25})`; ctx.fillText(t.text, t.x+1, t.y+dy+1); ctx.fillStyle = `rgba(0,0,0,${alpha*0.6})`; ctx.fillText(t.text, t.x, t.y+dy+0.5); ctx.fillStyle = t.color; ctx.fillText(t.text, t.x, t.y+dy); if(k>=1) toasts.splice(i,1); }
    ctx.restore(); }

  // Screen flash overlay (drawn on screen)
  // Shockwave + time dilation
  let shock = {active:false,x:0,y:0,start:0,dur:450};
  let timeScale = 1;
  function startShockwave(x,y){ shock.active=true; shock.x=x; shock.y=y; shock.start=performance.now(); shock.dur=450; }
  function drawShockwave(now){ if(!shock.active) return; const t= (now - shock.start) / shock.dur; if(t>=1){ shock.active=false; return; } const easeOut = (x)=>1-Math.pow(1-x,3); const k=easeOut(t); const r = 12 + k * Math.max(WIDTH,HEIGHT); const w = 6; screen.save(); screen.globalCompositeOperation='lighter'; const g=screen.createRadialGradient(shock.x,shock.y, r-w, shock.x,shock.y, r+w); g.addColorStop(0,'rgba(180,180,255,0)'); g.addColorStop(0.5,'rgba(200,200,255,0.25)'); g.addColorStop(1,'rgba(180,180,255,0)'); screen.fillStyle=g; screen.beginPath(); screen.arc(shock.x,shock.y,r+w,0,Math.PI*2); screen.fill(); screen.restore(); }
  let flash={until:0,strength:0.18}; function screenFlash(ms=200,strength=0.18){ flash.until=performance.now()+ms; flash.strength=strength; }

  // Iris transitions (drawn on screen)
  const iris={active:false,type:'in',start:0,dur:900}; function startIris(type='in',dur=900){ iris.active=true; iris.type=type; iris.start=performance.now(); iris.dur=dur; }
  function drawIris(now){ if(!iris.active) return; const t=clamp((now-iris.start)/iris.dur,0,1); const ease=(x)=>1- Math.pow(1-x,3); const maxR=Math.sqrt(WIDTH*WIDTH+HEIGHT*HEIGHT); const r= iris.type==='in' ? ease(t)*maxR : (1-ease(t))*maxR; screen.save(); screen.fillStyle='rgba(0,0,0,1)'; screen.fillRect(0,0,WIDTH,HEIGHT); screen.globalCompositeOperation='destination-out'; screen.beginPath(); screen.arc(WIDTH/2,HEIGHT/2,Math.max(0,r),0,Math.PI*2); screen.fill(); screen.restore(); if(t>=1) iris.active=false; }

  // Track Pac-Man tile for scent
  let lastPacTile = toTile(pacman.x, pacman.y);

  // Targeting
  function ghostTarget(g){ const [px,py]=toTile(pacman.x,pacman.y); switch(g.type){ case 'blinky': return [px,py]; case 'pinky': return [clamp(px+4*DIRS[pacman.dir].x,0,COLS-1), clamp(py+4*DIRS[pacman.dir].y,0,ROWS-1)]; case 'inky': return [px,py]; case 'clyde': return (manhattan(...toTile(g.x,g.y),px,py)>8)?[px,py]:[1,ROWS-2]; default: return [px,py]; } }

  function chooseGhostDir(g, target){
    if (!atTileCenter(g)) return;
    const [tx,ty]=toTile(g.x,g.y);
    if (g.mode==='eyes'){
      const dir = bfsNextDir(tx, ty, interiorTargetIds, eyesProbe);
      if (dir){ g.dir = dir; } else {
        const choices = neighbors(tx,ty,g); let best=null, bestDist=Infinity; for(const [nx,ny,dd] of choices){ const d=manhattan(nx,ny,GATE_TILE.x,GATE_TILE.y); if(d<bestDist){bestDist=d; best=dd;} } if (best) g.dir=best;
      }
      return;
    }
    const opts=neighbors(tx,ty,g).filter(([, , dir])=>dir!==OPP[g.dir]); const choices=opts.length?opts:neighbors(tx,ty,g);
    const now=performance.now(); const frightened=now<state.frightenedUntil;
    if (frightened){ const pool=choices.filter(([, , dir])=>dir!==OPP[g.dir]); const list=pool.length?pool:choices; if(list.length){ const pick=list[rnd(0,list.length-1)]; g.dir=pick[2]; } return; }
    if (g.type==='inky'){
      let bestDir=null,bestVal=-1; for(const [nx,ny,dir] of choices){ const val=(scent[ny]&&scent[ny][nx])?scent[ny][nx]:0; if(val>bestVal){bestVal=val; bestDir=dir;} } if(bestDir){ g.dir=bestDir; return; }
    }
    let best=null,bestDist=Infinity; for(const [nx,ny,dir] of choices){ const d=manhattan(nx,ny,target[0],target[1]); if(d<bestDist){bestDist=d; best=dir;} } if(best) g.dir=best;
  }

  // Collisions
  const collides=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y)<TILE*0.6;

  // Drawing (to scene ctx)
  function drawMaze(){ ctx.fillStyle=COLORS.bg; ctx.fillRect(0,0,WIDTH,HEIGHT); ctx.strokeStyle=COLORS.wall; ctx.lineWidth=2; ctx.lineCap='round'; ctx.lineJoin='round';
    for(let y=0;y<ROWS;y++) for(let x=0;x<COLS;x++){ const ch=tileAt(x,y); const px=x*TILE, py=y*TILE; if(ch==='#'){ ctx.fillStyle='rgba(12, 18, 80, 0.45)'; ctx.fillRect(px,py,TILE,TILE); ctx.strokeStyle=COLORS.wall; ctx.strokeRect(px+1,py+1,TILE-2,TILE-2);} if(ch==='-'){ ctx.strokeStyle=COLORS.gate; ctx.beginPath(); ctx.moveTo(px+1,py+TILE/2); ctx.lineTo(px+TILE-1,py+TILE/2); ctx.stroke(); } }
    for(let y=0;y<ROWS;y++) for(let x=0;x<COLS;x++){ const p=pellets[y][x]; if(p===1){ ctx.fillStyle=COLORS.pellet; ctx.beginPath(); ctx.arc(x*TILE+TILE/2,y*TILE+TILE/2,1.2,0,Math.PI*2); ctx.fill(); } else if(p===2){ ctx.fillStyle=COLORS.power; ctx.beginPath(); ctx.arc(x*TILE+TILE/2,y*TILE+TILE/2,2.4,0,Math.PI*2); ctx.fill(); } }
  }

  function drawScentOverlay(){ ctx.save(); ctx.globalCompositeOperation='lighter'; for(let y=0;y<ROWS;y++) for(let x=0;x<COLS;x++){ const s=scent[y][x]; if(s<=0) continue; const cx=x*TILE+TILE/2, cy=y*TILE+TILE/2, r=TILE*0.6; const t=s/SCENT_MAX; const alpha=Math.min(0.02+t*0.4,0.42); const grad=ctx.createRadialGradient(cx,cy,0,cx,cy,r); grad.addColorStop(0,`rgba(160,120,255,${alpha})`); grad.addColorStop(1,'rgba(160,120,255,0)'); ctx.fillStyle=grad; ctx.beginPath(); ctx.arc(cx,cy,r,0,Math.PI*2); ctx.fill(); } ctx.restore(); }

  function drawPacman(){ if(pacDeath.active){ const elapsed=performance.now()-pacDeath.start; const k=clamp(elapsed/pacDeath.dur,0,1); const angle=({right:0,left:Math.PI,up:-Math.PI/2,down:Math.PI/2})[pacman.dir]||0; const r=TILE*0.45*(1-0.9*k); const mouth=Math.PI*(0.2+1.6*k); ctx.fillStyle=COLORS.pacman; ctx.beginPath(); ctx.moveTo(pacman.x,pacman.y); ctx.arc(pacman.x,pacman.y,Math.max(0.1,r), angle+mouth, angle-mouth, true); ctx.closePath(); ctx.fill(); return; }
    const mouthOpen=Math.abs(Math.sin(performance.now()/120))*0.7+0.2; const angle=({right:0,left:Math.PI,up:-Math.PI/2,down:Math.PI/2})[pacman.dir]||0; ctx.fillStyle=COLORS.pacman; ctx.beginPath(); ctx.moveTo(pacman.x,pacman.y); ctx.arc(pacman.x,pacman.y,TILE*0.45, angle+mouthOpen, angle-mouthOpen, true); ctx.closePath(); ctx.fill(); }

  function drawGhost(g){ const now=performance.now(); const frightened=now<state.frightenedUntil; if(g.mode==='eyes'){ const baseX=g.x, baseY=g.y; ctx.fillStyle=COLORS.eyes; const ex=({left:-3,right:3,up:0,down:0})[g.dir]||0; const ey=({up:-2,down:2,left:0,right:0})[g.dir]||0; ctx.beginPath(); ctx.arc(baseX-4,baseY-2,2.5,0,Math.PI*2); ctx.fill(); ctx.beginPath(); ctx.arc(baseX+4,baseY-2,2.5,0,Math.PI*2); ctx.fill(); ctx.fillStyle='#0033aa'; ctx.beginPath(); ctx.arc(baseX-4+ex,baseY-2+ey,1.2,0,Math.PI*2); ctx.fill(); ctx.beginPath(); ctx.arc(baseX+4+ex,baseY-2+ey,1.2,0,Math.PI*2); ctx.fill(); return; }
    const r=TILE*0.45; const baseX=g.x, baseY=g.y; let bodyColor=g.color; if(frightened){ const rem=state.frightenedUntil-now; const blink=rem>0 && rem<1500 && (Math.floor(now/125)%2===0); bodyColor=blink?'#ffffff':'#1f4bd1'; }
    ctx.fillStyle=bodyColor; ctx.beginPath(); ctx.arc(baseX,baseY-r*0.2,r,Math.PI,0); ctx.lineTo(baseX+r,baseY+r*0.8); const waves=4; for(let i=waves;i>=0;i--){ const wx=baseX-r+(i*(2*r)/waves); const wy=baseY+r*0.8+(i%2===0?0:2); ctx.lineTo(wx,wy);} ctx.closePath(); ctx.fill();
    ctx.fillStyle=COLORS.eyes; const ex=({left:-3,right:3,up:0,down:0})[g.dir]||0; const ey=({up:-2,down:2,left:0,right:0})[g.dir]||0; ctx.beginPath(); ctx.arc(baseX-4,baseY-2,2.5,0,Math.PI*2); ctx.fill(); ctx.beginPath(); ctx.arc(baseX+4,baseY-2,2.5,0,Math.PI*2); ctx.fill(); ctx.fillStyle='#0033aa'; ctx.beginPath(); ctx.arc(baseX-4+ex,baseY-2+ey,1.2,0,Math.PI*2); ctx.fill(); ctx.beginPath(); ctx.arc(baseX+4+ex,baseY-2+ey,1.2,0,Math.PI*2); ctx.fill(); }

  // Lighting and glows (drawn on screen)
  function drawLighting(now){ if(!settings.lighting.enabled) return; const frightened = now < state.frightenedUntil; const ambient = clamp(settings.lighting.ambient - (frightened ? settings.lighting.frightenedBoost : 0), 0, 1);
    if (ambient > 0){ screen.save();
      // Dim entire scene
      screen.globalCompositeOperation = 'source-over';
      screen.fillStyle = `rgba(0,0,0,${ambient})`;
      screen.fillRect(0,0,WIDTH,HEIGHT);
      // Punch a soft light hole around Pac-Man
      const r = settings.lighting.radius;
      const g = screen.createRadialGradient(pacman.x, pacman.y, 0, pacman.x, pacman.y, r);
      g.addColorStop(0, 'rgba(0,0,0,1)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      screen.globalCompositeOperation = 'destination-out';
      screen.fillStyle = g;
      screen.beginPath(); screen.arc(pacman.x, pacman.y, r, 0, Math.PI*2); screen.fill();
      screen.restore();
    }
    // Subtle glow on existing power pellets
    if (settings.lighting.powerGlow > 0){ screen.save(); screen.globalCompositeOperation='lighter'; screen.globalAlpha = settings.lighting.powerGlow; for(let y=0;y<ROWS;y++) for(let x=0;x<COLS;x++){ if (pellets[y][x]===2){ const cx=x*TILE+TILE/2, cy=y*TILE+TILE/2; const rg=screen.createRadialGradient(cx,cy,0,cx,cy,TILE*2.2); rg.addColorStop(0,'rgba(255,200,120,0.5)'); rg.addColorStop(1,'rgba(255,200,120,0)'); screen.fillStyle=rg; screen.beginPath(); screen.arc(cx,cy,TILE*2.2,0,Math.PI*2); screen.fill(); } } screen.restore(); }
  }

  function drawGhostGlows(now){ if(!settings.ghostGlow.enabled) return; const frightened = now < state.frightenedUntil; screen.save(); screen.globalCompositeOperation='lighter'; for(const g of ghosts){ if (g.mode==='eyes') continue; const strength = frightened ? settings.ghostGlow.frightenedStrength : settings.ghostGlow.strength; const r = TILE * (frightened ? 2.6 : 2.1); const grad = screen.createRadialGradient(g.x, g.y, 0, g.x, g.y, r); const col = g.color;
      const rgba = (hex, a)=>{ const h=hex.replace('#',''); const r=parseInt(h.substring(0,2),16), gg=parseInt(h.substring(2,4),16), b=parseInt(h.substring(4,6),16); return `rgba(${r},${gg},${b},${a})`; };
      grad.addColorStop(0, rgba(col, 0.28*strength)); grad.addColorStop(1, rgba(col, 0));
      screen.fillStyle=grad; screen.beginPath(); screen.arc(g.x, g.y, r, 0, Math.PI*2); screen.fill(); }
    screen.restore(); }

  let last=performance.now();
  function loop(now){ const dt = clamp((now-last)/(1000/60),0.5,2.0); const dtMs = (now-last); last=now; if(state.readyTime>0 && gameState==='playing') state.readyTime-=1;
    if(gameState==='playing'){
      { const prev=pacman.speed; pacman.speed = prev * timeScale; stepEntity(pacman); pacman.speed = prev; }
      decayScent(); const [cpx,cpy]=toTile(pacman.x,pacman.y); if(cpx!==lastPacTile[0]||cpy!==lastPacTile[1]){ depositScentAt(cpx,cpy); lastPacTile=[cpx,cpy]; }
      eatPellets();
      const frightened=now<state.frightenedUntil;
      for(const g of ghosts){
        if(g.mode==='respawn'){ if(now>=g.respawnUntil){ g.mode='normal'; g.dir='up'; } else { continue; } }
        const target=ghostTarget(g); chooseGhostDir(g,target);
        let s=g.speed; if(g.mode==='eyes') s=g.speed*1.3; else if(frightened) s=g.speed*0.8; s *= timeScale; const prev=g.speed; g.speed=s; stepEntity(g); g.speed=prev;
        if(g.mode==='eyes'){
          const [gx,gy]=toTile(g.x,g.y); const id=gy*COLS+gx; if (interiorTargetIds.has(id)){ const [cx,cy]=centerOf(HOUSE_TILE.x, HOUSE_TILE.y); g.x=cx; g.y=cy; g.dir='up'; g.mode='respawn'; g.respawnUntil=now+1000; }
        }
        if(g.mode!=='eyes' && collides(pacman,g)){
          if(frightened){ state.score+=200; updateHUD();

  // Simple settings panel (UI) with sliders for CRT warp and chromatic aberration
  ;(function setupSettingsUI(){
    const persistKey = 'pm_settings';
    // Load persisted
    try{ const saved = JSON.parse(localStorage.getItem(persistKey)||'{}'); if(saved.crt){ Object.assign(settings.crt, saved.crt); } }catch{}
    const panel = document.createElement('div');
    panel.style.cssText = 'position:absolute; right:8px; top:8px; font:10px monospace; color:#9fd; background:rgba(0,0,0,0.45); padding:6px 8px; border:1px solid rgba(160,200,255,0.25); border-radius:6px; backdrop-filter: blur(2px); user-select:none; z-index:10;';
    const mkRow = (label, input)=>{ const row=document.createElement('div'); row.style.marginBottom='4px'; const l=document.createElement('label'); l.textContent=label; l.style.marginRight='6px'; l.style.display='inline-block'; l.style.minWidth='90px'; row.appendChild(l); row.appendChild(input); return row; };
    const warp = document.createElement('input'); warp.type='range'; warp.min='0'; warp.max='1'; warp.step='0.01'; warp.value=String(settings.crt.warp);
    const ab = document.createElement('input'); ab.type='range'; ab.min='0'; ab.max='1'; ab.step='0.01'; ab.value=String(settings.crt.aberration);
    const en = document.createElement('input'); en.type='checkbox'; en.checked = !!settings.crt.enabled;
    panel.appendChild(mkRow('CRT Warp', warp));
    panel.appendChild(mkRow('Chromatic Aber.', ab));
    const enRow = document.createElement('div'); enRow.style.marginTop='2px'; const enLbl=document.createElement('label'); enLbl.textContent='Enable CRT'; enLbl.style.marginLeft='6px'; enRow.appendChild(en); enRow.appendChild(enLbl); panel.appendChild(enRow);
    function persist(){ try{ localStorage.setItem(persistKey, JSON.stringify({crt: settings.crt})); }catch{} }
    warp.addEventListener('input', ()=>{ settings.crt.warp = parseFloat(warp.value)||0; persist(); });
    ab.addEventListener('input', ()=>{ settings.crt.aberration = parseFloat(ab.value)||0; persist(); });
    en.addEventListener('change', ()=>{ settings.crt.enabled = !!en.checked; persist(); });
    document.body.appendChild(panel);
  })();
 addToast('200', g.x, g.y, '#a0ffea', 800); AudioMgr.eaten(); g.mode='eyes'; }
          else { gameState='dying'; pacDeath.active=true; pacDeath.start=now; AudioMgr.death(); startIris('out', pacDeath.dur); break; }
        }
      }
      if(state.pelletsRemaining<=0){ state.level+=1; state.frightenedUntil=0; state.pelletsRemaining=0; for(let y=0;y<ROWS;y++) for(let x=0;x<COLS;x++){ const ch=tileAt(x,y); if(ch==='.'||ch==='o') state.pelletsRemaining++; pellets[y][x]=(ch==='.'?1:(ch==='o'?2:0)); } pacman.speed=Math.min(pacman.speed+0.04,1.4); for(const g of ghosts) g.speed=Math.min(g.speed+0.03,1.25); resetPositions(false); }
    } else if (gameState==='dying'){
      if(now-pacDeath.start>=pacDeath.dur){ pacDeath.active=false; state.lives-=1; updateHUD();

  // Simple settings panel (UI) with sliders for CRT warp and chromatic aberration
  ;(function setupSettingsUI(){
    const persistKey = 'pm_settings';
    // Load persisted
    try{ const saved = JSON.parse(localStorage.getItem(persistKey)||'{}'); if(saved.crt){ Object.assign(settings.crt, saved.crt); } }catch{}
    const panel = document.createElement('div');
    panel.style.cssText = 'position:absolute; right:8px; top:8px; font:10px monospace; color:#9fd; background:rgba(0,0,0,0.45); padding:6px 8px; border:1px solid rgba(160,200,255,0.25); border-radius:6px; backdrop-filter: blur(2px); user-select:none; z-index:10;';
    const mkRow = (label, input)=>{ const row=document.createElement('div'); row.style.marginBottom='4px'; const l=document.createElement('label'); l.textContent=label; l.style.marginRight='6px'; l.style.display='inline-block'; l.style.minWidth='90px'; row.appendChild(l); row.appendChild(input); return row; };
    const warp = document.createElement('input'); warp.type='range'; warp.min='0'; warp.max='1'; warp.step='0.01'; warp.value=String(settings.crt.warp);
    const ab = document.createElement('input'); ab.type='range'; ab.min='0'; ab.max='1'; ab.step='0.01'; ab.value=String(settings.crt.aberration);
    const en = document.createElement('input'); en.type='checkbox'; en.checked = !!settings.crt.enabled;
    panel.appendChild(mkRow('CRT Warp', warp));
    panel.appendChild(mkRow('Chromatic Aber.', ab));
    const enRow = document.createElement('div'); enRow.style.marginTop='2px'; const enLbl=document.createElement('label'); enLbl.textContent='Enable CRT'; enLbl.style.marginLeft='6px'; enRow.appendChild(en); enRow.appendChild(enLbl); panel.appendChild(enRow);
    function persist(){ try{ localStorage.setItem(persistKey, JSON.stringify({crt: settings.crt})); }catch{} }
    warp.addEventListener('input', ()=>{ settings.crt.warp = parseFloat(warp.value)||0; persist(); });
    ab.addEventListener('input', ()=>{ settings.crt.aberration = parseFloat(ab.value)||0; persist(); });
    en.addEventListener('change', ()=>{ settings.crt.enabled = !!en.checked; persist(); });
    document.body.appendChild(panel);
  })();
 if(state.lives<0){ gameState='gameover'; setTimeout(()=>{ state.lives=3; state.score=0; updateHUD();

  // Simple settings panel (UI) with sliders for CRT warp and chromatic aberration
  ;(function setupSettingsUI(){
    const persistKey = 'pm_settings';
    // Load persisted
    try{ const saved = JSON.parse(localStorage.getItem(persistKey)||'{}'); if(saved.crt){ Object.assign(settings.crt, saved.crt); } }catch{}
    const panel = document.createElement('div');
    panel.style.cssText = 'position:absolute; right:8px; top:8px; font:10px monospace; color:#9fd; background:rgba(0,0,0,0.45); padding:6px 8px; border:1px solid rgba(160,200,255,0.25); border-radius:6px; backdrop-filter: blur(2px); user-select:none; z-index:10;';
    const mkRow = (label, input)=>{ const row=document.createElement('div'); row.style.marginBottom='4px'; const l=document.createElement('label'); l.textContent=label; l.style.marginRight='6px'; l.style.display='inline-block'; l.style.minWidth='90px'; row.appendChild(l); row.appendChild(input); return row; };
    const warp = document.createElement('input'); warp.type='range'; warp.min='0'; warp.max='1'; warp.step='0.01'; warp.value=String(settings.crt.warp);
    const ab = document.createElement('input'); ab.type='range'; ab.min='0'; ab.max='1'; ab.step='0.01'; ab.value=String(settings.crt.aberration);
    const en = document.createElement('input'); en.type='checkbox'; en.checked = !!settings.crt.enabled;
    panel.appendChild(mkRow('CRT Warp', warp));
    panel.appendChild(mkRow('Chromatic Aber.', ab));
    const enRow = document.createElement('div'); enRow.style.marginTop='2px'; const enLbl=document.createElement('label'); enLbl.textContent='Enable CRT'; enLbl.style.marginLeft='6px'; enRow.appendChild(en); enRow.appendChild(enLbl); panel.appendChild(enRow);
    function persist(){ try{ localStorage.setItem(persistKey, JSON.stringify({crt: settings.crt})); }catch{} }
    warp.addEventListener('input', ()=>{ settings.crt.warp = parseFloat(warp.value)||0; persist(); });
    ab.addEventListener('input', ()=>{ settings.crt.aberration = parseFloat(ab.value)||0; persist(); });
    en.addEventListener('change', ()=>{ settings.crt.enabled = !!en.checked; persist(); });
    document.body.appendChild(panel);
  })();
 for(let y=0;y<ROWS;y++) for(let x=0;x<COLS;x++){ const ch=tileAt(x,y); pellets[y][x]=(ch==='.'?1:(ch==='o'?2:0)); } resetPositions(false); gameState='playing'; }, 800); } else { resetPositions(true); gameState='playing'; } }
    }

    // Update FX systems
    updateParticles(dtMs);

    // Scene render to offscreen
    drawMaze();
    drawScentOverlay();
    for(const g of ghosts) drawGhost(g);
    drawPacman();
    drawParticles();
    drawToasts(now);

    // Composite to screen
    screen.clearRect(0,0,WIDTH,HEIGHT);
    (function(){
      let split=0;
      if (shock.active){ const t=(performance.now()-shock.start)/shock.dur; if(t<1){ const f=1-Math.min(1,t); split = 1.6 * f; } }
      // Base image
      screen.drawImage(scene,0,0);
      if (split>0.01){ const drawTinted=(dx,dy,rgba)=>{ screen.save(); screen.globalCompositeOperation='lighter'; screen.globalAlpha=0.65; screen.drawImage(scene, dx, dy); screen.globalCompositeOperation='source-atop'; screen.fillStyle=rgba; screen.fillRect(0,0,WIDTH,HEIGHT); screen.restore(); }; drawTinted(split,0,'rgba(255,0,0,0.9)'); drawTinted(-split,0,'rgba(0,255,255,0.85)'); }
    })();
    drawLighting(now);
    drawGhostGlows(now);

    // Shockwave time dilatation window (first 200ms)
    if (shock.active){ const e = performance.now() - shock.start; timeScale = e < 200 ? 0.45 : 1; } else { timeScale = 1; }

    // Shockwave ring overlay
    drawShockwave(now);

    // Flash and iris overlays on screen
    if(flash.until>now){ screen.save(); screen.fillStyle=`rgba(255,255,255,${flash.strength*(flash.until-now)/240})`; screen.fillRect(0,0,WIDTH,HEIGHT); screen.restore(); }
    drawIris(now);

    requestAnimationFrame(loop);
  }

  resetPositions(false);
  requestAnimationFrame(loop);
})();
