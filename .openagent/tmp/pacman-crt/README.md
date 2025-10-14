Pac-Man CRT (temp)

- Location: .openagent/tmp/pacman-crt
- Run: open index.html in a browser (double-click or `open .openagent/tmp/pacman-crt/index.html` on macOS)
- Stack: HTML5 Canvas + JavaScript + CSS-only CRT effects
- Notes:
  - Grid-aligned movement, pellets, power pellets, four ghosts with chase/scatter/frightened.
  - Simplified ghost AI: intersection heuristic toward a target; frightened is random; mode timer cycles scatter/chase.
  - No external assets required (WebAudio beeps for sfx).
  - Pure static (no build tooling). If desired, serve with any static server.
