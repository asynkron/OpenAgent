export const LEVELS = [
  {
    name: 'Open Cavern',
    map: (()=>{
      const W=40, H=22;
      const rows = Array.from({length:H}, (_,y)=>Array.from({length:W}, (_,x)=> (y===0||y===H-1||x===0||x===W-1)?'X':'.'));
      const set=(x,y,ch)=>{ if (x>0&&x<W-1&&y>0&&y<H-1) rows[y][x]=ch; };
      const rect=(x1,y1,x2,y2,ch)=>{ for(let y=y1;y<=y2;y++) for(let x=x1;x<=x2;x++) set(x,y,ch); };
      const door=(x,y)=> set(x,y,' ');
      // Rooms with openings
      rect(5,3,14,8,'#');  door(10,8);
      rect(20,3,34,7,'#'); door(27,7);
      rect(6,11,16,16,'#'); door(6,13); door(11,16);
      rect(22,11,35,17,'#'); door(28,11); door(35,14);
      // Gems inside rooms and corridors
      [ [9,5],[11,5],[7,6],[13,6], [26,5],[29,4],[31,6],[33,5], [9,13],[12,14],[14,15], [24,13],[27,15],[30,16],[33,14] ].forEach(([x,y])=> set(x,y,'*'));
      // Boulders scattered (avoid blocking doors)
      [ [3,5],[17,6],[19,9],[21,13],[25,12],[27,12],[15,10],[8,17],[29,8],[34,16] ].forEach(([x,y])=> set(x,y,'o'));
      // Carve airy corridors
      for (let y=2;y<H-2;y+=3){ for (let x=2; x<W-2; x+=2){ if (rows[y][x]==='.') rows[y][x]=' '; }}
      // Player and Exit
      set(2,2,'P'); set(W-3,H-3,'E');
      return rows.map(r=>r.join('')).join('\n');
    })()
  }
];
