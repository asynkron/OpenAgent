# Templates Implementation

Added lightweight template support in index.js. Features:
- Load templates from templates/command-templates.json
- Render placeholders of the form {{name}} using provided JSON variables
- CLI helper: node index.js templates [list|show|render]

Notes:
- The agent still validates commands via existing validators; templates should avoid dangerous constructs.
- Added Jest tests at tests/templates.test.js to sanity-check templates file and rendering.

