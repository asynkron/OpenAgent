#!/usr/bin/env node
// packages/core/scripts/edit-lines.mjs
// Simple line editor: delete `count` lines starting at `start` (1-based), then insert provided text at that index.
// Dry-run prints a unified diff. Use --apply to write; --check runs `node --check` for JS files and will roll back on syntax errors.
//
// Usage examples:
//   node packages/core/scripts/edit-lines.mjs --file path/to/file.js --start 5 --count 6 --text "hello"
//   node packages/core/scripts/edit-lines.mjs --file path/to/file.js --start 100 --count 0 --text-file ./snippet.txt --apply --check

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';

function usage() {
  console.error(
    'Usage: node packages/core/scripts/edit-lines.mjs --file <file> --start <N> --count <C> (--text "..." | --text-file <path>) [--apply] [--check]',
  );
  process.exit(2);
}

const argv = process.argv.slice(2);
function hasFlag(name) {
  return argv.includes(name);
}
function getArg(name, alt) {
  const i = argv.indexOf(name);
  if (i >= 0 && i + 1 < argv.length) return argv[i + 1];
  if (alt) {
    const j = argv.indexOf(alt);
    if (j >= 0 && j + 1 < argv.length) return argv[j + 1];
  }
  return undefined;
}

const filePath = getArg('--file', '-f');
const startArg = getArg('--start', '-s');
const countArg = getArg('--count', '-c');
const textArg = getArg('--text', '-t');
const textFileArg = getArg('--text-file', '-T');
const apply = hasFlag('--apply') || hasFlag('-a');
const check = hasFlag('--check');

if (!filePath || !startArg || (textArg === undefined && textFileArg === undefined)) usage();

const start = parseInt(startArg, 10);
if (isNaN(start) || start < 1) {
  console.error('--start must be an integer >= 1');
  process.exit(2);
}

let count = 0;
if (countArg !== undefined) {
  count = parseInt(countArg, 10);
  if (isNaN(count) || count < 0) {
    console.error('--count must be an integer >= 0');
    process.exit(2);
  }
}

let replacementText = '';
if (textFileArg) {
  try {
    replacementText = fs.readFileSync(textFileArg, 'utf8');
  } catch (e) {
    console.error('Failed to read --text-file:', e.message);
    process.exit(1);
  }
} else if (textArg !== undefined) {
  replacementText = textArg;
}

const origExists = fs.existsSync(filePath);
let origContent = '';
if (origExists) {
  try {
    origContent = fs.readFileSync(filePath, 'utf8');
  } catch (e) {
    console.error('Failed to read file:', e.message);
    process.exit(1);
  }
}

// Normalize CRLF to LF for predictable behavior
const normalized = origContent.replace(/\r\n/g, '\n');
const origHadTrailingNewline = normalized.endsWith('\n');

let lines = normalized.length ? normalized.split('\n') : [];
// If original ended with newline, split() produces a trailing empty element; remove it so line counts match editor lines.
if (origHadTrailingNewline && lines.length > 0 && lines[lines.length - 1] === '') lines.pop();

const replNormalized = replacementText.replace(/\r\n/g, '\n');
const replHadTrailingNewline = replNormalized.endsWith('\n');
let insertLines = replNormalized.length ? replNormalized.split('\n') : [];
if (replHadTrailingNewline && insertLines.length > 0 && insertLines[insertLines.length - 1] === '')
  insertLines.pop();

// Compute insert position (1-based to 0-based). Clamp to lines.length+1 (append at end)
const maxInsertIndex = lines.length + 1;
let insertIndex = start;
if (insertIndex > maxInsertIndex) {
  console.warn(
    `start (${start}) is beyond end of file (lines=${lines.length}); clamping to ${maxInsertIndex} (append).`,
  );
  insertIndex = maxInsertIndex;
}
const insertPos = insertIndex - 1; // 0-based

// Delete count lines starting at insertPos (but don't exceed file)
const deleteCount = Math.max(0, Math.min(count, Math.max(0, lines.length - insertPos)));
if (deleteCount > 0) lines.splice(insertPos, deleteCount);

// Insert new lines (if any)
if (insertLines.length > 0) lines.splice(insertPos, 0, ...insertLines);

// Compose new content and preserve trailing-newline if either original or replacement had it
const finalTrailingNewline = origHadTrailingNewline || replHadTrailingNewline;
const newContent = lines.join('\n') + (finalTrailingNewline ? '\n' : '');

// Emit a unified diff (dry-run). Use temp files.
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'edit-lines-'));
const origTmp = path.join(tmpDir, 'orig');
const newTmp = path.join(tmpDir, 'new');
fs.writeFileSync(origTmp, origContent, 'utf8');
fs.writeFileSync(newTmp, newContent, 'utf8');

function runDiff(a, b) {
  try {
    const res = spawnSync(
      'diff',
      ['-u', '--label', `a/${filePath}`, '--label', `b/${filePath}`, a, b],
      { encoding: 'utf8' },
    );
    if (res.error) throw res.error;
    return res.stdout || '';
  } catch (err) {
    return null;
  }
}

const patch = runDiff(origTmp, newTmp);
if (patch === null) {
  console.log('----- BEGIN NEW FILE CONTENT -----');
  console.log(newContent);
  console.log('----- END NEW FILE CONTENT -----');
} else {
  if (patch.trim() === '') console.log('No changes detected (no-op).');
  else console.log(patch);
}

if (apply) {
  const backup = filePath + '.bak.edit-lines';
  try {
    if (origExists) fs.copyFileSync(filePath, backup);
    fs.writeFileSync(filePath, newContent, 'utf8');

    // Optionally run node --check for JS files
    const ext = path.extname(filePath).toLowerCase();
    if (check && (ext === '.js' || ext === '.cjs' || ext === '.mjs')) {
      const chk = spawnSync('node', ['--check', filePath], { encoding: 'utf8' });
      if (chk.status !== 0) {
        console.error(
          'Syntax check failed after applying change; rolling back. Output:\n',
          chk.stderr || chk.stdout,
        );
        if (origExists) fs.copyFileSync(backup, filePath);
        if (fs.existsSync(backup)) fs.unlinkSync(backup);
        process.exit(3);
      }
    }

    if (fs.existsSync(backup)) fs.unlinkSync(backup);
    console.error('Successfully applied edit to', filePath);
  } catch (err) {
    console.error('Failed to apply edit:', err.message);
    try {
      if (origExists) fs.copyFileSync(backup, filePath);
    } catch (e) {}
    process.exit(1);
  }
} else {
  console.error('Dry-run (no changes written). Use --apply to write changes in-place.');
}

// Note: This tool is intentionally small and conservative. For large-scale edits or
// AST-aware replacements prefer jscodeshift / recast / ts-morph approaches.
