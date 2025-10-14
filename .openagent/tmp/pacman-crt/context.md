# Context: Pac-Man CRT (temporary)

Purpose
- HTML5 + JS Pac-like with old-school CRT look for local demo purposes. Lives under .openagent/tmp/pacman-crt.

Key files
- index.html: entry point
- style.css: CRT screen aesthetics (scanlines, vignette, warp)
- game.js: tilemap, game loop, entity logic, simplified AI, WebAudio beeps

Known risks / notes
- Ghost AI simplified vs. original arcade; timings/behaviors are approximate.
- Collision edge cases may differ from the original hardware.
- Power pellet and frightened timers are intentionally short for quick demos.
- CRT effect is CSS-based; appearance varies slightly across browsers/monitors.

Maintenance
- Self-contained, static; no build step. Update this context if files change.
