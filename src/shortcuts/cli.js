"use strict";

/**
 * Shortcut CLI utilities mirroring the legacy behaviour from index.js.
 *
 * Responsibilities:
 * - Read `shortcuts/shortcuts.json` and expose lookup helpers.
 * - Handle the CLI entry points for listing, showing, or rendering shortcuts.
 *
 * Consumers:
 * - Root `index.js` delegates to these helpers when launched with `shortcuts` arguments.
 * - Integration tests rely on `loadShortcutsFile()` via the index re-export.
 */

const fs = require('fs');
const path = require('path');

const SHORTCUTS_PATH = path.join(process.cwd(), 'shortcuts', 'shortcuts.json');

function loadShortcutsFile() {
  try {
    const raw = fs.readFileSync(SHORTCUTS_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed;
  } catch (err) {
    return [];
  }
}

function findShortcut(id) {
  const list = loadShortcutsFile();
  return list.find((s) => s.id === id);
}

function handleShortcutsCli(argv = process.argv) {
  const sub = argv[3] || 'list';
  const shortcuts = loadShortcutsFile();
  if (sub === 'list') {
    shortcuts.forEach((s) => console.log(`${s.id} - ${s.name}: ${s.description || ''}`));
    process.exit(0);
  }
  if (sub === 'show') {
    const id = argv[4];
    const shortcut = shortcuts.find((x) => x.id === id);
    if (!shortcut) {
      console.error('Shortcut not found:', id);
      process.exit(2);
    }
    console.log(JSON.stringify(shortcut, null, 2));
    process.exit(0);
  }
  if (sub === 'run') {
    const id = argv[4];
    const shortcut = shortcuts.find((x) => x.id === id);
    if (!shortcut) {
      console.error('Shortcut not found:', id);
      process.exit(2);
    }
    console.log(shortcut.command);
    process.exit(0);
  }

  console.log('Usage: node index.js shortcuts [list|show <id>|run <id>]');
  process.exit(0);
}

module.exports = {
  loadShortcutsFile,
  findShortcut,
  handleShortcutsCli,
};
