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

const SHORTCUTS_PATH = path.join(process.cwd(), 'shortcuts', 'shortcuts.json');

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function toSafeString(value, { allowEmpty = false } = {}) {
  const normalized =
    typeof value === 'string' ? value.trim() : String(value ?? '').trim();
  if (!allowEmpty && normalized.length === 0) {
    return '';
  }
  return normalized;
}

// Filter and normalize shortcuts to avoid executing malformed command payloads.
function sanitizeShortcuts(list) {
  if (!Array.isArray(list)) return [];
  return list
    .map((entry) => {
      if (!isPlainObject(entry)) return null;
      const id = toSafeString(entry.id);
      const command = toSafeString(entry.command);
      if (!id || !command) return null;

      const name = toSafeString(entry.name ?? '', { allowEmpty: true }) || id;
      const description = toSafeString(entry.description ?? '', { allowEmpty: true });
      const tags = Array.isArray(entry.tags)
        ? entry.tags
            .filter((tag) => typeof tag === 'string')
            .map((tag) => toSafeString(tag))
            .filter(Boolean)
        : [];

      return {
        id,
        name,
        description,
        command,
        tags,
      };
    })
    .filter(Boolean);
}

export function loadShortcutsFile() {
  try {
    const raw = fs.readFileSync(SHORTCUTS_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    return sanitizeShortcuts(parsed);
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
