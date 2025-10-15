export const DIR = { R:0, D:1, L:2, U:3 };
const rightTurn = [3,0,1,2]; // RDLU when turning right relative
const leftTurn  = [1,2,3,0]; // RDLU when turning left relative
const dx = [1,0,-1,0];
const dy = [0,1,0,-1];
const passable = (world,x,y)=> world.isPassable(x,y);
export function stepEnemy(world, e){
  const preferRight = e.type==='FIREFLY';
  const order = preferRight ? [rightTurn[e.dir], e.dir, leftTurn[e.dir], (e.dir+2)&3] : [leftTurn[e.dir], e.dir, rightTurn[e.dir], (e.dir+2)&3];
  // trapped if none passable
  const any = order.find(d=>passable(world,e.x+dx[d],e.y+dy[d]));
  if(any===undefined){ world.queueExplosion(e.x,e.y, e.type==='BUTTERFLY'?'BUTTER':'FIRE'); return; }
  for(const d of order){ const nx=e.x+dx[d], ny=e.y+dy[d]; if(passable(world,nx,ny)){ e.x=nx; e.y=ny; e.dir=d; break; } }
  if(world.player && world.player.x===e.x && world.player.y===e.y){ world.queueExplosion(e.x,e.y, e.type==='BUTTERFLY'?'BUTTER':'FIRE'); }
}
export function enemiesStep(world){
  if(!world.enemies) return;
  for(const e of world.enemies){ stepEnemy(world,e); }
}
