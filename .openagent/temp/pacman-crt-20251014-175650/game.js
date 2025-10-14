(() => {
  'use strict';

  // Canvas setup: internal low resolution for retro look, scaled via CSS.
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');

  // Grid sizing: 28x31 classic-ish footprint; tile size chosen to hit 224x248 internal res.
  const TILE = 8;              // 8 px tile keeps it crisp and authentic
  const COLS = 28;
  const ROWS = 31;
  const WIDTH = COLS * TILE;   // 224
  const HEIGHT = ROWS * TILE;  // 248

  // Sanity: ensure canvas dimension matches our design.
  canvas.width = WIDTH;
  canvas.height = HEIGHT;

  // Colors inspired by arcade palette
  const COLORS = {
    wall: '#1a2aff',  // neon-ish blue
    pellet: '#ffe7a1',
    power: '#ffd28a',
    bg: '#000312',
    pacman: '#ffe12b',
    blinky: '#ff0000',
    pinky: '#ffb8ff',
    inky: '#00ffff',
    clyde: '#ffb852',
    eyes: '#ffffff',
    mouth: '#000',
    gate: '#8bd8ff'
  };

  // Map legend: '#' wall, '.' pellet, 'o' power pellet, ' ' path, '-' ghost gate, '=' empty
  // Layout is a classic-inspired 28x31 with a central house and tunnels.
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

  // The provided MAP has 26 rows. We need 31 rows for HEIGHT=248. We'll pad top and bottom.
  while (MAP.length < ROWS) {
    if (MAP.length % 2 === 0) MAP.unshift('############################');
    else MAP.push('############################');
  }

  // Utility helpers
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const rnd = (a, b) => Math.floor(Math.random() * (b - a + 1)) + a;

  function tileAt(x, y) { // x,y are tile coords
    if (y < 0 || y >= ROWS) return '#';
    if (x < 0 || x >= COLS) return '#';
    return MAP[y][x] || '#';
  }

  function isWall(t) { return t === '#'; }
  function isGate(t) { return t === '-'; }

  // Build pellet map separate from wall map (pellets disappear)
  const pellets = [];
  for (let y = 0; y < ROWS; y++) {
    pellets[y] = [];
    for (let x = 0; x < COLS; x++) {
      const ch = tileAt(x, y);
      pellets[y][x] = ch === '.' ? 1 : (ch === 'o' ? 2 : 0);
    }
  }

  // Gate positions (ghost house door)
  const gates = new Set();
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      if (tileAt(x, y) === '-') gates.add(y * COLS + x);
    }
  }

  // Estimate gate and house tiles
  let GATE_TILE = { x: 14, y: 12 };
  let HOUSE_TILE = { x: 14, y: 16 };
  if (gates.size) {
    let sx = 0, sy = 0, n = 0;
    for (const id of gates) { sx += id % COLS; sy += Math.floor(id / COLS); n++; }
    if (n > 0) { GATE_TILE = { x: Math.round(sx / n), y: Math.round(sy / n) }; }
  }

  function canWalk(x, y, ent) {
    const t = tileAt(x, y);
    if (isWall(t)) return false;
    if (isGate(t)) {
      // Pac-Man cannot pass the ghost gate; ghosts can after ready time.
      if (!ent) return false;
      if (ent.type === 'pacman') return false;
      // Eyes mode can always pass the gate to return home
      if (ent.mode === 'eyes') return true;
      return state.readyTime <= 0;
    }
    return true;
  }

  function neighbors(x, y, ent) {
    const res = [];
    if (canWalk(x + 1, y, ent)) res.push([x + 1, y, 'right']);
    if (canWalk(x - 1, y, ent)) res.push([x - 1, y, 'left']);
    if (canWalk(x, y + 1, ent)) res.push([x, y + 1, 'down']);
    if (canWalk(x, y - 1, ent)) res.push([x, y - 1, 'up']);
    return res;
  }

  function manhattan(ax, ay, bx, by) { return Math.abs(ax - bx) + Math.abs(ay - by); }

  // Entities
  const DIRS = {
    up:    { x: 0, y: -1 },
    down:  { x: 0, y:  1 },
    left:  { x: -1, y: 0 },
    right: { x:  1, y: 0 },
  };
  const OPP = { up: 'down', down: 'up', left: 'right', right: 'left' };

  // ----- Global game/state -----
  const state = {
    score: 0,
    lives: 3,
    pelletsRemaining: pellets.flat().filter(v => v > 0).length,
    frightenedUntil: 0,
    level: 1,
    readyTime: 180,    // frames until ghosts leave house
  };

  // Game flow state for death animation
  let gameState = 'playing'; // playing | dying | gameover
  const pacDeath = { active: false, start: 0, dur: 1100 }; // ms

  const hudScore = document.getElementById('score');
  const hudLives = document.getElementById('lives');

  function updateHUD() {
    hudScore.textContent = String(state.score);
    hudLives.innerHTML = '';
    for (let i = 0; i < state.lives; i++) {
      const life = document.createElement('span');
      life.style.display = 'inline-block';
      life.style.width = '10px';
      life.style.height = '10px';
      life.style.borderRadius = '50% 50% 0 50%';
      life.style.transform = 'rotate(45deg)';
      life.style.background = COLORS.pacman;
      life.style.boxShadow = '0 0 6px rgba(255, 225, 43, 0.6)';
      hudLives.appendChild(life);
    }
  }
  updateHUD();

  function wrapTunnel(px) {
    if (px < 0) return WIDTH - 1;
    if (px >= WIDTH) return 0;
    return px;
  }

  function toTile(px, py) { return [Math.floor(px / TILE), Math.floor(py / TILE)]; }
  function centerOf(tx, ty) { return [tx * TILE + TILE / 2, ty * TILE + TILE / 2]; }

  function makeEntity({ x, y, speed, dir, color, type }) {
    return {
      x, y, speed, dir, nextDir: dir,
      color, type,
      mode: 'normal',       // ghosts: 'normal' | 'eyes' | 'respawn' (Pac-Man ignores)
      respawnUntil: 0,
      dead: false,
    };
  }

  const pacman = makeEntity({ x: 14*TILE + TILE/2, y: 23*TILE + TILE/2, speed: 1.08, dir: 'left', color: COLORS.pacman, type: 'pacman' });

  // Ghost starting positions: inside or near the house
  const ghosts = [
    makeEntity({ x: 14*TILE + TILE/2, y: 14*TILE + TILE/2, speed: 0.96, dir: 'left',  color: COLORS.blinky, type: 'blinky' }),
    makeEntity({ x: 13*TILE + TILE/2, y: 16*TILE + TILE/2, speed: 0.94, dir: 'right', color: COLORS.pinky,  type: 'pinky'  }),
    makeEntity({ x: 14*TILE + TILE/2, y: 16*TILE + TILE/2, speed: 0.94, dir: 'left',  color: COLORS.inky,   type: 'inky'   }),
    makeEntity({ x: 15*TILE + TILE/2, y: 16*TILE + TILE/2, speed: 0.92, dir: 'right', color: COLORS.clyde,  type: 'clyde'  }),
  ];

  window.addEventListener('keydown', (e) => {
    if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key)) e.preventDefault();
    if (gameState !== 'playing') return;
    if (e.key === 'ArrowUp') pacman.nextDir = 'up';
    if (e.key === 'ArrowDown') pacman.nextDir = 'down';
    if (e.key === 'ArrowLeft') pacman.nextDir = 'left';
    if (e.key === 'ArrowRight') pacman.nextDir = 'right';
  }, { passive: false });

  function atTileCenter(ent) {
    const cx = (ent.x % TILE);
    const cy = (ent.y % TILE);
    const eps = 0.5;
    return Math.abs(cx - TILE/2) < eps && Math.abs(cy - TILE/2) < eps;
  }

  function tryTurn(ent, dir) {
    if (!atTileCenter(ent)) return false;
    const [tx, ty] = toTile(ent.x, ent.y);
    const d = DIRS[dir];
    const nx = tx + d.x;
    const ny = ty + d.y;
    if (canWalk(nx, ny, ent)) {
      ent.dir = dir;
      const [cx, cy] = centerOf(tx, ty);
      ent.x = cx; ent.y = cy;
      return true;
    }
    return false;
  }

  function stepEntity(ent) {
    if (ent.type === 'pacman' && ent.nextDir && ent.nextDir !== ent.dir) {
      tryTurn(ent, ent.nextDir);
    }

    const d = DIRS[ent.dir] || DIRS.left;
    const nx = ent.x + d.x * ent.speed;
    const ny = ent.y + d.y * ent.speed;
    const [ntx, nty] = toTile(nx, ny);
    const [ct, rt] = toTile(ent.x, ent.y);

    ent.x = wrapTunnel(nx);
    ent.y = ny;

    if (isWall(tileAt(ntx, nty)) || (isGate(tileAt(ntx, nty)) && (ent.type === 'pacman' || (ent.type !== 'pacman' && ent.mode !== 'eyes' && state.readyTime > 0)))) {
      const [cx, cy] = centerOf(ct, rt);
      ent.x = cx; ent.y = cy;
      if (ent.type === 'pacman') {
        if (ent.nextDir && ent.nextDir !== ent.dir) tryTurn(ent, ent.nextDir);
      }
    }
  }

  function eatPellets() {
    const [tx, ty] = toTile(pacman.x, pacman.y);
    if (pellets[ty] && pellets[ty][tx] === 1) {
      pellets[ty][tx] = 0;
      state.score += 10;
      state.pelletsRemaining--;
      updateHUD();
    } else if (pellets[ty] && pellets[ty][tx] === 2) {
      pellets[ty][tx] = 0;
      state.score += 50;
      state.pelletsRemaining--;
      state.frightenedUntil = performance.now() + 6000; // 6 seconds frightened
      updateHUD();
    }
  }

  function resetPositions(death) {
    pacman.x = 14*TILE + TILE/2; pacman.y = 23*TILE + TILE/2; pacman.dir = 'left'; pacman.nextDir = 'left';
    for (const g of ghosts) { g.mode = 'normal'; g.respawnUntil = 0; }
    ghosts[0].x = 14*TILE + TILE/2; ghosts[0].y = 14*TILE + TILE/2; ghosts[0].dir = 'left';
    ghosts[1].x = 13*TILE + TILE/2; ghosts[1].y = 16*TILE + TILE/2; ghosts[1].dir = 'right';
    ghosts[2].x = 14*TILE + TILE/2; ghosts[2].y = 16*TILE + TILE/2; ghosts[2].dir = 'left';
    ghosts[3].x = 15*TILE + TILE/2; ghosts[3].y = 16*TILE + TILE/2; ghosts[3].dir = 'right';
    if (death) state.readyTime = 120; else state.readyTime = 1200;
    const [itx, ity] = toTile(pacman.x, pacman.y);
    depositScentAt(itx, ity);
    lastPacTile = [itx, ity];
  }

  // ----- Scent system -----
  const SCENT_MAX = 1000;
  const SCENT_DECAY = 1;
  const scent = Array.from({ length: ROWS }, () => Array(COLS).fill(0));

  function depositScentAt(tx, ty) {
    if (tx < 0 || tx >= COLS || ty < 0 || ty >= ROWS) return;
    if (tileAt(tx, ty) === '#') return;
    scent[ty][tx] = SCENT_MAX;
  }

  function decayScent() {
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        const v = scent[y][x];
        if (v > 0) scent[y][x] = v - SCENT_DECAY <= 0 ? 0 : v - SCENT_DECAY;
      }
    }
  }

  function drawScentOverlay() {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        const s = scent[y][x];
        if (s <= 0) continue;
        const cx = x * TILE + TILE / 2;
        const cy = y * TILE + TILE / 2;
        const r = TILE * 0.6;
        const t = s / SCENT_MAX;
        const alpha = Math.min(0.02 + t * 0.4, 0.42);
        const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
        grad.addColorStop(0, `rgba(160,120,255,${alpha})`);
        grad.addColorStop(1, 'rgba(160,120,255,0)');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  // Track Pac-Man tile for scent deposition
  let lastPacTile = toTile(pacman.x, pacman.y);

  function chooseGhostDir(g, target) {
    if (!atTileCenter(g)) return; // keep going until next junction
    const [tx, ty] = toTile(g.x, g.y);

    // Eyes mode: beeline to the gate tile (ignore frightened)
    if (g.mode === 'eyes') {
      const choices = neighbors(tx, ty, g); // allow reverse if necessary
      let best = null, bestDist = Infinity;
      for (const [nx, ny, dir] of choices) {
        const d = manhattan(nx, ny, GATE_TILE.x, GATE_TILE.y);
        if (d < bestDist) { bestDist = d; best = dir; }
      }
      if (best) g.dir = best;
      return;
    }

    const opts = neighbors(tx, ty, g).filter(([, , dir]) => dir !== OPP[g.dir]);
    const choices = opts.length ? opts : neighbors(tx, ty, g);

    const now = performance.now();
    const frightened = now < state.frightenedUntil;

    if (frightened) {
      // Random choice, avoid reverse if possible
      const pool = choices.filter(([, , dir]) => dir !== OPP[g.dir]);
      const list = (pool.length ? pool : choices);
      if (list.length) {
        const pick = list[rnd(0, list.length - 1)];
        g.dir = pick[2];
      }
      return;
    }

    // Inky: scent follower (strongest local scent)
    if (g.type === 'inky') {
      let bestDir = null, bestVal = -1;
      for (const [nx, ny, dir] of choices) {
        const val = (scent[ny] && scent[ny][nx]) ? scent[ny][nx] : 0;
        if (val > bestVal) { bestVal = val; bestDir = dir; }
      }
      if (bestDir) { g.dir = bestDir; return; }
    }

    // Targeted choice: prefer direction minimizing manhattan distance
    let best = null;
    let bestDist = Infinity;
    for (const [nx, ny, dir] of choices) {
      const d = manhattan(nx, ny, target[0], target[1]);
      if (d < bestDist) { bestDist = d; best = dir; }
    }
    if (best) g.dir = best;
  }

  function ghostTarget(g) {
    const [px, py] = toTile(pacman.x, pacman.y);
    switch (g.type) {
      case 'blinky': return [px, py];
      case 'pinky':  return [clamp(px + 4 * DIRS[pacman.dir].x, 0, COLS-1), clamp(py + 4 * DIRS[pacman.dir].y, 0, ROWS-1)];
      case 'inky':   return [px, py]; // scent follower overrides when present
      case 'clyde':  return (manhattan(...toTile(g.x, g.y), px, py) > 8) ? [px, py] : [1, ROWS - 2];
      default:       return [px, py];
    }
  }

  function collides(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y) < TILE * 0.6;
  }

  function drawMaze() {
    ctx.fillStyle = COLORS.bg;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    ctx.strokeStyle = COLORS.wall;
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        const ch = tileAt(x, y);
        const px = x * TILE;
        const py = y * TILE;
        if (ch === '#') {
          ctx.fillStyle = 'rgba(12, 18, 80, 0.45)';
          ctx.fillRect(px, py, TILE, TILE);
          ctx.strokeStyle = COLORS.wall;
          ctx.strokeRect(px + 1, py + 1, TILE - 2, TILE - 2);
        }
        if (ch === '-') {
          ctx.strokeStyle = COLORS.gate;
          ctx.beginPath();
          ctx.moveTo(px + 1, py + TILE/2);
          ctx.lineTo(px + TILE - 1, py + TILE/2);
          ctx.stroke();
        }
      }
    }

    // Pellets
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        const p = pellets[y][x];
        if (p === 1) {
          ctx.fillStyle = COLORS.pellet;
          ctx.beginPath();
          ctx.arc(x * TILE + TILE/2, y * TILE + TILE/2, 1.2, 0, Math.PI * 2);
          ctx.fill();
        } else if (p === 2) {
          ctx.fillStyle = COLORS.power;
          ctx.beginPath();
          ctx.arc(x * TILE + TILE/2, y * TILE + TILE/2, 2.4, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
  }

  function drawPacman() {
    // Death animation: mouth closes and sprite shrinks into nothing
    if (pacDeath.active) {
      const elapsed = performance.now() - pacDeath.start;
      const k = clamp(elapsed / pacDeath.dur, 0, 1);
      const angle = ({right: 0, left: Math.PI, up: -Math.PI/2, down: Math.PI/2})[pacman.dir] || 0;
      const r = TILE * 0.45 * (1 - 0.9 * k);
      const mouth = Math.PI * (0.2 + 1.6 * k); // widens to a full slice then shrinks radius
      ctx.fillStyle = COLORS.pacman;
      ctx.beginPath();
      ctx.moveTo(pacman.x, pacman.y);
      ctx.arc(pacman.x, pacman.y, Math.max(0.1, r), angle + mouth, angle - mouth, true);
      ctx.closePath();
      ctx.fill();
      return;
    }

    const mouthOpen = Math.abs(Math.sin(performance.now() / 120)) * 0.7 + 0.2;
    const angle = ({right: 0, left: Math.PI, up: -Math.PI/2, down: Math.PI/2})[pacman.dir] || 0;

    ctx.fillStyle = COLORS.pacman;
    ctx.beginPath();
    ctx.moveTo(pacman.x, pacman.y);
    ctx.arc(pacman.x, pacman.y, TILE * 0.45, angle + mouthOpen, angle - mouthOpen, true);
    ctx.closePath();
    ctx.fill();
  }

  function drawGhost(g) {
    const now = performance.now();
    const frightened = now < state.frightenedUntil;

    // Eyes-only mode
    if (g.mode === 'eyes') {
      const baseX = g.x, baseY = g.y;
      ctx.fillStyle = COLORS.eyes;
      const eyeOffsetX = ({left:-3,right:3,up:0,down:0})[g.dir] || 0;
      const eyeOffsetY = ({up:-2,down:2,left:0,right:0})[g.dir] || 0;
      ctx.beginPath(); ctx.arc(baseX - 4, baseY - 2, 2.5, 0, Math.PI*2); ctx.fill();
      ctx.beginPath(); ctx.arc(baseX + 4, baseY - 2, 2.5, 0, Math.PI*2); ctx.fill();
      ctx.fillStyle = '#0033aa';
      ctx.beginPath(); ctx.arc(baseX - 4 + eyeOffsetX, baseY - 2 + eyeOffsetY, 1.2, 0, Math.PI*2); ctx.fill();
      ctx.beginPath(); ctx.arc(baseX + 4 + eyeOffsetX, baseY - 2 + eyeOffsetY, 1.2, 0, Math.PI*2); ctx.fill();
      return;
    }

    // Body
    const r = TILE * 0.45;
    const baseX = g.x, baseY = g.y;

    // Frightened flashing near expiry
    let bodyColor = g.color;
    if (frightened) {
      const rem = state.frightenedUntil - now;
      const blink = rem > 0 && rem < 1500 && (Math.floor(now / 125) % 2 === 0);
      bodyColor = blink ? '#ffffff' : '#1f4bd1';
    }

    ctx.fillStyle = bodyColor;
    ctx.beginPath();
    ctx.arc(baseX, baseY - r*0.2, r, Math.PI, 0);
    ctx.lineTo(baseX + r, baseY + r*0.8);
    const waves = 4;
    for (let i = waves; i >= 0; i--) {
      const wx = baseX - r + (i * (2*r)/waves);
      const wy = baseY + r*0.8 + (i % 2 === 0 ? 0 : 2);
      ctx.lineTo(wx, wy);
    }
    ctx.closePath();
    ctx.fill();

    // Eyes
    ctx.fillStyle = COLORS.eyes;
    const eyeOffsetX = ({left:-3,right:3,up:0,down:0})[g.dir] || 0;
    const eyeOffsetY = ({up:-2,down:2,left:0,right:0})[g.dir] || 0;
    ctx.beginPath(); ctx.arc(baseX - 4, baseY - 2, 2.5, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc(baseX + 4, baseY - 2, 2.5, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = '#0033aa';
    ctx.beginPath(); ctx.arc(baseX - 4 + eyeOffsetX, baseY - 2 + eyeOffsetY, 1.2, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc(baseX + 4 + eyeOffsetX, baseY - 2 + eyeOffsetY, 1.2, 0, Math.PI*2); ctx.fill();
  }

  let last = performance.now();

  function loop(now) {
    const dt = clamp((now - last) / (1000/60), 0.5, 2.0); // 60fps units
    last = now;

    if (state.readyTime > 0 && gameState === 'playing') state.readyTime -= 1;

    // Update
    if (gameState === 'playing') {
      stepEntity(pacman);
      // Scent: decay globally, deposit when entering a new tile
      decayScent();
      const [cpx, cpy] = toTile(pacman.x, pacman.y);
      if (cpx !== lastPacTile[0] || cpy !== lastPacTile[1]) {
        depositScentAt(cpx, cpy);
        lastPacTile = [cpx, cpy];
      }
      eatPellets();

      const frightened = now < state.frightenedUntil;

      for (const g of ghosts) {
        // Handle respawn hold inside house
        if (g.mode === 'respawn') {
          if (now >= g.respawnUntil) {
            g.mode = 'normal';
            g.dir = 'up';
          } else {
            continue; // stay put inside house
          }
        }

        const target = ghostTarget(g);
        chooseGhostDir(g, target);

        // Speed modifiers
        let s = g.speed;
        if (g.mode === 'eyes') s = g.speed * 1.3;
        else if (frightened) s = g.speed * 0.8;
        const prevSpeed = g.speed; g.speed = s;
        stepEntity(g);
        g.speed = prevSpeed;

        // Eyes reached house? switch to respawn
        if (g.mode === 'eyes') {
          const [gx, gy] = toTile(g.x, g.y);
          if (manhattan(gx, gy, HOUSE_TILE.x, HOUSE_TILE.y) <= 1) {
            // park inside house and respawn after delay
            const [cx, cy] = centerOf(HOUSE_TILE.x, HOUSE_TILE.y);
            g.x = cx; g.y = cy; g.dir = 'up';
            g.mode = 'respawn';
            g.respawnUntil = now + 1000; // 1s
          }
        }

        // Collisions
        if (g.mode !== 'eyes' && collides(pacman, g)) {
          if (frightened) {
            state.score += 200;
            updateHUD();
            // Convert to eyes; do not teleport
            g.mode = 'eyes';
          } else {
            // Pac-Man dies -> start death animation
            gameState = 'dying';
            pacDeath.active = true; pacDeath.start = now;
            break;
          }
        }
      }

      if (state.pelletsRemaining <= 0) {
        // Level complete: simple reset with a speed-up
        state.level += 1;
        state.frightenedUntil = 0;
        state.pelletsRemaining = 0;
        for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
          const ch = tileAt(x, y); if (ch === '.' || ch === 'o') state.pelletsRemaining++;
          pellets[y][x] = (ch === '.' ? 1 : ch === 'o' ? 2 : 0);
        }
        pacman.speed = Math.min(pacman.speed + 0.04, 1.4);
        for (const g of ghosts) g.speed = Math.min(g.speed + 0.03, 1.25);
        resetPositions(false);
      }
    } else if (gameState === 'dying') {
      // Progress death animation
      if (now - pacDeath.start >= pacDeath.dur) {
        pacDeath.active = false;
        state.lives -= 1; updateHUD();
        if (state.lives < 0) {
          gameState = 'gameover';
          // Simple reset after a moment
          setTimeout(() => {
            state.lives = 3; state.score = 0; updateHUD();
            for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
              const ch = tileAt(x, y); pellets[y][x] = (ch === '.' ? 1 : ch === 'o' ? 2 : 0);
            }
            resetPositions(false);
            gameState = 'playing';
          }, 800);
        } else {
          resetPositions(true);
          gameState = 'playing';
        }
      }
    }

    // Render
    drawMaze();
    drawScentOverlay();
    for (const g of ghosts) drawGhost(g);
    drawPacman();

    // Screen flash at start of death
    if (pacDeath.active) {
      const elapsed = performance.now() - pacDeath.start;
      const flash = Math.max(0, 1 - (elapsed / 200));
      if (flash > 0) {
        ctx.save();
        ctx.fillStyle = `rgba(255,255,255,${0.18 * flash})`;
        ctx.fillRect(0, 0, WIDTH, HEIGHT);
        ctx.restore();
      }
    }

    requestAnimationFrame(loop);
  }

  resetPositions(false);
  requestAnimationFrame(loop);
})();
