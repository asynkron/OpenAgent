// ANSI 256-color mapping utilities
// Provides: nearest256ColorIndex, indexToAnsi, reset, ansiRgb

function clamp(v, min=0, max=255){return Math.max(min, Math.min(max, v|0));}

// Build xterm-256 palette (0-15 system, 16-231 cube, 232-255 gray)
const xterm256 = [];
(function build(){
  const sys = [
    [0,0,0],[128,0,0],[0,128,0],[128,128,0],[0,0,128],[128,0,128],[0,128,128],[192,192,192],
    [128,128,128],[255,0,0],[0,255,0],[255,255,0],[0,0,255],[255,0,255],[0,255,255],[255,255,255]
  ];
  for (const rgb of sys) xterm256.push(rgb);
  const steps = [0,95,135,175,215,255];
  for (let r=0;r<6;r++){
    for (let g=0;g<6;g++){
      for (let b=0;b<6;b++){
        xterm256.push([steps[r],steps[g],steps[b]]);
      }
    }
  }
  for (let i=0;i<24;i++){
    const v = 8 + i*10;
    xterm256.push([v,v,v]);
  }
})();

function dist2(a,b){
  const dr=a[0]-b[0], dg=a[1]-b[1], db=a[2]-b[2];
  return dr*dr*0.299 + dg*dg*0.587 + db*db*0.114;
}

export function nearest256ColorIndex(r,g,b){
  const target=[clamp(r),clamp(g),clamp(b)];
  let bestIdx=0, best=Infinity;
  for (let i=0;i<256;i++){
    const d = dist2(target, xterm256[i]);
    if (d<best){best=d;bestIdx=i;}
  }
  return bestIdx;
}

export function indexToAnsi(idx, isBg=false){
  // Always use 256-color SGR codes for consistency across terminals
  return `\u001b[${isBg?48:38};5;${idx}m`;
}

export function reset(){return "\u001b[0m";}

export function ansiRgb(r,g,b,isBg=false){
  return indexToAnsi(nearest256ColorIndex(r,g,b), isBg);
}
