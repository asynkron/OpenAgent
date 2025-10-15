# Boulder Dash (CRT) in plain JS/HTML

Purpose: A self-contained, retro-styled Boulder Dash-inspired game using Canvas 2D, procedural pixel art, and CSS-based CRT effects. No build tools or external deps.

Key files:
- index.html: Entry point loading modules and HUD.
- style.css: Pixel-perfect scaling, scanlines, vignette, flicker.
- main.js: Wires engine, world, renderer, assets, audio, CRT.
- game/engine.js: Fixed-step loop, input handling, HUD events, level flow.
- game/renderer.js: Tile and player rendering from sprite atlas.
- game/assets.js: Procedural pixel sprites for tiles and player.
- game/world.js: Level parsing, rules (falling/rolling), player moves, win/lose.
- game/levels.js: ASCII level(s). Extend by pushing to array.
- game/audio.js: Tiny WebAudio beeps for collect/push/exit/win/die.
- game/crt.js: Subtle flicker/jitter for CRT feel.

Known risks:
- Physics edge cases when boulders roll; mitigated by bottom-to-top sweep and single-update per tick.
- Audio may require first pointer/tap to unlock autoplay.
- CSS CRT effects vary slightly by browser.
- Rendering assumes integer scaling; canvas is sized to logical pixels; CSS handles visual scale.

How to run:
- Open index.html in a modern desktop browser. Use arrow keys/WASD to move, Space to wait, R to restart.

Change protocol:
- Update this context.md when adding levels, enemies, art, or engine changes.
