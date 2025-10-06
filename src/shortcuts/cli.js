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

import * as fs from 'node:fs';
import * as path from 'node:path';

import { isCommandStringSafe } from '../commands/preapproval.js';

const SHORTCUTS_PATH = path.join(process.cwd(), 'shortcuts', 'shortcuts.json');

function sanitizeShortcut(entry) {
  if (!entry || typeof entry !== 'object') {
    return null;
  }

  const id = typeof entry.id === 'string' ? entry.id.trim() : '';
  const name = typeof entry.name === 'string' ? entry.name.trim() : '';
  const command = typeof entry.command === 'string' ? entry.command : '';

  if (!id || !name || !isCommandStringSafe(command)) {
    return null;
  }

  const sanitized = {
    ...entry,
    id,
    name,
    command: command.trim(),
  };

  if (Array.isArray(entry.tags)) {
    sanitized.tags = entry.tags.filter((tag) => typeof tag === 'string' && tag.trim()).map((tag) => tag.trim());
  }

  return sanitized;
}

export function loadShortcutsFile() {
  try {
    const raw = fs.readFileSync(SHORTCUTS_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map(sanitizeShortcut)
      .filter((entry) => entry !== null);
  } catch (err) {
    return [];
  }
}

export function findShortcut(id) {
  const list = loadShortcutsFile();
  return list.find((s) => s.id === id);
}

export function handleShortcutsCli(argv = process.argv) {
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

export default {
  loadShortcutsFile,
  findShortcut,
  handleShortcutsCli,
};
