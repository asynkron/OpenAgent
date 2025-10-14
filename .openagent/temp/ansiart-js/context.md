# ansiart-js (temp)

Purpose:
- Node.js reimplementation of ansiart to convert images (PNG) to ANSI art using xterm-256 colors.

Key files:
- src/ansi-palette.mjs: 256/16-color mapping and ANSI escape code helpers.
- src/renderer.mjs: PNG decoding, optional dithering, resampling, and rendering in half-block or pixel modes.
- src/cli.mjs: CLI entry to process an image and emit ANSI to stdout or a file.
- samples/bird1.png: Sample image copied from original repo for testing.

Known risks:
- Palette nearest-color and dithering are heuristic; visual output can vary across terminals.
- Half-block rendering relies on Unicode block characters; ensure UTF-8 locale.
- No JPEG/BMP decoding yet (PNG only); can be extended with Jimp or sharp.
- No aspect-ratio correction; terminal cell aspect may stretch images.

Usage:
- node ./src/cli.mjs ./samples/bird1.png -w 80 -d > out.ans
- cat out.ans

