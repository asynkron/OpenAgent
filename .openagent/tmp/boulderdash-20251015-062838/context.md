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

Update 2025-10-15:
- Physics fix: Player now counts as support under rocks; rocks only crush the player if they were already falling in the previous tick. Falling state now persists across ticks for deterministic behavior.

Update 2025-10-15 (display):
- Bigger pixels by reducing internal tilesize from 16 to 8 (crisper, chunkier look at same CSS size).
- Stronger CRT: darker scanlines, RGB aperture grille stripes, enhanced vignette/glow, increased HUD glow.
- All tunable via style.css variables and gradients.

Update 2025-10-15 (levels + progression):
- Gems quota now computed from reachable tiles via flood fill at level load; trapped gems no longer block exit opening.
- New default level “Open Cavern” with rooms that have doorways for fair access.

Update 2025-10-15 (bugfix):
- Fixed syntax error in world.js caused by a leftover fragment in the world object after introducing reachable-gems progression.

Planned classic features now documented in docs/feature-plan.md (enemies+explosions, magic wall, level selector, CRT toggle, touch + npm start). Implementation will proceed in phases with deterministic update order.
\n## Phase 1: Enemies + Explosions
- Added enemiesStep with Firefly/Butterfly wall-hugging AI.
- Added explosion queue and 3×3 resolution preserving steel/exit.
- Update order: gravity → enemies → resolve explosions → player → SFX.
- Risks: ordering edge cases with falling + enemy; performance with many entities.
\n## Wiring updates (enemies + magic wall hook)
- Map parser now spawns enemies from 'F' (Firefly) and 'B' (Butterfly).
- Tick order: gravity → enemies → resolve explosions → player (already wired).
- Gravity now calls magicConvert() when entering ACTIVE magic wall (guarded by isMagicWall).
- Explosion SFX added (noise + sparkle).
