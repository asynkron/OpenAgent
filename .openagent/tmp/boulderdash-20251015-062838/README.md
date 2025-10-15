Boulder Dash (CRT) — no-build, single-click retro game

Run
- Open index.html in a browser (no server required)
- Controls: Arrow keys or WASD to move, Space to wait, R to restart

Notes
- Procedural sprites avoid external assets.
- CRT effect uses CSS (scanlines, vignette, flicker) and small JS jitter.
- Physics: bottom-to-top sweep for falling/rolling. Exit opens when enough gems are collected.
## Features
- Firefly/Butterfly enemies with 3×3 explosions (butterfly → diamonds, firefly → empty)
- Magic Wall converts falling boulders↔diamonds during active window
- Level selector overlay (press L)
- CRT presets (F1/F2), persisted
- Touch D‑pad and `npm start` quick server

## Controls
Arrows/WASD, L for level selector, F1/F2 CRT presets, touch D‑pad on mobile.
