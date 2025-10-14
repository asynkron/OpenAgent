# Pac-Man CRT (temp)

Purpose
- Playable Pac-Man clone for browser, designed to evoke old-school arcade feel with CRT effects (scanlines, vignette, glow, subtle flicker). Pure HTML/JS/CSS; open index.html to run.

Key files
- index.html: Single-page shell, canvas + CRT overlays.
- style.css: Layout, pixel scaling, scanlines, vignette, flicker.
- game.js: Game loop, map, entities, pellets, power pellets, ghosts.
- README.md: How to run, structure, extension ideas.

Known risks
- Ghost AI simplified relative to original (intersection-based direction choice with bias/randomness; no full scatter/chase schedule). Good gameplay but not cycle-accurate.
- No audio by default to keep self-contained; can be added later.
- Performance depends on browser; designed for 60 FPS on modern systems.

Notes
- Internal canvas resolution small for pixel authenticity; scaled up with nearest-neighbor to emphasize retro look.

Changelog
- Bugfix: Ghosts can now exit the house. Gate blocks Pac-Man, opens for ghosts after the ready timer.
