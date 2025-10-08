#!/usr/bin/env node
// scripts/rename-identifier.cjs
// Scope-aware per-file renamer (acorn-based).
// - Finds a declaration for the old name and renames the declaration + all references that resolve to that binding.
// - Dry-run prints a unified diff. Use --apply to write the file. Use --check to run `node --check` after applying.

const fs = require('fs');
const path = require('path');
const os = require('os');
const child_process = require('child_process');
let acorn;
try {
  acorn = require('acorn');
} catch (e) {
  console.error('Missing dependency: acorn. Install with `npm install --no-save acorn`');
  process.exit(1);
}

function usage() {
  console.error(
    'Usage: node scripts/rename-identifier.cjs --file <file> --old <oldName> --new <newName> [--index N] [--apply] [--check]',
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
const oldName = getArg('--old', '-o');
const newName = getArg('--new', '-n');
const indexArg = getArg('--index');
const apply = hasFlag('--apply');
const check = hasFlag('--check');

if (!filePath || !oldName || !newName) usage();

let src;
try {
  src = fs.readFileSync(filePath, 'utf8');
} catch (e) {
  console.error('Failed to read file:', e.message);
  process.exit(1);
}

let ast;
try {
  ast = acorn.parse(src, {
    ecmaVersion: 2020,
    sourceType: 'module',
    locations: true,
    ranges: true,
  });
} catch (e) {
  console.error('Failed to parse source file with acorn:', e.message);
  process.exit(1);
}

let scopeIdCounter = 0;
function createScope(type, node, parent) {
  const s = { id: ++scopeIdCounter, type, node, parent, decls: new Map(), children: [] };
  if (parent) parent.children.push(s);
  return s;
}

function collectPatternIdentifiers(node, cb) {
  if (!node) return;
  switch (node.type) {
    case 'Identifier':
      cb(node.name, node);
      break;
    case 'ObjectPattern':
      for (const prop of node.properties || []) {
        if (prop.type === 'Property') collectPatternIdentifiers(prop.value, cb);
        else if (prop.type === 'RestElement') collectPatternIdentifiers(prop.argument, cb);
      }
      break;
    case 'ArrayPattern':
      for (const el of node.elements || []) if (el) collectPatternIdentifiers(el, cb);
      break;
    case 'AssignmentPattern':
      collectPatternIdentifiers(node.left, cb);
      break;
    case 'RestElement':
      collectPatternIdentifiers(node.argument, cb);
      break;
    default:
      break;
  }
}

function nearestFunctionScope(scope) {
  let s = scope;
  while (s && s.type !== 'function' && s.type !== 'program') s = s.parent;
  return s || scope;
}

// Build lexical scopes and attach __scope to every node we visit
const rootScope = createScope('program', ast, null);

function traverse(node, parent, scope) {
  if (!node || typeof node.type !== 'string') return;
  // attach scope pointer for resolution
  node.__scope = scope;

  switch (node.type) {
    case 'Program':
      for (const stmt of node.body || []) traverse(stmt, node, scope);
      return;

    case 'FunctionDeclaration':
      if (node.id && node.id.type === 'Identifier')
        scope.decls.set(node.id.name, { node: node.id, kind: 'function' });
      const fnScope = createScope('function', node, scope);
      // params
      for (const p of node.params || [])
        collectPatternIdentifiers(p, (name, idNode) =>
          fnScope.decls.set(name, { node: idNode, kind: 'param' }),
        );
      traverse(node.body, node, fnScope);
      return;

    case 'FunctionExpression':
    case 'ArrowFunctionExpression': {
      const fScope = createScope('function', node, scope);
      if (node.type === 'FunctionExpression' && node.id && node.id.type === 'Identifier')
        fScope.decls.set(node.id.name, { node: node.id, kind: 'functionExpression' });
      for (const p of node.params || [])
        collectPatternIdentifiers(p, (name, idNode) =>
          fScope.decls.set(name, { node: idNode, kind: 'param' }),
        );
      traverse(node.body, node, fScope);
      return;
    }

    case 'BlockStatement': {
      const bScope = createScope('block', node, scope);
      for (const stmt of node.body || []) traverse(stmt, node, bScope);
      return;
    }

    case 'CatchClause': {
      const cScope = createScope('block', node, scope);
      if (node.param)
        collectPatternIdentifiers(node.param, (name, idNode) =>
          cScope.decls.set(name, { node: idNode, kind: 'param' }),
        );
      traverse(node.body, node, cScope);
      return;
    }

    case 'VariableDeclaration':
      for (const decl of node.declarations || []) {
        collectPatternIdentifiers(decl.id, (name, idNode) => {
          if (node.kind === 'var') {
            const fn = nearestFunctionScope(scope);
            fn.decls.set(name, { node: idNode, kind: 'var' });
          } else {
            scope.decls.set(name, { node: idNode, kind: node.kind });
          }
        });
      }
      for (const decl of node.declarations || []) if (decl.init) traverse(decl.init, node, scope);
      return;

    case 'ClassDeclaration':
      if (node.id && node.id.type === 'Identifier')
        scope.decls.set(node.id.name, { node: node.id, kind: 'class' });
      if (node.body) traverse(node.body, node, scope);
      return;

    case 'ImportDeclaration': {
      // register names on top-level
      let top = scope;
      while (top && top.parent) top = top.parent;
      const topScope = top || scope;
      for (const spec of node.specifiers || [])
        if (spec.local && spec.local.type === 'Identifier')
          topScope.decls.set(spec.local.name, { node: spec.local, kind: 'import' });
      return;
    }

    default:
      break;
  }

  // Generic traversal for other nodes
  for (const key of Object.keys(node)) {
    if (key === '__scope') continue;
    const child = node[key];
    if (Array.isArray(child)) {
      for (const c of child)
        if (c && typeof c.type === 'string' && /^[A-Z]/.test(c.type)) traverse(c, node, scope);
    } else if (child && typeof child.type === 'string' && /^[A-Z]/.test(child.type)) {
      traverse(child, node, scope);
    }
  }
}

// Initialize traversal
for (const stmt of ast.body || []) traverse(stmt, ast, rootScope);

// Collect candidate declarations
const candidates = [];
function collectCandidates(scope) {
  if (scope.decls && scope.decls.has(oldName)) {
    candidates.push({ scope, info: scope.decls.get(oldName) });
  }
  for (const ch of scope.children || []) collectCandidates(ch);
}
collectCandidates(rootScope);

if (candidates.length === 0) {
  console.error(`No declaration for '${oldName}' found in ${filePath}`);
  process.exit(1);
}

let chosen = null;
if (candidates.length === 1) chosen = candidates[0];
else {
  if (indexArg === undefined) {
    console.error(`Found ${candidates.length} declarations for '${oldName}':`);
    candidates.forEach((c, i) => {
      const n = c.info && c.info.node ? c.info.node : c.scope.node || {};
      const s =
        n.loc && n.loc.start ? `${n.loc.start.line}:${n.loc.start.column}` : `@${n.start || 0}`;
      const snippet =
        n.start !== undefined && n.end !== undefined
          ? src
              .slice(n.start, Math.min(n.end, n.start + 160))
              .split('\n')[0]
              .replace(/\s+/g, ' ')
          : '<unknown>';
      console.error(
        `${i}: kind=${c.info.kind || 'unknown'} scope=${c.scope.type} (${s}) => ${snippet.slice(0, 140)}`,
      );
    });
    console.error('Rerun with --index <N> to pick one of the above.');
    process.exit(2);
  } else {
    const idx = parseInt(indexArg, 10);
    if (isNaN(idx) || idx < 0 || idx >= candidates.length) {
      console.error('Invalid --index');
      process.exit(2);
    }
    chosen = candidates[idx];
  }
}

const targetScope = chosen.scope;

// Helper: detect non-reference identifier contexts
function isIdentifierNonRef(node, parent) {
  if (!parent) return false;
  if (
    (parent.type === 'VariableDeclarator' && parent.id === node) ||
    (parent.type === 'FunctionDeclaration' && parent.id === node) ||
    (parent.type === 'ClassDeclaration' && parent.id === node) ||
    (parent.type === 'FunctionExpression' && parent.id === node)
  )
    return true;
  if (
    (parent.type === 'Property' || parent.type === 'ObjectProperty') &&
    parent.key === node &&
    parent.computed === false
  )
    return true;
  if (parent.type === 'MemberExpression' && parent.property === node && parent.computed === false)
    return true;
  if (parent.type === 'MethodDefinition' && parent.key === node && parent.computed === false)
    return true;
  if (parent.type && parent.type.startsWith('Import')) return true;
  if (parent.type && parent.type.startsWith('Export')) return true;
  if (
    (parent.type === 'LabeledStatement' ||
      parent.type === 'BreakStatement' ||
      parent.type === 'ContinueStatement') &&
    parent.label === node
  )
    return true;
  return false;
}

// Collect replacements: declaration sites + references that resolve to the same scope
const replacements = new Map();
function markReplacement(start, end, newText) {
  replacements.set(`${start}:${end}`, { start, end, newText });
}

// Add declaration nodes from chosen scope
for (const [name, info] of targetScope.decls.entries()) {
  if (name !== oldName) continue;
  const n = info.node;
  if (n && typeof n.start === 'number' && typeof n.end === 'number')
    markReplacement(n.start, n.end, newName);
}

// Walk AST to locate Identifier nodes and resolve them
function findIds(node, parent) {
  if (!node || typeof node.type !== 'string') return;
  if (node.type === 'Identifier' && node.name === oldName) {
    if (!isIdentifierNonRef(node, parent)) {
      // resolve by walking __scope up to find declaring scope
      let s = node.__scope || rootScope;
      while (s) {
        if (s.decls && s.decls.has(oldName)) break;
        s = s.parent;
      }
      if (s && s.id === targetScope.id) {
        if (typeof node.start === 'number' && typeof node.end === 'number')
          markReplacement(node.start, node.end, newName);
      }
    }
  }
  for (const key of Object.keys(node)) {
    if (key === '__scope') continue;
    const child = node[key];
    if (Array.isArray(child)) {
      for (const c of child)
        if (c && typeof c.type === 'string' && /^[A-Z]/.test(c.type)) findIds(c, node);
    } else if (child && typeof child.type === 'string' && /^[A-Z]/.test(child.type)) {
      findIds(child, node);
    }
  }
}

findIds(ast, null);

if (replacements.size === 0) {
  console.error('No references to rename were found for the selected declaration (no-op).');
  process.exit(0);
}

// Apply replacements from end -> start
const edits = Array.from(replacements.values()).sort((a, b) => b.start - a.start);
let newSource = src;
for (const e of edits) {
  newSource = newSource.slice(0, e.start) + e.newText + newSource.slice(e.end);
}

// Emit diff
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rename-id-'));
const origTmp = path.join(tmpDir, 'orig');
const newTmp = path.join(tmpDir, 'new');
fs.writeFileSync(origTmp, src, 'utf8');
fs.writeFileSync(newTmp, newSource, 'utf8');
function runDiff(a, b) {
  try {
    const res = child_process.spawnSync(
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
  console.log(newSource);
  console.log('----- END NEW FILE CONTENT -----');
} else {
  if (patch.trim() === '') console.log('No changes detected (no-op).');
  else console.log(patch);
}

if (apply) {
  const backup = filePath + '.bak.rename-identifier';
  try {
    if (fs.existsSync(filePath)) fs.copyFileSync(filePath, backup);
    fs.writeFileSync(filePath, newSource, 'utf8');
    if (check) {
      const ext = path.extname(filePath).toLowerCase();
      if (ext === '.js' || ext === '.cjs' || ext === '.mjs') {
        const chk = child_process.spawnSync('node', ['--check', filePath], { encoding: 'utf8' });
        if (chk.status !== 0) {
          console.error(
            'Syntax check failed after applying change; rolling back. Output:\n',
            chk.stderr || chk.stdout,
          );
          if (fs.existsSync(backup)) fs.copyFileSync(backup, filePath);
          if (fs.existsSync(backup)) fs.unlinkSync(backup);
          process.exit(3);
        }
      }
    }
    if (fs.existsSync(backup)) fs.unlinkSync(backup);
    console.error('Successfully applied rename to', filePath);
  } catch (err) {
    console.error('Failed to apply rename:', err.message);
    try {
      if (fs.existsSync(backup)) fs.copyFileSync(backup, filePath);
    } catch (e) {}
    process.exit(1);
  }
} else {
  console.error('Dry-run (no changes written). Use --apply to write the file in-place.');
}
