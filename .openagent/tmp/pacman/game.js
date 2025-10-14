// Pac-Man — CRT Edition (MVP)
// Single-file, no assets. Canvas size 224×288 (HUD + 28×31 tiles @ 8px).

const TILE = 8;
const COLS = 28;
const ROWS = 31;
const HUD_H = 40; // top UI area
const W = COLS * TILE;
const H = HUD_H + ROWS * TILE;

const DIR = {
  NONE: { x: 0, y: 0 },
  LEFT: { x: -1, y: 0 },
  RIGHT: { x: 1, y: 0 },
  UP: { x: 0, y: -1 },
  DOWN: { x: 0, y: 1 },
};

const KEYS = new Set();
window.addEventListener('keydown', (e) => {
  if (["ArrowLeft","ArrowRight","ArrowUp","ArrowDown"," "," "] .includes(e.key)) e.preventDefault();
  KEYS.add(e.key.toLowerCase());
});
window.addEventListener('keyup', (e) => KEYS.delete(e.key.toLowerCase()));

// Simple WebAudio beeps (pellet, power, eat-ghost)
const AudioCtx = window.AudioContext || window.webkitAudioContext;
let audioCtx = null; let muted = false;
function ping(freq=440, dur=0.05, gain=0.02) {
  if (muted) return;
  audioCtx = audioCtx || new AudioCtx();
  const o = audioCtx.createOscillator();
  const g = audioCtx.createGain();
  o.type = 'square'; o.frequency.value = freq; g.gain.value = gain;
  o.connect(g).connect(audioCtx.destination);
  o.start(); o.stop(audioCtx.currentTime + dur);
}

// Map legend: '#' wall, '.' pellet, 'o' power pellet, '-' ghost door (Pac-Man blocked), ' ' empty.
const MAP = [
  "############################",
  "#............##............#",
  "#.####.#####.##.#####.####.#",
  "#o####.#####.##.#####.####o#",
  "#.####.#####.##.#####.####.#",
  "#..........................#",
  "#.####.##.########.##.####.#",
  "#.####.##.########.##.####.#",
  "#......##....##....##......#",
  "######.##### ## #####.######",
  "######.##### ## #####.######",
  "######.##          ##.######",
  "######.## ###--### ##.######",
  "######.## #       # ##.######",
  "######.## #       # ##.######",
  "######.## ###--### ##.######",
  "######.##          ##.######",
  "######.## ######## ##.######",
  "#............##............#",
  "#.####.#####.##.#####.####.#",
  "#o..##................##..o#",
  "######.##.########.##.######",
  "######.##.########.##.######",
  "#......##....##....##......#",
  "#.##########.##.##########.#",
  "#.##########.##.##########.#",
  "#..........................#",
  "#.####.#####.##.#####.####.#",
  "#o####.#####.##.#####.####o#",
  "#..........................#",
  "############################",
];

function inBounds(c, r) { return c >= 0 && c < COLS && r >= 0 && r < ROWS; }
function cell(c, r) { if (!inBounds(c,r)) return '#'; return MAP[r][c]; }
function isWall(c, r) { return cell(c, r) === '#'; }
function isDoor(c, r) { return cell(c, r) === '-'; }
function isWalkableForPac(c, r) {
  const ch = cell(c, r);
  if (ch === '#') return false;
  if (ch === '-') return false; // Pac-Man can't pass door
  return true;
}
function isWalkableForGhost(c, r) {
  const ch = cell(c, r);
  if (ch === '#') return false;
  return true; // door allowed for ghosts
}

// Utility
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const dist2 = (ax,ay,bx,by) => (ax-bx)*(ax-bx)+(ay-by)*(ay-by);
function rnd(n) { return Math.floor(Math.random()*n); }

// Canvas setup
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
canvas.width = W; canvas.height = H;

// Game State
let score = 0; let hiscore = 0; let lives = 3; let level = 1;
let pelletsLeft = 0;
let state = 'READY'; // READY, PLAY, DEAD, GAMEOVER
let readyTimer = 1200; // ms before PLAY
let paused = false;
let frightenedLeft = 0; // ms of frightened mode
let eatStreak = 0; // ghost-eaten streak within one power pellet

// Input buffer for smooth turns
let desired = DIR.NONE;

// Entity base
class Entity {
  constructor(x, y, color) {
    this.x = x; this.y = y; // pixel coords, playfield origin at y=HUD_H
    this.dir = DIR.LEFT; this.speed = 60; // px/s
    this.color = color;
    this.scatter = { c: 1, r: 1 }; // default target corner
    this.name = 'ghost';
  }
  center() { return { x: this.x, y: this.y }; }
  tile() { return { c: Math.floor(this.x / TILE), r: Math.floor((this.y - HUD_H) / TILE) }; }
  atCenter() { return (this.x % TILE === 0) && ((this.y - HUD_H) % TILE === 0); }
  canMove(dir, forGhost=false) {
    const nx = this.x + dir.x; const ny = this.y + dir.y;
    const cNext = Math.floor((nx + (dir.x>0?TILE-1:0)) / TILE);
    const rNext = Math.floor(((ny - HUD_H) + (dir.y>0?TILE-1:0)) / TILE);
    if (!inBounds(cNext, rNext)) return true; // allow wrap, handled later
    return forGhost ? isWalkableForGhost(cNext, rNext) : isWalkableForPac(cNext, rNext);
  }
  move(dt, forGhost=false) {
    const speed = this.speed;
    let nx = this.x + this.dir.x * speed * dt;
    let ny = this.y + this.dir.y * speed * dt;
    // Wrap tunnels
    if (nx < -TILE) nx = (COLS * TILE - 1);
    if (nx >= (COLS * TILE)) nx = -1;
    // Wall collision: clamp to tile edge
    const c = Math.floor(nx / TILE);
    const r = Math.floor((ny - HUD_H) / TILE);
    if (inBounds(c, r)) {
      const aheadC = Math.floor((nx + (this.dir.x>0?TILE-1:0)) / TILE);
      const aheadR = Math.floor(((ny - HUD_H) + (this.dir.y>0?TILE-1:0)) / TILE);
      const walkable = forGhost ? isWalkableForGhost(aheadC, aheadR) : isWalkableForPac(aheadC, aheadR);
      if (!walkable) {
        // Snap to center of current tile
        if (this.dir.x !== 0) nx = Math.round(this.x / TILE) * TILE;
        if (this.dir.y !== 0) ny = Math.round((this.y - HUD_H) / TILE) * TILE + HUD_H;
      }
    }
    this.x = nx; this.y = ny;
  }
}

// Pac-Man
class Pacman extends Entity {
  constructor(x, y) { super(x, y, '#ffe700'); this.name = 'pacman'; this.speed = 70; }
  draw(t) {
    const { x, y } = this.center();
    const mouth = (Math.sin(t * 12) * 0.25 + 0.35) * Math.PI; // open/close
    let angle = 0;
    if (this.dir === DIR.RIGHT) angle = 0;
    if (this.dir === DIR.LEFT) angle = Math.PI;
    if (this.dir === DIR.UP) angle = -Math.PI/2;
    if (this.dir === DIR.DOWN) angle = Math.PI/2;
    ctx.fillStyle = this.color;
    ctx.beginPath();
    ctx.moveTo(x+TILE/2, y+TILE/2);
    ctx.arc(x+TILE/2, y+TILE/2, TILE*0.85/2, angle+mouth/2, angle - mouth/2, true);
    ctx.closePath();
    ctx.fill();
  }
}

// Ghosts
class Ghost extends Entity {
  constructor(x, y, color, behavior) {
    super(x, y, color); this.behavior = behavior; this.baseSpeed = 62; this.speed = 62;
    this.name = behavior.name; this.home = behavior.home; this.exitDelay = behavior.exitDelay || 0;
    this.time = 0; this.inside = behavior.inside || false;
  }
  chooseDir(pac, frightened) {
    if (!this.atCenter()) return; // only decide at intersections
    const { c, r } = this.tile();
    const dirs = [DIR.LEFT, DIR.RIGHT, DIR.UP, DIR.DOWN];
    const oppos = { LEFT: DIR.RIGHT, RIGHT: DIR.LEFT, UP: DIR.DOWN, DOWN: DIR.UP };

    const allowed = dirs.filter(d => {
      // avoid reversing unless forced or frightened
      if (!frightened && ((this.dir === DIR.LEFT && d===DIR.RIGHT) || (this.dir===DIR.RIGHT && d===DIR.LEFT) || (this.dir===DIR.UP && d===DIR.DOWN) || (this.dir===DIR.DOWN && d===DIR.UP))) return false;
      const nc = c + d.x; const nr = r + d.y;
      return inBounds(nc, nr) ? isWalkableForGhost(nc, nr) : true; // allow wrap
    });

    if (allowed.length === 0) { this.dir = { x: -this.dir.x, y: -this.dir.y }; return; }

    let target;
    if (frightened) {
      this.dir = allowed[rnd(allowed.length)];
      return;
    } else if (this.behavior && this.behavior.target) {
      target = this.behavior.target(pac, this);
    } else {
      target = { x: pac.x, y: pac.y };
    }

    // Pick dir that minimizes distance to target
    let best = allowed[0]; let bestD = Infinity;
    for (const d of allowed) {
      const tx = (c + d.x) * TILE + TILE/2;
      const ty = HUD_H + (r + d.y) * TILE + TILE/2;
      const dd = dist2(tx, ty, target.x, target.y);
      if (dd < bestD) { bestD = dd; best = d; }
    }
    this.dir = best;
  }
  draw() {
    const x = this.x + TILE/2; const y = this.y + TILE/2;
    const bodyR = TILE*0.85/2;
    ctx.fillStyle = this.color;
    // Body
    ctx.beginPath();
    ctx.arc(x, y, bodyR, Math.PI, 0);
    ctx.lineTo(x + bodyR, y + bodyR);
    for (let i=2;i>=-2;i--) {
      ctx.quadraticCurveTo(x + (i+0.5)*(bodyR/2), y + bodyR*1.1, x + i*(bodyR/2), y + bodyR);
    }
    ctx.closePath();
    ctx.fill();
    // Eyes
    ctx.fillStyle = '#fff';
    const ex = x + this.dir.x * 2; const ey = y + this.dir.y * 2;
    ctx.beginPath(); ctx.arc(x - 3, y - 1, 2.5, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc(x + 3, y - 1, 2.5, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = '#00f';
    ctx.beginPath(); ctx.arc(x - 3 + this.dir.x*1.5, y - 1 + this.dir.y*1.5, 1.2, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc(x + 3 + this.dir.x*1.5, y - 1 + this.dir.y*1.5, 1.2, 0, Math.PI*2); ctx.fill();
  }
}

// Initial positions (approximate arcade positions)
function tileToPx(c, r) { return { x: c*TILE, y: HUD_H + r*TILE }; }
const PAC_START = tileToPx(13, 23); // near center-bottom
const GHOST_HOUSE = tileToPx(13, 14);

const pac = new Pacman(PAC_START.x, PAC_START.y);

const ghosts = [
  new Ghost(GHOST_HOUSE.x, GHOST_HOUSE.y, '#ff0000', {
    name: 'blinky', home: { x: 26*TILE, y: HUD_H + 1*TILE }, target: (p) => p.center(), exitDelay: 0, inside: false,
  }),
  new Ghost(GHOST_HOUSE.x - TILE*2, GHOST_HOUSE.y, '#ffb8ff', {
    name: 'pinky', home: { x: 1*TILE, y: HUD_H + 1*TILE }, target: (p) => ({ x: p.x + p.dir.x*4*TILE, y: p.y + p.dir.y*4*TILE }), exitDelay: 1500, inside: true,
  }),
  new Ghost(GHOST_HOUSE.x + TILE*2, GHOST_HOUSE.y, '#00ffff', {
    name: 'inky', home: { x: 26*TILE, y: HUD_H + 29*TILE }, target: (p,g) => ({ x: p.x + (Math.random()*2-1)*4*TILE, y: p.y + (Math.random()*2-1)*4*TILE }), exitDelay: 3000, inside: true,
  }),
  new Ghost(GHOST_HOUSE.x, GHOST_HOUSE.y + TILE*2, '#ffb852', {
    name: 'clyde', home: { x: 1*TILE, y: HUD_H + 29*TILE }, target: (p,g) => {
      const d2 = dist2(p.x,p.y,g.x,g.y); return d2 < (8*TILE)*(8*TILE) ? g.home : p.center();
    }, exitDelay: 4500, inside: true,
  }),
];

// Pellet tracking
const pellets = new Map();
for (let r=0;r<ROWS;r++) {
  for (let c=0;c<COLS;c++) {
    const ch = MAP[r][c];
    if (ch === '.' || ch === 'o') {
      const key = `${c},${r}`; pellets.set(key, ch);
      pelletsLeft++;
    }
  }
}

function resetPositions() {
  const p = tileToPx(13, 23); pac.x=p.x; pac.y=p.y; pac.dir=DIR.LEFT; desired=DIR.NONE;
  const gh = [
    { x:GHOST_HOUSE.x, y:GHOST_HOUSE.y, d:DIR.LEFT },
    { x:GHOST_HOUSE.x - TILE*2, y:GHOST_HOUSE.y, d:DIR.RIGHT },
    { x:GHOST_HOUSE.x + TILE*2, y:GHOST_HOUSE.y, d:DIR.LEFT },
    { x:GHOST_HOUSE.x, y:GHOST_HOUSE.y + TILE*2, d:DIR.UP },
  ];
  ghosts.forEach((g,i)=>{ g.x=gh[i].x; g.y=gh[i].y; g.dir=gh[i].d; g.inside = i>0; g.time=0; g.speed=g.baseSpeed; });
}
resetPositions();

// Input handling
function updateDesiredFromKeys() {
  if (KEYS.has('arrowleft') || KEYS.has('a')) desired = DIR.LEFT;
  else if (KEYS.has('arrowright') || KEYS.has('d')) desired = DIR.RIGHT;
  else if (KEYS.has('arrowup') || KEYS.has('w')) desired = DIR.UP;
  else if (KEYS.has('arrowdown') || KEYS.has('s')) desired = DIR.DOWN;
  if (KEYS.has('p')) paused = true;
}
window.addEventListener('keydown', (e) => {
  if (e.key.toLowerCase() === 'p') { paused = !paused; }
  if (e.key.toLowerCase() === 'm') { muted = !muted; }
});

// Gameplay helpers
function tryTurn(entity, dir, forGhost=false) {
  if (!entity.atCenter()) return false;
  const { c, r } = entity.tile();
  const nc = c + dir.x; const nr = r + dir.y;
  const walk = forGhost ? isWalkableForGhost(nc, nr) : isWalkableForPac(nc, nr);
  if (walk) { entity.dir = dir; return true; }
  return false;
}

function eatAtTile(c, r) {
  const key = `${c},${r}`;
  if (pellets.has(key)) {
    const ch = pellets.get(key);
    pellets.delete(key);
    pelletsLeft--;
    if (ch === '.') { score += 10; ping(680, 0.02, 0.015); }
    if (ch === 'o') { score += 50; frightenedLeft = 6000; eatStreak = 0; ping(280, 0.15, 0.03); }
    hiscore = Math.max(hiscore, score);
  }
}

function updateGhosts(dt) {
  const frightened = frightenedLeft > 0;
  ghosts.forEach((g, idx) => {
    g.time += dt*1000;
    g.speed = frightened ? g.baseSpeed*0.6 : g.baseSpeed;

    // Exit house after delay
    if (g.inside && g.time*1000 > g.behavior.exitDelay) {
      // Move upwards toward door
      const { c, r } = g.tile();
      if (MAP[r-1][c] !== '#') { g.dir = DIR.UP; }
      if (r <= 13) g.inside = false; // crude exit condition
    }

    // Decide turns
    g.chooseDir(pac, frightened);
    // Move
    g.move(dt, true);
  });
}

function checkCollisions() {
  const px = pac.x + TILE/2; const py = pac.y + TILE/2;
  for (const g of ghosts) {
    const gx = g.x + TILE/2; const gy = g.y + TILE/2;
    const d2 = dist2(px, py, gx, gy);
    const rad = TILE*0.8;
    if (d2 < rad*rad) {
      if (frightenedLeft > 0) {
        // Eat ghost
        eatStreak = Math.min(eatStreak+1, 4);
        const points = 200 * (1 << (eatStreak-1));
        score += points; hiscore = Math.max(hiscore, score); ping(180, 0.2, 0.05);
        // Send ghost back to house
        g.x = GHOST_HOUSE.x; g.y = GHOST_HOUSE.y; g.inside = true; g.time = 0; g.dir = DIR.UP;
      } else if (state === 'PLAY') {
        state = 'DEAD';
      }
    }
  }
}

function update(dt) {
  if (paused) return;
  if (state === 'READY') {
    readyTimer -= dt*1000;
    if (readyTimer <= 0) state = 'PLAY';
    return;
  }
  if (state === 'DEAD') {
    lives--;
    if (lives <= 0) { state = 'GAMEOVER'; return; }
    frightenedLeft = 0; eatStreak = 0; readyTimer = 1500; state = 'READY';
    resetPositions();
    return;
  }
  if (state !== 'PLAY') return;

  updateDesiredFromKeys();

  // Pac-Man turning logic
  if (desired !== DIR.NONE) tryTurn(pac, desired, false);

  // Pac-Man move
  pac.move(dt, false);

  // Pellet eat when at center of tile
  if (pac.atCenter()) {
    const { c, r } = pac.tile();
    eatAtTile(c, r);
  }

  // Ghosts
  updateGhosts(dt);

  // Collisions
  checkCollisions();

  // Frightened timer and end-of-level
  if (frightenedLeft > 0) frightenedLeft -= dt*1000;
  if (pelletsLeft <= 0) {
    level++;
    // Reset map pellets for next level (simple way: rebuild from MAP)
    pellets.clear(); pelletsLeft = 0;
    for (let r=0;r<ROWS;r++) for (let c=0;c<COLS;c++) { const ch = MAP[r][c]; if (ch==='.'||ch==='o'){ pellets.set(`${c},${r}`, ch); pelletsLeft++; }}
    readyTimer = 1500; state = 'READY'; resetPositions();
  }
}

function drawGrid() {
  // Background
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, W, H);

  // HUD
  ctx.fillStyle = '#fff';
  ctx.font = '10px monospace';
  ctx.textBaseline = 'top';
  ctx.fillText(`SCORE  ${score.toString().padStart(6,'0')}`, 8, 8);
  ctx.fillText(`HI  ${hiscore.toString().padStart(6,'0')}`, 120, 8);
  // Lives
  for (let i=0;i<lives;i++) {
    ctx.fillStyle = '#ffe700';
    const x = 8 + i*12; const y = 22;
    ctx.beginPath(); ctx.arc(x, y, 4, 0.25*Math.PI, 1.75*Math.PI); ctx.lineTo(x,y); ctx.closePath(); ctx.fill();
  }

  // Map walls
  for (let r=0;r<ROWS;r++) {
    for (let c=0;c<COLS;c++) {
      const ch = MAP[r][c];
      const x = c*TILE; const y = HUD_H + r*TILE;
      if (ch === '#') {
        ctx.fillStyle = '#1823ff'; // retro blue walls
        ctx.fillRect(x, y, TILE, TILE);
      }
      if (ch === '.') {
        ctx.fillStyle = '#ffd6a0';
        ctx.beginPath(); ctx.arc(x+TILE/2, y+TILE/2, 1.2, 0, Math.PI*2); ctx.fill();
      }
      if (ch === 'o') {
        ctx.fillStyle = '#fff5cc';
        const pulse = (Math.sin(perfNow*4)+1)/2; const rads = 2.0 + pulse*0.8;
        ctx.beginPath(); ctx.arc(x+TILE/2, y+TILE/2, rads, 0, Math.PI*2); ctx.fill();
      }
      if (ch === '-') {
        ctx.fillStyle = '#ff9dbb';
        ctx.fillRect(x, y + TILE/2-1, TILE, 2); // door as thin bar
      }
    }
  }
}

let last = performance.now();
let perfNow = 0;
function loop(now) {
  perfNow = (now/1000);
  const dt = clamp((now - last)/1000, 0, 0.05); last = now;
  if (!paused) update(dt);

  drawGrid();

  // Draw entities
  const frightened = frightenedLeft > 0;
  if (frightened && Math.floor(now/120)%2===0) {
    // ghosts blink to indicate frightened
    ghosts.forEach(g=>{ ctx.globalAlpha = 0.7; ctx.fillStyle = '#2233ff'; g.draw(); ctx.globalAlpha = 1; });
  } else {
    ghosts.forEach(g=>g.draw());
  }
  pac.draw(now/1000);

  // Overlays: state labels
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 12px monospace';
  ctx.textAlign = 'center';
  if (state === 'READY') ctx.fillText('READY!', W/2, HUD_H + 14*TILE);
  if (state === 'GAMEOVER') ctx.fillText('GAME  OVER', W/2, HUD_H + 14*TILE);

  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

// Clicking or pressing a key starts AudioCtx (browser policy)
window.addEventListener('pointerdown', ()=>{ if (!audioCtx && !muted) audioCtx = new AudioCtx(); });
window.addEventListener('keydown', ()=>{ if (!audioCtx && !muted) audioCtx = new AudioCtx(); });
