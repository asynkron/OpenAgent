import { PNG } from 'pngjs';
import fs from 'node:fs';
import { nearest256ColorIndex, indexToAnsi } from './ansi-palette.mjs';
import { renderQuarter } from './quarter.mjs';

export async function renderFileToAnsi(path, opts={}){
  const buf = await fs.promises.readFile(path);
  const png = PNG.sync.read(buf);
  return renderPngToAnsi(png, opts);
}

function clamp(v,min=0,max=255){return Math.max(min, Math.min(max, v));}

function pixelAt(png, x, y){
  const idx = (png.width * y + x) << 2;
  const d = png.data;
  return [d[idx], d[idx+1], d[idx+2], d[idx+3]];
}

function resampleNearest(png, targetW){
  if (!targetW || targetW>=png.width) return png; // no upscaling
  const scale = targetW / png.width;
  const targetH = Math.max(1, Math.round(png.height * scale));
  const out = new PNG({width: targetW, height: targetH});
  for (let y=0;y<out.height;y++){
    const sy = Math.min(png.height-1, Math.floor(y/scale));
    for (let x=0;x<out.width;x++){
      const sx = Math.min(png.width-1, Math.floor(x/scale));
      const [r,g,b,a] = pixelAt(png, sx, sy);
      const idx = (out.width*y + x) << 2;
      out.data[idx]=r; out.data[idx+1]=g; out.data[idx+2]=b; out.data[idx+3]=a;
    }
  }
  return out;
}

function floydSteinberg(png){
  const w=png.width, h=png.height, d=png.data;
  function set(x,y,r,g,b,a){ const i=(w*y+x)<<2; d[i]=r; d[i+1]=g; d[i+2]=b; d[i+3]=a; }
  function get(x,y){ const i=(w*y+x)<<2; return [d[i],d[i+1],d[i+2],d[i+3]]; }
  for (let y=0;y<h;y++){
    const dir = (y%2===0)?1:-1; // serpentine
    for (let xi=0; xi<w; xi++){
      const x = dir===1?xi:(w-1-xi);
      let [r,g,b,a]=get(x,y);
      const idx = nearest256ColorIndex(r,g,b);
      const [nr,ng,nb] = palette256[idx];
      set(x,y,nr,ng,nb,a);
      const er=r-nr, eg=g-ng, eb=b-nb;
      function add(px,py,fr){
        if (px<0||px>=w||py<0||py>=h) return;
        const i=(w*py+px)<<2;
        d[i]=clamp(d[i]+er*fr); d[i+1]=clamp(d[i+1]+eg*fr); d[i+2]=clamp(d[i+2]+eb*fr);
      }
      add(x+dir, y, 7/16);
      add(x-dir, y+1, 3/16);
      add(x, y+1, 5/16);
      add(x+dir, y+1, 1/16);
    }
  }
  return png;
}

// xterm256 palette for dithering
const palette256 = [];
(function build(){
  const sys = [
    [0,0,0],[128,0,0],[0,128,0],[128,128,0],[0,0,128],[128,0,128],[0,128,128],[192,192,192],
    [128,128,128],[255,0,0],[0,255,0],[255,255,0],[0,0,255],[255,0,255],[0,255,255],[255,255,255]
  ];
  for (const rgb of sys) palette256.push(rgb);
  const steps=[0,95,135,175,215,255];
  for (let r=0;r<6;r++) for (let g=0;g<6;g++) for (let b=0;b<6;b++) palette256.push([steps[r],steps[g],steps[b]]);
  for (let i=0;i<24;i++){const v=8+i*10; palette256.push([v,v,v]);}
})();

export function renderPngToAnsi(png, opts={}){
  const { width, dither=false, mode='block' } = opts;
  const target = width? resampleNearest(png, width) : png;
  const src = dither? (()=>{ const clone=new PNG({width:target.width, height:target.height}); clone.data=Buffer.from(target.data); return floydSteinberg(clone); })() : target;

  if (mode==='pixel') return renderPixel(src);
  if (mode==='quarter') return renderQuarter(src);
  return renderHalfBlock(src);
}

function renderPixel(png){
  let out='';
  for (let y=0;y<png.height;y++){
    let line='';
    let prevCodes='';
    for (let x=0;x<png.width;x++){
      const [r,g,b,a]=pixelAt(png,x,y);
      if (a<128){ line += '\u001b[0m '; prevCodes=''; continue; }
      const codes = indexToAnsi(nearest256ColorIndex(r,g,b), false);
      if (codes!==prevCodes){ line += codes; prevCodes=codes; }
      line += '█';
    }
    out += line + '\u001b[0m\n';
  }
  return out;
}

function renderHalfBlock(png){
  let out='';
  for (let y=0;y<png.height; y+=2){
    let line='';
    let prevCodes='';
    for (let x=0;x<png.width;x++){
      const [r1,g1,b1,a1]=pixelAt(png,x,y);
      const [r2,g2,b2,a2]= (y+1<png.height)? pixelAt(png,x,y+1) : [0,0,0,0];
      const fg = (a1<128)? '' : indexToAnsi(nearest256ColorIndex(r1,g1,b1), false);
      const bg = (a2<128)? '' : indexToAnsi(nearest256ColorIndex(r2,g2,b2), true);
      let char='▀';
      if (a1<128 && a2>=128){ char=' '; }
      else if (a1<128 && a2<128){ char=' '; }
      const codes = `${bg}${fg}`;
      if (codes!==prevCodes){ line += codes; prevCodes=codes; }
      line += char;
    }
    out += line + '\u001b[0m\n';
  }
  return out;
}
