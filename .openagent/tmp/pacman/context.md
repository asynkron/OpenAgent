# Pac-Man (HTML5 Canvas) with CRT effects — context

Purpose:
- Playable Pac-Man clone implemented in plain HTML/CSS/JS with 28×31 tile map, pellets, power pellets, 4 ghosts, scoring/lives.
- Old-school arcade CRT look (scanlines, vignette, flicker, mild glow and color bleed).

Key files:
- index.html — Bootstraps the canvas and layout.
- styles.css — Layout and CRT effect layers (scanlines, vignette, flicker, color bleed).
- game.js — Game logic: map, entities, movement, AI, rendering, sound, loop.

Usage:
- Open index.html in a browser (file:// works) or use a static server, e.g. `npx http-server . -p 8087`.
- Controls: Arrow keys or WASD; P to pause; M to mute.

Assumptions & constraints:
- Single-file canvas rendering; no external assets.
- Ghost AI is a simplified approximation prioritizing readable behavior over exact arcade timing tables.

Known risks:
- Some edge interactions differ from the arcade original (e.g., door logic, corner-cutting rules, precise speed tables).
- CRT effects are tuned to be gentle; performance should be fine on modern devices; adjust CSS variables if needed.
