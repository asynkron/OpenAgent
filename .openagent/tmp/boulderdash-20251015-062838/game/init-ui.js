import { LEVELS as __LEVELS } from './levels.js';
window.LEVELS = __LEVELS;
import { initCRTToggle } from './ui/crt.js';
import { showLevelSelector } from './ui/levelSelector.js';
import { attachDPad } from './ui/touch.js';
initCRTToggle();
window.addEventListener('keydown', (e)=>{ if(e.key==='l' || e.key==='L'){ const lvls=(window.LEVELS||[]); if(lvls.length) showLevelSelector(lvls, i=>window.loadLevel && window.loadLevel(i)); }});
const isTouch = ('ontouchstart' in window) || navigator.maxTouchPoints>0; if(isTouch && window.movePlayer){ attachDPad((dx,dy)=>window.movePlayer(dx,dy)); }
