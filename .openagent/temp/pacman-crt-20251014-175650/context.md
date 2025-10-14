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

Changelog
- Tweak: Reduced initial ready delay to 180 frames (~3s) for faster testing.

Changelog
- Fix: Gate made entity-aware (Pac-Man blocked; ghosts can exit after readyTime).

- 2025-10-14: Added optional scent-trail mechanic: Pac-Man deposits decaying scent (visualized as translucent clouds). Inky ghost follows strongest local scent when not frightened; falls back to target-chasing otherwise.

- 2025-10-14: Tuned scent: SCENT_MAX=1000 (~100× longer). Cloud alpha normalized to s/SCENT_MAX for consistent brightness.

- 2025-10-14: Phase 1 — Added Pac-Man death animation/state, ghost eyes-return/respawn via gate, and frightened flashing near expiry.

- 2025-10-14: Phase 2 — Added synthesized SFX (pellet waka, power, ghost eaten, death, start), iris transitions (level reveal + death shrink), power-up flash + 'POWER!' popup, ghost-eaten score popup, and fixed tunnel teleporter wrap collision.

- 2025-10-14: Fix — Eyes-mode ghosts now use BFS to reach the gate interior; added interior target detection to ensure reliable respawn (no more getting stuck).

- 2025-10-14: Phase 1 — Added offscreen scene pipeline, dynamic lighting (soft light with dim corridors, brighter during frightened), and additive ghost glow.

- 2025-10-14: Phase 2 — Added power-up shockwave ring, 200ms slow-mo via global timeScale, and temporary chromatic split during shockwave.

- 2025-10-14: Phase 3 — Added CRT barrel warp (strip-based) and chromatic aberration sliders (UI) with localStorage persistence; steady aberration blends with temporary shockwave split.
