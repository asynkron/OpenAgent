# Shortcuts Implementation

Added a lightweight shortcuts feature to provide quick commands for frequently used tasks.
- Shortcuts are stored in shortcuts/shortcuts.json as an array of objects with id, name, description, and command.
- CLI helper added to index.js: node index.js shortcuts [list|show <id>|run <id>]
- Running a shortcut via CLI prints the rendered command; actual execution is left to the agent flow for safety.

Notes:
- Keep shortcuts simple and avoid dangerous constructs; the agent's validators still apply before any execution.
