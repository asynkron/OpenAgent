#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

async function readStdin() {
  return new Promise((resolve, reject) => {
    const chunks = [];
    process.stdin.on('data', (chunk) => chunks.push(chunk));
    process.stdin.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    process.stdin.on('error', reject);
  });
}

function parsePatch(input) {
  const operations = [];
  const lines = input.split(/\r?\n/);
  let inside = false;
  let currentOp = null;
  let currentHunk = null;

  const flushHunk = () => {
    if (!currentHunk) return;
    const parsed = parseHunk(currentHunk.lines, currentOp.path, currentHunk.header);
    currentOp.hunks.push(parsed);
    currentHunk = null;
  };

  const flushOp = () => {
    if (!currentOp) return;
    flushHunk();
    if (currentOp.hunks.length === 0) {
      throw new Error(`No hunks provided for ${currentOp.path}`);
    }
    operations.push(currentOp);
    currentOp = null;
  };

  for (const rawLine of lines) {
    const line = rawLine;
    if (line === '*** Begin Patch') {
      inside = true;
      continue;
    }
    if (line === '*** End Patch') {
      if (inside) {
        flushOp();
      }
      inside = false;
      continue;
    }
    if (!inside) {
      continue;
    }

    if (line.startsWith('*** ')) {
      flushOp();
      const updateMatch = line.match(/^\*\*\* Update File:\s*(.+)$/);
      if (updateMatch) {
        currentOp = { type: 'update', path: updateMatch[1], hunks: [] };
        continue;
      }
      throw new Error(`Unsupported patch directive: ${line}`);
    }

    if (!currentOp) {
      if (line.trim() === '') {
        continue;
      }
      throw new Error(`Diff content appeared before a file directive: "${line}"`);
    }

    if (line.startsWith('@@')) {
      flushHunk();
      currentHunk = { header: line, lines: [] };
      continue;
    }

    if (!currentHunk) {
      currentHunk = { header: null, lines: [] };
    }
    currentHunk.lines.push(line);
  }

  if (inside) {
    throw new Error('Missing *** End Patch terminator.');
  }
  flushOp();
  return operations;
}

function parseHunk(lines, filePath, header) {
  const before = [];
  const after = [];
  for (const raw of lines) {
    if (raw.startsWith('+')) {
      after.push(raw.slice(1));
    } else if (raw.startsWith('-')) {
      before.push(raw.slice(1));
    } else if (raw.startsWith(' ')) {
      const value = raw.slice(1);
      before.push(value);
      after.push(value);
    } else if (raw === '\\ No newline at end of file') {
      continue;
    } else {
      throw new Error(`Unsupported hunk line in ${filePath}: "${raw}"`);
    }
  }
  const rawPatchLines = [];
  if (header) {
    rawPatchLines.push(header);
  }
  rawPatchLines.push(...lines);
  return { before, after, rawLines: lines.slice(), header, rawPatchLines };
}

function findSubsequence(haystack, needle, startIndex = 0) {
  if (needle.length === 0) {
    return -1;
  }
  outer: for (let i = startIndex; i <= haystack.length - needle.length; i += 1) {
    for (let j = 0; j < needle.length; j += 1) {
      if (haystack[i + j] !== needle[j]) {
        continue outer;
      }
    }
    return i;
  }
  return -1;
}

function applyHunk(state, hunk) {
  const { before, after } = hunk;
  const { lines } = state;

  if (before.length === 0) {
    const endsWithEmpty = lines.length > 0 && lines[lines.length - 1] === '';
    const insertionIndex = endsWithEmpty ? lines.length - 1 : lines.length;
    lines.splice(insertionIndex, 0, ...after);
    state.cursor = insertionIndex + after.length;
    return;
  }

  let matchIndex = findSubsequence(lines, before, state.cursor);
  if (matchIndex === -1) {
    matchIndex = findSubsequence(lines, before, 0);
  }
  if (matchIndex === -1) {
    const error = new Error(`Hunk not found in ${state.relativePath}.`);
    error.code = 'HUNK_NOT_FOUND';
    error.relativePath = state.relativePath;
    error.originalContent = state.originalContent ?? state.lines.join('\n');
    throw error;
  }

  lines.splice(matchIndex, before.length, ...after);
  state.cursor = matchIndex + after.length;
}

async function applyOperations(operations) {
  const fileStates = new Map();

  const ensureFileState = async (relativePath) => {
    const absolutePath = path.resolve(relativePath);
    if (fileStates.has(absolutePath)) {
      return fileStates.get(absolutePath);
    }
    let content;
    try {
      content = await fs.readFile(absolutePath, 'utf8');
    } catch (error) {
      throw new Error(`Failed to read ${relativePath}: ${error.message}`);
    }
    const normalized = content.replace(/\r\n/g, '\n');
    const lines = normalized.split('\n');
    const state = {
      path: absolutePath,
      relativePath,
      lines,
      originalContent: content,
      originalEndsWithNewline: normalized.endsWith('\n'),
      touched: false,
      cursor: 0,
      hunkStatuses: [],
    };
    fileStates.set(absolutePath, state);
    return state;
  };

  for (const op of operations) {
    if (op.type !== 'update') {
      throw new Error(`Unsupported patch operation for ${op.path}: ${op.type}`);
    }
    const state = await ensureFileState(op.path);
    state.cursor = 0;
    state.hunkStatuses = [];
    for (let index = 0; index < op.hunks.length; index += 1) {
      const hunk = op.hunks[index];
      const hunkNumber = index + 1;
      try {
        applyHunk(state, hunk);
        state.hunkStatuses.push({ number: hunkNumber, status: 'applied' });
        state.touched = true;
      } catch (error) {
        enhanceHunkError(error, state, hunk, hunkNumber);
      }
    }
  }

  const results = [];
  for (const state of fileStates.values()) {
    if (!state.touched) {
      continue;
    }
    let newContent = state.lines.join('\n');
    if (state.originalEndsWithNewline && !newContent.endsWith('\n')) {
      newContent += '\n';
    } else if (!state.originalEndsWithNewline && newContent.endsWith('\n')) {
      newContent = newContent.slice(0, -1);
    }
    await fs.writeFile(state.path, newContent, 'utf8');
    results.push({ status: 'M', path: state.relativePath });
  }

  return results;
}

// Attach rich metadata to hunk failures so callers can see what succeeded before the miss.
function enhanceHunkError(error, state, hunk, hunkNumber) {
  const statuses = state.hunkStatuses.concat({ number: hunkNumber, status: 'no-match' });
  if (!error.code) {
    error.code = 'HUNK_NOT_FOUND';
  }
  if (!error.relativePath) {
    error.relativePath = state.relativePath;
  }
  if (!error.originalContent) {
    error.originalContent = state.originalContent ?? state.lines.join('\n');
  }
  error.hunkStatuses = statuses;
  error.failedHunk = {
    number: hunkNumber,
    rawPatchLines: Array.isArray(hunk.rawPatchLines) ? hunk.rawPatchLines.slice() : [],
  };
  throw error;
}

function exitWithError(message) {
  console.error(message);
  process.exit(1);
}

async function main() {
  const input = await readStdin();
  if (!input.trim()) {
    exitWithError('No patch provided via stdin.');
  }

  let operations;
  try {
    operations = parsePatch(input);
  } catch (error) {
    exitWithError(error.message);
  }

  if (operations.length === 0) {
    exitWithError('No patch operations detected.');
  }

  try {
    const results = await applyOperations(operations);
    if (results.length === 0) {
      console.log('No changes applied.');
      return;
    }
    const ordered = results.sort((a, b) => a.path.localeCompare(b.path));
    console.log('Success. Updated the following files:');
    for (const entry of ordered) {
      console.log(`${entry.status} ${entry.path}`);
    }
  } catch (error) {
    exitWithError(formatError(error));
  }
}

// Summarise which hunks landed vs. which failed to guide manual recovery.
function describeHunkStatuses(hunkStatuses = []) {
  if (!Array.isArray(hunkStatuses) || hunkStatuses.length === 0) {
    return '';
  }
  const applied = hunkStatuses
    .filter((entry) => entry.status === 'applied')
    .map((entry) => entry.number);
  const failed = hunkStatuses.find((entry) => entry.status !== 'applied');
  const lines = [];
  if (applied.length > 0) {
    const appliedLabel = applied.join(', ');
    lines.push(`Hunks applied: ${appliedLabel}.`);
  }
  if (failed) {
    lines.push(`No match for hunk ${failed.number}.`);
  }
  return lines.join('\n');
}

function formatError(error) {
  if (!error) {
    return 'Unknown error occurred.';
  }
  const message = error.message ?? 'Unknown error occurred.';
  const code = error.code ?? '';
  const messageHasHunk = /hunk not found/i.test(message);
  if (code === 'HUNK_NOT_FOUND' || messageHasHunk) {
    const relativePath = error.relativePath ?? 'unknown file';
    const displayPath = relativePath.startsWith('./') ? relativePath : `./${relativePath}`;
    const originalContent = error.originalContent ?? '';
    const parts = [message];
    const hunkSummary = describeHunkStatuses(error.hunkStatuses);
    if (hunkSummary) {
      parts.push('', hunkSummary);
    }
    const failedHunk = error.failedHunk;
    if (failedHunk && Array.isArray(failedHunk.rawPatchLines) && failedHunk.rawPatchLines.length > 0) {
      parts.push('', 'Offending hunk:');
      parts.push(failedHunk.rawPatchLines.join('\n'));
    }
    parts.push('', `Full content of file: ${displayPath}::::`, originalContent);
    return parts.join('\n');
  }
  return message;
}

main().catch((error) => exitWithError(formatError(error)));
