export const TILE = {
  EMPTY: 0,
  DIRT: 1,
  WALL: 2,
  STEEL: 3,
  BOULDER: 4,
  GEM: 5,
  EXIT_CLOSED: 6,
  EXIT_OPEN: 7,
};

export const DIRS = {
  UP: {x:0,y:-1}, DOWN: {x:0,y:1}, LEFT: {x:-1,y:0}, RIGHT: {x:1,y:0}
};

export function createWorld(levelDef) {
  const rows = levelDef.map.trim().split('\n');
  const height = rows.length; const width = rows[0].length;
  const tilesize = 16;
  const t = new Uint8Array(width*height);
  const falling = new Uint8Array(width*height); // 0/1 state for falling boulders/gems
  let player = {x:1,y:1};
  let gemsTotal = 0;
  for (let y=0;y<height;y++){
    for(let x=0;x<width;x++){
      const ch = rows[y][x];
      let id = TILE.EMPTY;
      if (ch === '#') id = TILE.WALL;
      else if (ch === 'X') id = TILE.STEEL;
      else if (ch === '.') id = TILE.DIRT;
      else if (ch === 'o') id = TILE.BOULDER;
      else if (ch === '*') { id = TILE.GEM; gemsTotal++; }
      else if (ch === 'E') id = TILE.EXIT_CLOSED;
      else if (ch === ' ') id = TILE.EMPTY;
      else if (ch === 'P') { id = TILE.EMPTY; player = {x,y}; }
      t[y*width+x] = id;
    }
  }
  const world = {
    width, height, tilesize, t, falling,
    player,
    collected: 0, gemsRequired: Math.max(1, Math.floor(gemsTotal*0.8)),
    score: 0,
    timeLeft: 120,
    state: 'play', // play | dead | timeup | win
    tick: 0,
    idx(x,y){ return y*width+x; },
    inb(x,y){ return x>=0 && y>=0 && x<width && y<height; },
    get(x,y){ return this.inb(x,y) ? t[this.idx(x,y)] : TILE.STEEL; },
    set(x,y,v){ if(this.inb(x,y)) t[this.idx(x,y)] = v; },
    isFree(x,y){ const id=this.get(x,y); return id===TILE.EMPTY || id===TILE.DIRT || id===TILE.GEM || id===TILE.EXIT_OPEN; },
    tryMovePlayer(dir){
      if (this.state!=='play') return false;
      const nx = this.player.x + dir.x; const ny = this.player.y + dir.y;
      const id = this.get(nx,ny);
      // pushing boulders
      if ((id===TILE.BOULDER) && (dir.x!==0 && dir.y===0)){
        const bx = nx + dir.x; const by = ny + dir.y;
        if (this.get(bx,by)===TILE.EMPTY && this.falling[this.idx(nx,ny)]===0) {
          this.set(bx,by,TILE.BOULDER); this.set(nx,ny,TILE.EMPTY);
          this.player.x = nx; this.player.y = ny;
          this._on('push');
          return true;
        }
      }
      if (id===TILE.WALL || id===TILE.STEEL || id===TILE.BOULDER || id===TILE.EXIT_CLOSED) return false;
      // collect gem
      if (id===TILE.GEM) { this.collected++; this.score += 15; this._on('collect'); }
      // dig dirt
      if (id===TILE.DIRT) { this.score += 1; }
      // move
      this.set(nx,ny, TILE.EMPTY);
      this.player.x = nx; this.player.y = ny;
      // open exit if ready
      if (this.collected >= this.gemsRequired) this.openExits();
      // win condition
      if (id===TILE.EXIT_OPEN) { this.state='win'; this._on('win'); }
      return true;
    },
    openExits(){
      for (let y=0;y<height;y++) for (let x=0;x<width;x++) if (this.get(x,y)===TILE.EXIT_CLOSED) this.set(x,y,TILE.EXIT_OPEN);
      this._on('exit-open');
    },
    update(dt){
      if (this.state!=='play') return;
      this.tick++;
      this.timeLeft -= dt;
      if (this.timeLeft <= 0) { this.state='timeup'; return {type:'die'}; }

      // reset falling states
      this.falling.fill(0);

      // process gravity bottom->top
      for (let y=this.height-2; y>=0; y--) {
        for (let x=0; x<this.width; x++) {
          const id = this.get(x,y);
          if (id===TILE.BOULDER || id===TILE.GEM) {
            const below = this.get(x,y+1);
            if (below===TILE.EMPTY) {
              // crush player check
              if (this.player.x===x && this.player.y===y+1) { this.state='dead'; this._on('die'); }
              this.set(x,y+1,id); this.set(x,y,TILE.EMPTY); this.falling[this.idx(x,y+1)] = 1; continue;
            }
            const isRocky = (v)=> v===TILE.BOULDER || v===TILE.GEM;
            // roll left
            if (isRocky(below) && this.get(x-1,y)===TILE.EMPTY && this.get(x-1,y+1)===TILE.EMPTY) {
              if (this.player.x===x-1 && this.player.y===y+1) { this.state='dead'; this._on('die'); }
              this.set(x-1,y+1,id); this.set(x,y,TILE.EMPTY); this.falling[this.idx(x-1,y+1)] = 1; continue;
            }
            // roll right
            if (isRocky(below) && this.get(x+1,y)===TILE.EMPTY && this.get(x+1,y+1)===TILE.EMPTY) {
              if (this.player.x===x+1 && this.player.y===y+1) { this.state='dead'; this._on('die'); }
              this.set(x+1,y+1,id); this.set(x,y,TILE.EMPTY); this.falling[this.idx(x+1,y+1)] = 1; continue;
            }
          }
        }
      }

      return null;
    },
    _on(type, payload){ this._lastEvent = {type,payload}; setTimeout(()=>{ this._lastEvent=null; },0); },
  };
  return world;
}
