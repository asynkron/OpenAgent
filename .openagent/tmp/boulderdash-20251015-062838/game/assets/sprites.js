export function spriteFirefly(t){ return { fg:'#ffec66', bg:'#3b2f00', glyph: t%2?'*':'+' }; }
export function spriteButterfly(t){ return { fg:'#aef', bg:'#001933', glyph: t%2?'∞':'✱' }; }
export function spriteExplosion(t){ return { fg:'#ffd2a8', bg:'#330000', glyph: ['·','*','✹'][Math.min(2,t%3)] }; }
export function spriteMagicWall(state){ return { fg: state==='active'?'#0ff':'#08a', bg:'#00121a', glyph: state==='spent'?'#':'▒' }; }
