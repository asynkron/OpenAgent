// @ts-nocheck
/**
 * transforms/replace-node.js
 *
 * jscodeshift transform to replace a declaration/member in a file with the contents
 * of an external replacement file. Designed to be invoked via npx jscodeshift so
 * you can run it against any JS project without adding dependencies to that project.
 *
 * Basic usage (example):
 *
 * npx jscodeshift -t transforms/replace-node.js <target-path> --kind=class --name=MyClass --replacement=path/to/newClass.js
 *
 * Supported kinds and required args:
 *  - class: --name <ClassName> --replacement <file>
 *  - method: --class <ClassName> --method <methodName> --replacement <file> [--body-only]
 *  - function: --name <funcName> --replacement <file>
 *  - variable: --name <varName> --replacement <file>
 *
 * Notes:
 *  - The transform reads the replacement file relative to process.cwd().
 *  - By default it replaces the whole declaration/definition. Use --body-only for
 *    class or method to replace only the inner body (between braces).
 *  - If multiple matches are found in a file the transform will replace all matches
 *    by default. Use --index=N to pick only one (0-based index).
 *  - For modern syntax, pass `--parser=babel` to jscodeshift: `npx jscodeshift --parser=babel -t ...`
 */

'use strict';

const fs = require('fs');
const path = require('path');

// Simple in-process cache for replacement files
const replacementCache = Object.create(null);

function parseProcessArgs() {
  const argv = process.argv.slice(2);
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a || !a.startsWith('--')) continue;
    const eq = a.indexOf('=');
    if (eq !== -1) {
      out[a.slice(2, eq)] = a.slice(eq + 1);
      continue;
    }
    const next = argv[i + 1];
    if (next && !next.startsWith('-')) {
      out[a.slice(2)] = next;
      i++;
    } else {
      out[a.slice(2)] = true;
    }
  }
  return out;
}

function readReplacement(replPath) {
  if (!replPath) return null;
  const absolute = path.isAbsolute(replPath) ? replPath : path.resolve(process.cwd(), replPath);
  if (replacementCache[absolute]) return replacementCache[absolute];
  try {
    const txt = fs.readFileSync(absolute, 'utf8');
    replacementCache[absolute] = txt;
    return txt;
  } catch (e) {
    console.error(
      '[replace-node] failed to read replacement file:',
      absolute,
      e && e.message ? e.message : e,
    );
    return null;
  }
}

function locToOffset(src, loc) {
  if (!loc || typeof loc.line !== 'number' || typeof loc.column !== 'number') return null;
  const lines = src.split('\n');
  let offset = 0;
  for (let i = 0; i < loc.line - 1; i++) {
    offset += lines[i].length + 1; // include newline
  }
  return offset + loc.column;
}

function getNodeRange(node, src) {
  if (!node) return null;
  if (typeof node.start === 'number' && typeof node.end === 'number') return [node.start, node.end];
  if (node.loc && node.loc.start && node.loc.end) {
    const s = locToOffset(src, node.loc.start);
    const e = locToOffset(src, node.loc.end);
    if (typeof s === 'number' && typeof e === 'number') return [s, e];
  }
  return null;
}

// Adjust a node range so the end is positioned after the last closing '}' found inside
// the original AST-provided range. Also include immediate trailing semicolons and
// whitespace/newlines so we replace the declaration cleanly.
function adjustRangeToLastClosingBrace(start, end, src) {
  if (typeof start !== 'number' || typeof end !== 'number') return [start, end];
  // Search inside the slice first for the last '}'
  const slice = src.slice(start, end);
  const lastInSlice = slice.lastIndexOf('}');
  let newEnd = end;
  if (lastInSlice !== -1) {
    newEnd = start + lastInSlice + 1; // position after '}'
  } else {
    // Fallback: find the last '}' in the file up to end-1 but ensure it's inside the original span
    const lastBrace = src.lastIndexOf('}', Math.max(0, end - 1));
    if (lastBrace >= start) newEnd = lastBrace + 1;
  }
  // include trailing semicolons and whitespace/newlines
  while (newEnd < src.length) {
    const ch = src.charAt(newEnd);
    if (ch === ';' || ch === ' ' || ch === '\t' || ch === '\r' || ch === '\n') newEnd++;
    else break;
  }
  return [start, newEnd];
}

module.exports = function (fileInfo, api, opts) {
  const j = api.jscodeshift;
  const src = fileInfo.source;
  const root = j(src);

  const parsed = parseProcessArgs();
  const options = Object.assign({}, parsed, opts || {});

  const kind = options.kind;
  const replacementPath = options.replacement || options.replacementFile || options.r;
  if (!kind || !replacementPath) return null;
  const bodyOnly = options['body-only'] || options.bodyOnly || false;
  const idx = options.index !== undefined ? parseInt(options.index, 10) : undefined;

  const replacement = readReplacement(replacementPath);
  if (replacement === null) {
    console.error('[replace-node] replacement file not readable; skipping file', fileInfo.path);
    return null;
  }

  const matches = [];

  try {
    if (kind === 'class') {
      const name = options.name;
      if (!name) return null;
      // ClassDeclaration
      root.find(j.ClassDeclaration, { id: { name } }).forEach((path) => {
        const node = path.node;
        const parent = path.parent && path.parent.node ? path.parent.node : null;
        const target = parent && parent.type && parent.type.startsWith('Export') ? parent : node;
        const range = getNodeRange(target, src);
        if (range) {
          const adj = adjustRangeToLastClosingBrace(range[0], range[1], src);
          matches.push({ start: adj[0], end: adj[1], desc: 'ClassDeclaration' });
        }
      });
      // const X = class { }
      root
        .find(j.VariableDeclarator, { id: { name } })
        .filter((path) => path.node.init && path.node.init.type === 'ClassExpression')
        .forEach((path) => {
          const varDecl = path.parent && path.parent.node ? path.parent.node : null;
          const parentParent =
            path.parent && path.parent.parentPath && path.parent.parentPath.node
              ? path.parent.parentPath.node
              : null;
          const target =
            parentParent && parentParent.type && parentParent.type.startsWith('Export')
              ? parentParent
              : varDecl || path.node;
          const range = getNodeRange(target, src);
          if (range) {
            const adj = adjustRangeToLastClosingBrace(range[0], range[1], src);
            matches.push({ start: adj[0], end: adj[1], desc: 'Variable(ClassExpression)' });
          }
        });
    } else if (kind === 'method') {
      const className = options.class || options.className;
      const methodName = options.method || options.name;
      if (!className || !methodName) return null;
      // Named class declarations
      root.find(j.ClassDeclaration, { id: { name: className } }).forEach((classPath) => {
        const body = (classPath.node.body && classPath.node.body.body) || [];
        body.forEach((elem) => {
          if (
            (elem.type === 'MethodDefinition' || elem.type === 'ClassMethod') &&
            !elem.computed &&
            elem.key &&
            elem.key.type === 'Identifier' &&
            elem.key.name === methodName
          ) {
            // target: whole method (signature + body) unless bodyOnly requested
            const target = bodyOnly && elem.value && elem.value.body ? elem.value.body : elem;
            const range = getNodeRange(target, src);
            if (range) {
              const adj = adjustRangeToLastClosingBrace(range[0], range[1], src);
              matches.push({ start: adj[0], end: adj[1], desc: 'MethodDefinition' });
            }
          }
        });
      });
      // class expressions assigned to variables: const C = class { method() {} }
      root
        .find(j.VariableDeclarator)
        .filter((path) => path.node.init && path.node.init.type === 'ClassExpression')
        .forEach((path) => {
          const varInit = path.node.init;
          const idName =
            path.node.id && path.node.id.type === 'Identifier' ? path.node.id.name : null;
          if (idName !== className) return;
          const body = (varInit.body && varInit.body.body) || [];
          body.forEach((elem) => {
            if (
              (elem.type === 'MethodDefinition' || elem.type === 'ClassMethod') &&
              !elem.computed &&
              elem.key &&
              elem.key.type === 'Identifier' &&
              elem.key.name === methodName
            ) {
              const target = bodyOnly && elem.value && elem.value.body ? elem.value.body : elem;
              const range = getNodeRange(target, src);
              if (range) {
                const adj = adjustRangeToLastClosingBrace(range[0], range[1], src);
                matches.push({ start: adj[0], end: adj[1], desc: 'MethodDefinition(ClassExpr)' });
              }
            }
          });
        });
    } else if (kind === 'function') {
      const name = options.name;
      if (!name) return null;
      // FunctionDeclaration
      root.find(j.FunctionDeclaration, { id: { name } }).forEach((path) => {
        const node = path.node;
        const parent = path.parent && path.parent.node ? path.parent.node : null;
        const target = parent && parent.type && parent.type.startsWith('Export') ? parent : node;
        const range = getNodeRange(target, src);
        if (range) {
          const adj = adjustRangeToLastClosingBrace(range[0], range[1], src);
          matches.push({ start: adj[0], end: adj[1], desc: 'FunctionDeclaration' });
        }
      });
      // const f = function() {} or const f = () => {}
      root
        .find(j.VariableDeclarator, { id: { name } })
        .filter(
          (path) =>
            path.node.init &&
            (path.node.init.type === 'FunctionExpression' ||
              path.node.init.type === 'ArrowFunctionExpression'),
        )
        .forEach((path) => {
          const varDecl = path.parent && path.parent.node ? path.parent.node : null;
          const parentParent =
            path.parent && path.parent.parentPath && path.parent.parentPath.node
              ? path.parent.parentPath.node
              : null;
          const target =
            parentParent && parentParent.type && parentParent.type.startsWith('Export')
              ? parentParent
              : varDecl || path.node;
          const range = getNodeRange(target, src);
          if (range) {
            const adj = adjustRangeToLastClosingBrace(range[0], range[1], src);
            matches.push({ start: adj[0], end: adj[1], desc: 'Variable(FunctionExpression)' });
          }
        });
    } else if (kind === 'variable') {
      const name = options.name;
      if (!name) return null;
      root.find(j.VariableDeclarator, { id: { name } }).forEach((path) => {
        const varDecl = path.parent && path.parent.node ? path.parent.node : null;
        const parentParent =
          path.parent && path.parent.parentPath && path.parent.parentPath.node
            ? path.parent.parentPath.node
            : null;
        const target =
          parentParent && parentParent.type && parentParent.type.startsWith('Export')
            ? parentParent
            : varDecl || path.node;
        const range = getNodeRange(target, src);
        if (range) {
          const adj = adjustRangeToLastClosingBrace(range[0], range[1], src);
          matches.push({ start: adj[0], end: adj[1], desc: 'VariableDeclarator' });
        }
      });
    } else {
      return null;
    }
  } catch (err) {
    console.error('[replace-node] error during AST walk:', err && err.stack ? err.stack : err);
    return null;
  }

  if (matches.length === 0) return null;

  // If index provided, pick only that match
  let chosen = matches;
  if (typeof idx === 'number' && !isNaN(idx)) {
    if (idx < 0 || idx >= matches.length) return null;
    chosen = [matches[idx]];
  }

  // Apply replacements from end -> start so offsets remain valid
  const sorted = chosen.slice().sort((a, b) => b.start - a.start);
  let newSrc = src;
  for (const m of sorted) {
    newSrc = newSrc.slice(0, m.start) + replacement + newSrc.slice(m.end);
  }

  return newSrc;
};
