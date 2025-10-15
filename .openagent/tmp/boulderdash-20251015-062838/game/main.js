// selector wiring
window.LEVELS = (typeof LEVELS!=='undefined')?LEVELS: (window.LEVELS||[]);
window.loadLevel = window.loadLevel || (i=>console.warn('loadLevel not wired', i));
