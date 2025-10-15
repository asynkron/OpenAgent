# Classic Features Implementation Plan

Features
- Enemies + explosions (Firefly/Butterfly): 3×3 blast; Butterfly converts area to diamonds; Firefly clears to empty.
- Magic wall: converts falling boulders ↔ diamonds during an active window; otherwise solid.
- Level selector + more levels: several caverns with openings and difficulty curve.
- CRT intensity toggle: F1/F2 cycle subtle/medium/strong; persist in localStorage.
- Touch controls + npm start: on‑screen D‑pad and one‑command local server.

Deterministic update order (per tick)
1) Gravity resolution over tiles (bottom-to-top).
2) Enemies step (AI move or explode if trapped/touched).
3) Resolve explosions that reach ttl end (apply 3×3 outcome).
4) Player input commit (one move per cadence step).
5) SFX hooks (non-blocking).

Data model
- TILE: add MAGIC_WALL_INACTIVE, MAGIC_WALL_ACTIVE, MAGIC_WALL_SPENT.
- enemies: [{x,y,dir,type}] with type∈{FIREFLY,BUTTERFLY}, dir∈{0,1,2,3}.
- explosions: [{x,y,ttl,kind}] with kind∈{FIRE,BUTTER}.
- world: magicActiveUntil, magicDuration, lastMagicTriggerTick, crtPreset.

Rules
- Firefly (right-hand) and Butterfly (left-hand) wall-hugging movement.
- Explosion triggers: on touching player or if all 4-neighbors are non-passable (trapped).
- Explosion effects: Firefly→EMPTY in 3×3; Butterfly→GEM in 3×3; STEEL/steel walls unchanged; EXIT unaffected.
- Magic wall: first falling object activates for N seconds; while active, only falling items pass and convert; others collide; item emerges below.

UI/UX
- Level selector overlay (start and L key); keyboard and pointer.
- CRT presets via CSS variables; F1/F2 to cycle; localStorage remember.
- Touch D‑pad with repeat interval aligned to movement cadence; hide on desktop.

Phased execution
- Phase 1: Enemies + explosions logic (no art), deterministic pass, debug overlays optional.
- Phase 2: Procedural sprites/audio for enemies, explosion frames, magic wall.
- Phase 3: Magic wall mechanics and timers.
- Phase 4: Level selector + 6–8 caverns (openings ensured) with per-level time/quota.
- Phase 5: CRT presets and toggle.
- Phase 6: Touch controls + npm start.
- Phase 7: Polish (balance, SFX levels, docs, small test harness).

Acceptance
- Deterministic outcomes across refresh at fixed seed; explosions resolve correctly; magic wall converts only falling objects; selector switches levels; CRT toggle works; touch controls responsive; npm start works.

Risks & mitigations
- Update-order bugs: assert order and add regression tests where feasible.
- Perf: cap entity counts, typed arrays for hot paths, avoid heap churn.
- Visual clarity: strong CRT balanced with readability; presets available.
