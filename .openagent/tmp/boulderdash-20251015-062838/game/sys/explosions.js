import { sfxExplosion, sfxButterSparkle } from '../audio/sfx.js';

export function queueExplosion(world,x,y,kind){
  world.explosions = world.explosions||[];
  world.explosions.push({x,y,ttl:3,kind});
}

export function resolveExplosions(world){
  if(!world.explosions||world.explosions.length===0) return;
  for(const ex of world.explosions){ ex.ttl--; }
  const done = world.explosions.filter(ex=>ex.ttl<=0);
  world.explosions = world.explosions.filter(ex=>ex.ttl>0);
  for(const ex of done){
    try { sfxExplosion(); if(ex.kind==='BUTTER') sfxButterSparkle(); } catch(e){}
    for(let yy=ex.y-1; yy<=ex.y+1; yy++){
      for(let xx=ex.x-1; xx<=ex.x+1; xx++){
        if(world.isSteel && world.isSteel(xx,yy)) continue; // preserve steel
        if(world.isExit && world.isExit(xx,yy)) continue;   // preserve exit tiles
        if(ex.kind==='BUTTER') world.setGem(xx,yy); else world.clearTile(xx,yy);
      }
    }
  }
}
