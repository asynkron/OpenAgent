import { TILE, DIRS } from './world.js';

export class GameEngine {
  constructor(world, renderer, onEvent) {
    this.world = world;
    this.renderer = renderer;
    this.onEvent = onEvent;

    this.acc = 0;
    this.last = 0;

    this.input = { up:false, down:false, left:false, right:false, wait:false, restart:false };

    this.tickRate = 1000/20; // 20 logic tps
    this.moveCooldown = 0; // regulate player move rate
    this.moveDelay = 1000/8; // 8 moves per second max

    this.onRestart = null;
    this.onNextLevel = null;

    window.addEventListener('keydown', (e) => this.key(e, true));
    window.addEventListener('keyup', (e) => this.key(e, false));
  }

  setWorld(w) { this.world = w; }

  key(e, down) {
    const k = e.key.toLowerCase();
    if (k === 'arrowup' || k === 'w') this.input.up = down;
    if (k === 'arrowdown' || k === 's') this.input.down = down;
    if (k === 'arrowleft' || k === 'a') this.input.left = down;
    if (k === 'arrowright' || k === 'd') this.input.right = down;
    if (k === ' ') this.input.wait = down;
    if (k === 'r' && down) this.input.restart = true;
    if (['arrowup','w','arrowdown','s','arrowleft','a','arrowright','d',' '].includes(k)) e.preventDefault();
  }

  frame(t) {
    if (!this.last) this.last = t;
    const dt = t - this.last; this.last = t;
    this.acc += dt;

    // regulate player movement cadence
    this.moveCooldown -= dt;

    while (this.acc >= this.tickRate) {
      this.acc -= this.tickRate;
      this.step(this.tickRate/1000);
    }

    this.renderer.draw(this.world);
  }

  step(dt) {
    const w = this.world;

    if (w.state === 'dead' || w.state === 'win') {
      if (this.input.restart) {
        this.input.restart = false;
        if (this.onRestart) this.onRestart();
      }
      return;
    }

    // handle input -> single move per delay
    let moved = false;
    if (this.moveCooldown <= 0) {
      const dir = this.inputDirection();
      if (dir) {
        moved = w.tryMovePlayer(dir);
        if (moved) this.moveCooldown = this.moveDelay;
      } else if (this.input.wait) {
        moved = true; // pass turn
        this.moveCooldown = this.moveDelay * 0.5;
      }
    }

    const event = w.update(dt);
    if (event && this.onEvent) this.onEvent(event.type, event.payload);

    if (w.state === 'win' && this.onNextLevel) {
      // brief pause then next level
      setTimeout(() => this.onNextLevel && this.onNextLevel(), 1200);
    }
  }

  inputDirection() {
    if (this.input.up && !this.input.down && !this.input.left && !this.input.right) return DIRS.UP;
    if (this.input.down && !this.input.up && !this.input.left && !this.input.right) return DIRS.DOWN;
    if (this.input.left && !this.input.right && !this.input.up && !this.input.down) return DIRS.LEFT;
    if (this.input.right && !this.input.left && !this.input.up && !this.input.down) return DIRS.RIGHT;
    return null;
  }
}
