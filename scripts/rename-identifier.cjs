#!/usr/bin/env node
// scripts/rename-identifier.cjs
// Scope-aware identifier renamer for a single file.
// - Finds a single declaration for the old name (if multiple, choose with --index)
// - Renames the declaration and all references that resolve to that binding (respects shadowing)
// - Dry-run: prints unified diff. Use --apply to write the file.
// - Use --check to run `node --check` after applying and rollback on syntax errors.

/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');
const os = require('os');
const child_process = require('child_process');

let acorn;
try { acorn = require('acorn'); } catch (e) {
  console.error('Missing dependency: acorn. Install with `npm install --no-save acorn`');
  process.exit(1);
}

function usage() {
  console.error('Usage: node scripts/rename-identifier.cjs --file <file> --old <oldName> --new <newName> [--index N] [--apply] [--check]');
  process.exit(2);
}

const argv = process.argv.slice(2);
function hasFlag(name) { return argv.includes(name); }
function getArg(name, alt) {
  const i = argv.indexOf(name);
  if (i >= 0 && i + 1 < argv.length) return argv[i+1];
  if (alt) {
    const j = argv.indexOf(alt);
    if (j >= 0 && j + 1 < argv.length) return argv[j+1];
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
try { src = fs.readFileSync(filePath, 'utf8'); } catch (e) { console.error('Failed to read file:', e.message); process.exit(1); }

let ast;
try {
  ast = acorn.parse(src, { ecmaVersion: 2020, sourceType: 'module', locations: true, ranges: true });
} catch (e) {
  console.error('Failed to parse source file with acorn:', e.message);
  process.exit(1);
}

// Simple scope model and two-phase analysis (collect declarations, then resolve references)
let scopeIdCounter = 0;
function createScope(type, node, parent) {
  return { id: ++scopeIdCounter, type, node, parent, decls: new Map(), children: [] };
}

// Collect identifier names from patterns (Identifier, ObjectPattern, ArrayPattern, AssignmentPattern, RestElement)
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
      for (const el of node.elements || []) {
        if (!el) continue;
        collectPatternIdentifiers(el, cb);
      }
      break;
    case 'AssignmentPattern':
      collectPatternIdentifiers(node.left, cb);
      break;
    case 'RestElement':
      collectPatternIdentifiers(node.argument, cb);
      break;
    default:
      // unsupported pattern (e.g., MemberExpression), ignore
      break;
  }
}

// Phase 1: build scopes and collect declarations
function buildScopes(node, parentScope) {
  if (!node || typeof node.type !== 'string') return;

  // assign scope pointer for this node (use parentScope by default; some nodes create new scopes for their children)
  node.__scope = parentScope;

  // Helper to recurse with the same scope
  function recurse(child) {
    if (!child) return;
    if (Array.isArray(child)) {
      for (const c of child) if (c && typeof c.type === 'string') buildScopes(c, parentScope);
    } else if (child && typeof child.type === 'string') buildScopes(child, parentScope);
  }

  // Program (top-level) => treat as a function-like scope for var-hoisting purposes
  if (node.type === 'Program') {
    const rootScope = createScope('function', node, null);
    node.__scope = rootScope;
    for (const stmt of node.body || []) buildScopes(stmt, rootScope);
    return rootScope; // return the root scope
  }

  // FunctionDeclaration: hoisted into parentScope; create a function scope for body
  if (node.type === 'FunctionDeclaration') {
    if (node.id && node.id.type === 'Identifier') parentScope.decls.set(node.id.name, { node: node, kind: 'function' });
    const fnScope = createScope('function', node, parentScope);
    parentScope.children.push(fnScope);
    // add params to function scope
    for (const p of node.params || []) collectPatternIdentifiers(p, (name, idNode) => fnScope.decls.set(name, { node: idNode, kind: 'param' }));
    // body is a BlockStatement
    if (node.body) buildScopes(node.body, fnScope);
    return;
  }

  // FunctionExpression / ArrowFunctionExpression: create inner function scope
  if (node.type === 'FunctionExpression' || node.type === 'ArrowFunctionExpression') {
    const fnScope = createScope('function', node, parentScope);
    parentScope.children.push(fnScope);
    // name of FunctionExpression (if present) is local to fnScope
    if (node.type === 'FunctionExpression' && node.id && node.id.type === 'Identifier') fnScope.decls.set(node.id.name, { node: node.id, kind: 'functionExpression' });
    for (const p of node.params || []) collectPatternIdentifiers(p, (name, idNode) => fnScope.decls.set(name, { node: idNode, kind: 'param' }));
    if (node.body) buildScopes(node.body, fnScope);
    return;
  }

  // BlockStatement: block scope (for let/const)
  if (node.type === 'BlockStatement') {
    const blockScope = createScope('block', node, parentScope);
    parentScope.children.push(blockScope);
    for (const stmt of node.body || []) buildScopes(stmt, blockScope);
    return;
  }

  // CatchClause: creates a block scope with param
  if (node.type === 'CatchClause') {
    const catchScope = createScope('block', node, parentScope);
    parentScope.children.push(catchScope);
    if (node.param) collectPatternIdentifiers(node.param, (name, idNode) => catchScope.decls.set(name, { node: idNode, kind: 'param' }));
    if (node.body) buildScopes(node.body, catchScope);
    return;
  }

  // VariableDeclaration: add declarators to appropriate scope (var => nearest function scope, let/const => current block scope)
  if (node.type === 'VariableDeclaration') {
    for (const decl of node.declarations || []) {
      collectPatternIdentifiers(decl.id, (name, idNode) => {
        if (node.kind === 'var') {
          // find nearest function scope
          let s = parentScope;
          while (s && s.type !== 'function') s = s.parent;
          if (!s) s = parentScope;
          s.decls.set(name, { node: idNode, kind: 'var' });
        } else {
          parentScope.decls.set(name, { node: idNode, kind: node.kind });
        }
      });
    }
    // descend into initializers
    for (const decl of node.declarations || []) if (decl.init) buildScopes(decl.init, parentScope);
    return;
  }

  // ClassDeclaration: add to parent scope
  if (node.type === 'ClassDeclaration') {
    if (node.id && node.id.type === 'Identifier') parentScope.decls.set(node.id.name, { node: node, kind: 'class' });
    // traverse class body
    if (node.body) buildScopes(node.body, parentScope);
    return;
  }

  // ImportDeclaration: add to top-level (Program) scope
  if (node.type === 'ImportDeclaration') {
    let top = parentScope;
    while (top && top.parent) top = top.parent;
    if (!top) top = parentScope;
    for (const spec of node.specifiers || []) {
      if (spec.local && spec.local.type === 'Identifier') top.decls.set(spec.local.name, { node: spec.local, kind: 'import' });
    }
    return;
  }

  // Generic traversal for everything else: assign node.__scope and recurse
  for (const key of Object.keys(node)) {
    const child = node[key];
    if (Array.isArray(child)) {
      for (const c of child) if (c && typeof c.type === 'string') buildScopes(c, parentScope);
    } else if (child && typeof child.type === 'string') {
      buildScopes(child, parentScope);
    }
  }
}

// run phase 1
const rootScope = buildScopes(ast, null);
if (!rootScope) {
  console.error('Internal: failed to build scopes (unexpected AST shape)');
  process.exit(1);
}

// collect candidate declarations for oldName
const candidates = [];
function collectScopes(scope) {
  if (scope.decls && scope.decls.has(oldName)) {
    const info = scope.decls.get(oldName);
    // some decl entries have node pointing to the Identifier node or to Declarator/function/class node; normalize
    let declNode = info && info.node ? info.node : null;
    // try to find a sensible node to show location
    if (!declNode && info && info.node === undefined) declNode = scope.node;
    candidates.push({ scope, declNode, kind: info.kind || 'unknown' });
  }
  for (const ch of scope.children || []) collectScopes(ch);
}
collectScopes(rootScope);

if (candidates.length === 0) {
  console.error(`No declaration for '${oldName}' found in ${filePath}`);
  process.exit(1);
}

let chosen;
if (candidates.length === 1) chosen = candidates[0];
else {
  if (indexArg === undefined) {
    console.error(`Found ${candidates.length} declarations for '${oldName}':`);
    candidates.forEach((c, i) => {
      const n = c.declNode || c.scope.node || {};
      const s = n.loc && n.loc.start ? `${n.loc.start.line}:${n.loc.start.column}` : `@${n.start || 0}`;
      const snippet = (n.start !== undefined && n.end !== undefined) ? src.slice(n.start, Math.min(n.end, n.start + 160)).split('\n')[0].replace(/\s+/g,' ') : '<unknown>';
      console.error(`${i}: kind=${c.kind} scope=${c.scope.type} (${s}) => ${snippet.slice(0,140)}`);
    });
    console.error('Rerun with --index <N> to pick one of the above.');
    process.exit(2);
  } else {
    const idx = parseInt(indexArg, 10);
    if (isNaN(idx) || idx < 0 || idx >= candidates.length) { console.error('Invalid --index'); process.exit(2); }
    chosen = candidates[idx];
  }
}

const targetScope = chosen.scope;

// Phase 2: find all identifier nodes that resolve to targetScope
const replacements = new Map(); // key = "start:end" -> {start,end,newText}

function markReplacement(start, end, newText) {
  const key = `${start}:${end}`;
  replacements.set(key, { start, end, newText });
}

// add declaration site(s) from target scope (there could be multiple decl nodes for destructuring, params etc).
// iterate through targetScope.decls and add all nodes whose name === oldName
for (const [name, info] of targetScope.decls.entries()) {
  if (name !== oldName) continue;
  const n = info.node;
  if (n && typeof n.start === 'number' && typeof n.end === 'number') {
    markReplacement(n.start, n.end, newName);
  }
}

// resolver: given a node (we'll use node.__scope), find the declaring scope for 'oldName'
function resolveDeclScope(node) {
  let s = node && node.__scope ? node.__scope : null;
  // If node.__scope is null (shouldn't happen), fallback to rootScope
  if (!s) s = rootScope;
  while (s) {
    if (s.decls && s.decls.has(oldName)) return s;
    s = s.parent;
  }
  return null;
}

// helper: detect contexts where Identifier is not a variable reference (property key, label, import/export specifier, property name of member expression when not computed, etc.)
function isIdentifierNonRef(node, parent) {
  if (!parent) return false;
  // Declaration identifiers (we still include declarations explicitly earlier)
  if ((parent.type === 'VariableDeclarator' && parent.id === node)
      || (parent.type === 'FunctionDeclaration' && parent.id === node)
      || (parent.type === 'ClassDeclaration' && parent.id === node)
      || (parent.type === 'FunctionExpression' && parent.id === node)) return true;
  // Object property key (non-computed)
  if ((parent.type === 'Property' || parent.type === 'ObjectProperty') && parent.key === node && parent.computed === false) return true;
  // Member expression property when not computed: obj.prop -> 'prop' is not a reference to a binding
  if (parent.type === 'MemberExpression' && parent.property === node && parent.computed === false) return true;
  // MethodDefinition key
  if (parent.type === 'MethodDefinition' && parent.key === node && parent.computed === false) return true;
  // Import / Export specifiers
  if (parent.type && parent.type.startsWith('Import')) return true;
  if (parent.type && parent.type.startsWith('Export')) return true;
  // Labeled statement
  if ((parent.type === 'LabeledStatement' || parent.type === 'BreakStatement' || parent.type === 'ContinueStatement') && parent.label === node) return true;
  return false;
}

// Generic walker to find Identifier nodes — we walk the tree and pass parent to the visitor
function walkForIdentifiers(node, parent) {
  if (!node || typeof node.type !== 'string') return;
  // If this node is an Identifier candidate
  if (node.type === 'Identifier' && node.name === oldName) {
    if (!isIdentifierNonRef(node, parent)) {
      // find the declaration scope for this reference
      const declScope = resolveDeclScope(node);
      if (declScope && declScope.id === targetScope.id) {
        // this reference resolves to the target declaration -> rename
        if (typeof node.start === 'number' && typeof node.end === 'number') markReplacement(node.start, node.end, newName);
      }
    }
  }
  // Recurse children
  for (const key of Object.keys(node)) {
    const child = node[key];
    if (Array.isArray(child)) {
      for (const c of child) if (c && typeof c.type === 'string') walkForIdentifiers(c, node);
    } else if (child && typeof child.type === 'string') {
      walkForIdentifiers(child, node);
    }
  }
}

walkForIdentifiers(ast, null);

if (replacements.size === 0) {
  console.error('No references to rename were found for the selected declaration (no-op).');
  process.exit(0);
}

// Build new source by applying replacements from end -> start
const edits = Array.from(replacements.values()).sort((a, b) => b.start - a.start);
let newSource = src;
for (const e of edits) {
  newSource = newSource.slice(0, e.start) + e.newText + newSource.slice(e.end);
}

// Write temps and show diff -u
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rename-id-'));
const origTmp = path.join(tmpDir, 'orig');
const newTmp = path.join(tmpDir, 'new');
fs.writeFileSync(origTmp, src, 'utf8');
fs.writeFileSync(newTmp, newSource, 'utf8');

function runDiff(a, b) {
  try {
    const res = child_process.spawnSync('diff', ['-u', '--label', `a/${filePath}`, '--label', `b/${filePath}`, a, b], { encoding: 'utf8' });
    if (res.error) throw res.error;
    return res.stdout || '';
  } catch (err) {
    console.error('Failed to run diff -u (is diff installed?).\nFalling back to printing the new file content.');
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
    fs.copyFileSync(filePath, backup);
    fs.writeFileSync(filePath, newSource, 'utf8');
    if (check) {
      const chk = child_process.spawnSync('node', ['--check', filePath], { encoding: 'utf8' });
      if (chk.status !== 0) {
        console.error('Syntax check failed after applying change; rolling back. Output:\n', chk.stderr || chk.stdout);
        fs.copyFileSync(backup, filePath);
        fs.unlinkSync(backup);
        process.exit(3);
      }
    }
    if (fs.existsSync(backup)) fs.unlinkSync(backup);
    console.error('Successfully applied rename to', filePath);
  } catch (err) {
    console.error('Failed to apply rename:', err.message);
    try { if (fs.existsSync(backup)) fs.copyFileSync(backup, filePath); } catch (e) {}
    process.exit(1);
  }
} else {
  console.error('Dry-run (no changes written). Use --apply to write the file in-place.');
}
