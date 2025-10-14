# .openagent context

This directory hosts agent-generated working areas and temporary artifacts.

Subdirectories:
- tmp/pacman: Self-contained HTML/JS Pac-Man with CRT effects. No build step; open index.html directly or serve statically.

Known risks:
- Contents are generated and may be overwritten by future agent runs.
- Large binary assets are avoided; the project is code-only for portability.

- Temp project: Pac-Man CRT at .openagent/tmp/pacman-crt (HTML5 Canvas, CSS CRT effects)
