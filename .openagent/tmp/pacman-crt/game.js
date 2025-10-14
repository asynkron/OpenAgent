/*
  Pac-Man CRT (lightweight HTML5/JS implementation)
  - 28x31 grid, 8px tiles => 224x248 base resolution
  - Canvas renders at native res; CSS scales up with pixelated look
  - Simple but spirited ghost AI with chase/scatter/frightened
*/

const TILE = 8;
const COLS = 28;
const ROWS = 31;
const W = COLS * TILE; // 224
const H = ROWS * TILE; // 248

// Utility
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const rand = (a, b) => a + Math.random() * (b - a);
const choice = arr => arr[(Math.random() * arr.length) | 0];

// Directions
const DIRS = {
  up: {x:0, y:-1},
  down: {x:0, y:1},
  left: {x:-1, y:0},
  right: {x:1, y:0}
};
const DIR_KEYS = Object.keys(DIRS);
const OPP = { up:'down', down:'up', left:'right', right:'left' };

// Level map ("#"=wall, "."=pellet, "o"=power pellet, " "=empty, "T"=tunnel)
// Symmetric, hand-made. Keep it simple but familiar.
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
  "#####..##### ## #####..#####",
  "#####.##            ##.#####",
  "#####.## ###====### ##.#####",
  "T   ..   #  GGGG  #   ..   T",
  "#####.## #  ----  # ##.#####",
  "#####.## #   __   # ##.#####",
  "#####.## ########## ##.#####",
  "#............##............#",
  "#.####.#####.##.#####.####.#",
  "#o..##................##..o#",
  "###.##.##.########.##.##.###",
  "#......##....##....##......#",
  "#.##########.##.##########.#",
  "#..........................#",
  "#.####.#####.##.#####.####.#",
  "#o####.......PP.......####o#",
  "#.####.##.########.##.####.#",
  "#......##....##....##......#",
  "#.##########.##.##########.#",
  "#..........................#",
  "############################",
];

// Normalize map rows to 28 columns
for (let r = 0; r < MAP.length; r++) {
  if (MAP[r].length < COLS) {
    MAP[r] = MAP[r] + ' '.repeat(COLS - MAP[r].length);
  } else if (MAP[r].length > COLS) {
    MAP[r] = MAP[r].slice(0, COLS);
  }
}

function tileAt(c, r) {
  if (c < 0 || c >= COLS || r < 0 || r >= ROWS) return '#';
  return MAP[r][c];
}
function isWall(c, r) { return tileAt(c, r) === '#'; }
function isTunnel(c, r) { return tileAt(c, r) === 'T'; }
function passable(c, r) { return !isWall(c, r); }

function pelletsRemaining() {
  let p = 0; let pow = 0;
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    const t = MAP[r][c];
    if (t === '.' || t === 'P') p++;
    if (t === 'o') pow++;
  }
  return p + pow;
}

// Canvas setup
const cvs = document.getElementById('game');
const ctx = cvs.getContext('2d');
ctx.imageSmoothingEnabled = false;

// Game state
const state = {
  score: 0,
  lives: 3,
  level: 1,
  mode: 'scatter', // scatter | chase | frightened
  modeTimer: 0,
  frightenedTimer: 0,
  tick: 0,
};

// Player and ghosts
function makeEntity(x, y, speed, dir='left') {
  return { x, y, dir, speed, nextDir: dir, alive:true, home:false, frightened:false, eyes:false, color:'#ff0' };
}

// Spawn positions (centered to tiles)
const spawnPac = { c: 14, r: 23 };
const spawnGhosts = [
  { c: 14, r: 14, color:'#f33' }, // Blinky-ish
  { c: 13, r: 14, color:'#0cf' }, // Inky-ish
  { c: 14, r: 15, color:'#f6a' }, // Pinky-ish
  { c: 15, r: 14, color:'#fa0' }, // Clyde-ish
];

const PAC = makeEntity(spawnPac.c * TILE + TILE/2, spawnPac.r * TILE + TILE/2, 60, 'left');
PAC.color = '#ff0';

const GHOSTS = spawnGhosts.map(g => {
  const e = makeEntity(g.c * TILE + TILE/2, g.r * TILE + TILE/2, 52, 'left');
  e.color = g.color; return e;
});

// Input
const keys = new Set();
window.addEventListener('keydown', (e) => {
  const k = e.key.toLowerCase();
  if (k === 'arrowup' || k === 'w') PAC.nextDir = 'up';
  if (k === 'arrowdown' || k === 's') PAC.nextDir = 'down';
  if (k === 'arrowleft' || k === 'a') PAC.nextDir = 'left';
  if (k === 'arrowright' || k === 'd') PAC.nextDir = 'right';
});

// WebAudio for tiny beeps
let audioCtx;
function ensureAudio() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
}
function beep(freq=880, dur=0.03, type='square', gain=0.02) {
  if (!audioCtx) return;
  const o = audioCtx.createOscillator();
  const g = audioCtx.createGain();
  o.type = type; o.frequency.value = freq;
  g.gain.value = gain; o.connect(g); g.connect(audioCtx.destination);
  o.start();
  o.stop(audioCtx.currentTime + dur);
}
window.addEventListener('pointerdown', ensureAudio, { once:true });
window.addEventListener('keydown', ensureAudio, { once:true });

// Helpers
function posToCR(x, y) { return { c: Math.floor(x / TILE), r: Math.floor(y / TILE) }; }
function centerOf(c, r) { return { x: c * TILE + TILE/2, y: r * TILE + TILE/2 }; }
function atCenter(x, y) { const {c, r} = posToCR(x, y); const cc = centerOf(c, r); return Math.abs(x-cc.x) < 0.5 && Math.abs(y-cc.y) < 0.5; }

function canGo(entity, dir) {
  const { x, y } = entity; const d = DIRS[dir];
  // Look slightly ahead from center to avoid corner clipping
  const nx = x + Math.sign(d.x) * 2;
  const ny = y + Math.sign(d.y) * 2;
  const { c, r } = posToCR(nx, ny);
  return passable(c, r);
}

function stepEntity(e, dt) {
  const speed = e.speed; // px/s
  const move = speed * dt;
  const d = DIRS[e.dir];
  let nx = e.x + d.x * move;
  let ny = e.y + d.y * move;
  // Tunnels wrap around horizontally
  if (ny > 0 && ny < H) {
    if (nx < -TILE/2) nx = W + TILE/2;
    if (nx > W + TILE/2) nx = -TILE/2;
  }
  // Wall collision: allow movement only if path ahead is passable. Snap to center at intersections.
  const { c, r } = posToCR(e.x, e.y);
  if (!passable(c + d.x, r + d.y) && atCenter(e.x, e.y)) {
    // blocked
    nx = e.x; ny = e.y;
  }
  e.x = nx; e.y = ny;
  // At center: try to turn if nextDir set and viable
  if (atCenter(e.x, e.y) && e.nextDir && e.nextDir !== e.dir) {
    if (canGo(e, e.nextDir)) {
      e.dir = e.nextDir;
      const cc = centerOf(c, r); e.x = cc.x; e.y = cc.y;
    }
  }
}

// Ghost targeting (simplified)
function targetForGhost(g, i) {
  // Modes: scatter moves to corners; chase heads to Pac; frightened random
  if (g.frightened) return centerOf(choice([1, COLS-2]), choice([1, ROWS-2]));
  if (state.mode === 'scatter') {
    const corners = [ [1,1], [COLS-2,1], [COLS-2,ROWS-2], [1,ROWS-2] ];
    const [c, r] = corners[i % corners.length];
    return centerOf(c, r);
  }
  // chase: rough lead based on Pac direction
  const lead = 4; const d = DIRS[PAC.dir] || {x:0,y:0};
  const tx = PAC.x + d.x * lead * TILE; const ty = PAC.y + d.y * lead * TILE;
  return { x: clamp(tx, TILE, W-TILE), y: clamp(ty, TILE, H-TILE) };
}

function availableDirs(e) {
  const { c, r } = posToCR(e.x, e.y);
  const dirs = [];
  for (const k of DIR_KEYS) {
    const d = DIRS[k];
    if (!passable(c + d.x, r + d.y)) continue;
    if (OPP[e.dir] === k) continue; // avoid immediate reversal unless forced
    dirs.push(k);
  }
  return dirs;
}

function chooseGhostDir(g, i) {
  if (!atCenter(g.x, g.y)) return; // only decide at intersections
  const dirs = availableDirs(g);
  if (!dirs.length) { g.dir = OPP[g.dir] || g.dir; return; }
  if (g.frightened) { g.dir = choice(dirs); return; }
  const target = targetForGhost(g, i);
  // pick dir minimizing Manhattan distance to target
  let best = g.dir; let bestDist = Infinity;
  for (const k of dirs) {
    const d = DIRS[k];
    const nx = g.x + d.x * TILE, ny = g.y + d.y * TILE;
    const dist = Math.abs(nx - target.x) + Math.abs(ny - target.y);
    if (dist < bestDist) { bestDist = dist; best = k; }
  }
  g.dir = best;
}

function eatAt(c, r) {
  const t = tileAt(c, r);
  if (t === '.') { // pellet
    MAP[r] = MAP[r].substring(0, c) + ' ' + MAP[r].substring(c+1);
    state.score += 10; beep(840, 0.02, 'square', 0.01);
  } else if (t === 'P') { // big pellet alias if present
    MAP[r] = MAP[r].substring(0, c) + ' ' + MAP[r].substring(c+1);
    state.score += 100; enterFrightened();
  } else if (t === 'o') { // power pellet
    MAP[r] = MAP[r].substring(0, c) + ' ' + MAP[r].substring(c+1);
    state.score += 50; enterFrightened();
  }
}

function enterFrightened() {
  state.mode = 'frightened';
  state.frightenedTimer = 6; // seconds
  for (const g of GHOSTS) { g.frightened = true; }
  beep(200, 0.3, 'sawtooth', 0.01);
}

function updateModes(dt) {
  if (state.mode === 'frightened') {
    state.frightenedTimer -= dt;
    if (state.frightenedTimer <= 0) {
      state.mode = 'chase';
      for (const g of GHOSTS) g.frightened = false;
    }
    return;
  }
  state.modeTimer += dt;
  // Simple scatter/chase cycle
  const cycle = [7, 20]; // seconds scatter -> chase
  const total = cycle[0] + cycle[1];
  const t = state.modeTimer % total;
  const newMode = (t < cycle[0]) ? 'scatter' : 'chase';
  if (newMode !== state.mode) {
    state.mode = newMode;
    // allow reversal on mode switch by clearing opposite restriction once
    for (const g of GHOSTS) { g.dir = OPP[g.dir] || g.dir; }
  }
}

function resetPositions() {
  PAC.x = spawnPac.c * TILE + TILE/2; PAC.y = spawnPac.r * TILE + TILE/2; PAC.dir = 'left'; PAC.nextDir = 'left';
  const starts = spawnGhosts;
  GHOSTS.forEach((g, i) => {
    g.x = starts[i].c * TILE + TILE/2; g.y = starts[i].r * TILE + TILE/2; g.dir = 'left'; g.frightened = false; g.eyes = false;
  });
}

function loseLife() {
  state.lives -= 1; beep(120, 0.4, 'triangle', 0.02);
  resetPositions();
  if (state.lives <= 0) {
    // simple reset
    state.lives = 3; state.score = 0; state.level = 1;
    // reload pellets (rebuild map: replace blanks with pellets on a copy of base?)
    // For simplicity, just reload page map by reconstructing from baked copy.
    window.location.reload();
  }
}

function circleIntersects(ax, ay, ar, bx, by, br) {
  const dx = ax - bx, dy = ay - by; const rr = ar + br; return (dx*dx + dy*dy) <= rr*rr;
}

function update(dt) {
  state.tick += 1;
  updateModes(dt);

  // Pac move
  stepEntity(PAC, dt);
  // Eat pellets
  const { c: pc, r: pr } = posToCR(PAC.x, PAC.y);
  if (atCenter(PAC.x, PAC.y)) eatAt(pc, pr);

  // Ghost decisions + moves
  GHOSTS.forEach((g, i) => { chooseGhostDir(g, i); stepEntity(g, dt); });

  // Collisions with ghosts
  for (const g of GHOSTS) {
    if (circleIntersects(PAC.x, PAC.y, 5, g.x, g.y, 5)) {
      if (g.frightened) { // eat ghost
        g.frightened = false; g.eyes = true; state.score += 200; beep(300, 0.1, 'square', 0.02);
        // send eyes home
        g.dir = 'left';
      } else if (!g.eyes) {
        loseLife(); return;
      }
    }
  }
}

// Drawing
function drawMaze() {
  // Background
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
  // Walls
  ctx.strokeStyle = '#2af';
  ctx.lineWidth = 2; ctx.lineCap = 'round';
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (MAP[r][c] === '#') {
        // draw small rounded rect blocks
        ctx.fillStyle = '#02284a';
        ctx.fillRect(c*TILE, r*TILE, TILE, TILE);
        ctx.strokeStyle = '#2af';
        ctx.strokeRect(c*TILE+0.5, r*TILE+0.5, TILE-1, TILE-1);
      }
    }
  }
  // Pellets
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const t = MAP[r][c];
      if (t === '.' || t === 'P') {
        ctx.fillStyle = '#fff8';
        ctx.beginPath(); ctx.arc(c*TILE + TILE/2, r*TILE + TILE/2, 1.2, 0, Math.PI*2); ctx.fill();
      }
      if (t === 'o') {
        ctx.fillStyle = '#fff';
        const flick = (state.tick >> 3) % 2 === 0 ? 2.5 : 1.8;
        ctx.beginPath(); ctx.arc(c*TILE + TILE/2, r*TILE + TILE/2, flick, 0, Math.PI*2); ctx.fill();
      }
    }
  }
}

function drawPac() {
  const t = performance.now() * 0.01;
  const mouth = 0.25 + 0.15 * Math.sin(t);
  ctx.fillStyle = '#ff0';
  ctx.beginPath();
  let start = 0, end = Math.PI*2;
  if (PAC.dir === 'right') { start = mouth; end = Math.PI*2 - mouth; }
  if (PAC.dir === 'left')  { start = Math.PI + mouth; end = Math.PI - mouth; }
  if (PAC.dir === 'up')    { start = -Math.PI/2 + mouth; end = Math.PI/2 - mouth; }
  if (PAC.dir === 'down')  { start = Math.PI/2 + mouth; end = -Math.PI/2 - mouth; }
  ctx.moveTo(PAC.x, PAC.y);
  ctx.arc(PAC.x, PAC.y, 6, start, end, false);
  ctx.closePath(); ctx.fill();
}

function drawGhost(g) {
  const r = 6; const x = g.x, y = g.y;
  // Body
  ctx.fillStyle = g.frightened ? '#22f' : g.color;
  ctx.beginPath();
  ctx.moveTo(x - r, y);
  ctx.arc(x, y, r, Math.PI, 0, false);
  // frills
  const n = 4;
  for (let i=0; i<=n; i++) {
    const px = x - r + (2*r/n)*i;
    const py = y + r - (i%2===0 ? 0 : 2);
    ctx.lineTo(px, py);
  }
  ctx.closePath(); ctx.fill();
  // Eyes
  ctx.fillStyle = '#fff';
  ctx.beginPath(); ctx.arc(x-3, y, 2, 0, Math.PI*2); ctx.arc(x+3, y, 2, 0, Math.PI*2); ctx.fill();
  ctx.fillStyle = g.frightened ? '#fff' : '#00f';
  const d = DIRS[g.dir] || {x:0,y:0};
  ctx.beginPath(); ctx.arc(x-3 + d.x, y + d.y, 1, 0, Math.PI*2); ctx.arc(x+3 + d.x, y + d.y, 1, 0, Math.PI*2); ctx.fill();
}

function drawHUD() {
  ctx.fillStyle = '#0ff';
  ctx.font = '8px monospace';
  ctx.fillText(`SCORE ${state.score}`, 4, 10);
  ctx.fillText(`LIVES ${state.lives}`, W-70, 10);
  // Mode indicator (debuggy)
  ctx.fillStyle = '#08f'; ctx.fillText(state.mode.toUpperCase(), W/2 - 20, 10);
}

function render() {
  drawMaze();
  drawPac();
  for (const g of GHOSTS) drawGhost(g);
  drawHUD();
}

// Main loop with fixed step
let last = performance.now();
let acc = 0;
const STEP = 1/120; // physics step
function frame(now) {
  const dt = (now - last) / 1000; last = now; acc += dt;
  // cap to avoid spiral of death
  if (acc > 0.25) acc = 0.25;
  while (acc >= STEP) { update(STEP); acc -= STEP; }
  render();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// Instructions overlay (console)
console.log('%cPac-Man CRT', 'color:#0cf; font-size:16px');
console.log('Use arrow keys or WASD. Click once to enable audio.');
