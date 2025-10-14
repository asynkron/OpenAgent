import { nearest256ColorIndex, indexToAnsi } from './ansi-palette.mjs';

// xterm256 palette for scoring (must match ansi-palette)
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

function clamp(v,min=0,max=255){return Math.max(min, Math.min(max, v));}
function dist2(a,b){ const dr=a[0]-b[0], dg=a[1]-b[1], db=a[2]-b[2]; return dr*dr*0.299 + dg*dg*0.587 + db*db*0.114; }
function idxRgb(idx){ return palette256[idx]; }

// bit layout: 1=UL, 2=UR, 4=LL, 8=LR
const maskChar = new Map([
  [0x0, ' '],
  [0x1, '\u2598'], // UL ▘
  [0x2, '\u259D'], // UR ▝
  [0x3, '\u2580'], // UL+UR ▀
  [0x4, '\u2596'], // LL ▖
  [0x5, '\u258C'], // UL+LL ▌ (left half)
  [0x6, '\u259E'], // UR+LL ▞
  [0x7, '\u259B'], // UL+UR+LL ▛
  [0x8, '\u2597'], // LR ▗
  [0x9, '\u259A'], // UL+LR ▚
  [0xA, '\u2590'], // UR+LR ▐ (right half)
  [0xB, '\u259C'], // UL+UR+LR ▜
  [0xC, '\u2584'], // LL+LR ▄
  [0xD, '\u2599'], // UL+LL+LR ▙
  [0xE, '\u259F'], // UR+LL+LR ▟
  [0xF, '\u2588'], // all █
]);

function pixelAt(png, x, y){
  const i=(png.width*y + x) << 2; const d=png.data; return [d[i],d[i+1],d[i+2],d[i+3]];
}

function avgColor(list){
  if (list.length===0) return [0,0,0];
  let r=0,g=0,b=0, n=0;
  for (const [pr,pg,pb,pa] of list){ if (pa>=128){ r+=pr; g+=pg; b+=pb; n++; } }
  if (n===0) return [0,0,0];
  return [Math.round(r/n), Math.round(g/n), Math.round(b/n)];
}

export function renderQuarter(png){
  let out='';
  for (let y=0; y<png.height; y+=2){
    let line='';
    let prevCodes='';
    for (let x=0; x<png.width; x+=2){
      const px = [
        pixelAt(png, x, y),                 // UL bit 1
        (x+1<png.width) ? pixelAt(png, x+1, y) : [0,0,0,0], // UR bit 2
        (y+1<png.height) ? pixelAt(png, x, y+1) : [0,0,0,0], // LL bit 4
        (x+1<png.width && y+1<png.height) ? pixelAt(png, x+1, y+1) : [0,0,0,0], // LR bit 8
      ];

      // All transparent? draw space
      if (px.every((p)=>p[3]<128)) { line += '\u001b[0m '; prevCodes=''; continue; }

      let best = { err: Infinity, mask: 0x0, fg: 16, bg: 16 };

      for (let mask=0; mask<16; mask++){
        const fgList=[], bgList=[];
        for (let i=0;i<4;i++){
          if (px[i][3]<128) continue; // skip transparent
          if ((mask>>i)&1) fgList.push(px[i]); else bgList.push(px[i]);
        }
        // avoid degenerate masks that assign nothing to both sides
        if (fgList.length===0 && bgList.length===0){ continue; }
        // handle pure FG or pure BG
        const fgAvg = avgColor(fgList);
        const bgAvg = avgColor(bgList);
        const fgIdx = nearest256ColorIndex(fgAvg[0], fgAvg[1], fgAvg[2]);
        const bgIdx = bgList.length>0 ? nearest256ColorIndex(bgAvg[0], bgAvg[1], bgAvg[2]) : 0; // bg black fallback
        const fgRgb = idxRgb(fgIdx), bgRgb = idxRgb(bgIdx);

        // compute error
        let err=0;
        for (let i=0;i<4;i++){
          if (px[i][3]<128) continue;
          const target = [px[i][0], px[i][1], px[i][2]];
          const approx = ((mask>>i)&1) ? fgRgb : bgRgb;
          err += dist2(target, approx);
        }
        if (err<best.err){ best={err, mask, fg: fgIdx, bg: bgIdx}; }
      }

      const ch = maskChar.get(best.mask) || ' ';
      const codes = `${indexToAnsi(best.bg, true)}${indexToAnsi(best.fg, false)}`;
      if (codes!==prevCodes){ line += codes; prevCodes=codes; }
      line += ch;
    }
    out += line + '\u001b[0m\n';
  }
  return out;
}
