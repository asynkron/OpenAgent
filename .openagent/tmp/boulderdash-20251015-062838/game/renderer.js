import { TILE } from './world.js';

export function createRenderer(canvas, assets) {
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;

  function draw(world) {
    const { width, height, tilesize } = world;
    canvas.width = width * tilesize;
    canvas.height = height * tilesize;

    // clear
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // draw tiles
    const t = world.t;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const id = t[world.idx(x,y)];
        const sprite = assets.getSprite(id, x, y, world.tick);
        if (sprite) ctx.drawImage(sprite, x*tilesize, y*tilesize, tilesize, tilesize);
      }
    }

    // draw player
    const p = assets.player(world.tick);
    ctx.drawImage(p, world.player.x*tilesize, world.player.y*tilesize, tilesize, tilesize);

    // status overlays
    if (world.state === 'dead') overlayText('CRUSHED! Press R to restart');
    else if (world.state === 'timeup') overlayText('TIME UP! Press R to restart');
    else if (world.state === 'win') overlayText('LEVEL CLEARED!');
  }

  function overlayText(text) {
    const w = canvas.width;
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fillRect(0, canvas.height/2 - 24, w, 48);
    ctx.font = 'bold 20px monospace';
    ctx.fillStyle = '#a8ffbf';
    ctx.textAlign = 'center';
    ctx.fillText(text, w/2, canvas.height/2 + 7);
  }

  return { draw };
}
