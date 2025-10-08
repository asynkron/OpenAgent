#!/usr/bin/env node
// scripts/replace-function.cjs
// Replace a top-level function (or single-variable declarator) in a JS file by name.
// Usage:
//   node scripts/replace-function.cjs --file path/to/file.js --name fnName --replacement newFn.js [--index N] [--apply] [--check]

const fs = require('fs');
const path = require('path');
const os = require('os');
const child_process = require('child_process');

let acorn;
try { acorn = require('acorn'); } catch (e) {
  console.error('Missing dependency: acorn. Install it with `npm install --no-save acorn`');
  process.exit(1);
}

function usage() { console.error('Usage: node scripts/replace-function.cjs --file <file> --name <fnName> --replacement <file> [--index N] [--apply] [--check]'); process.exit(2); }

const argv = process.argv.slice(2);
function hasFlag(name) { return argv.includes(name); }
function getArg(name, alt) { const i = argv.indexOf(name); if (i >= 0 && i + 1 < argv.length) return argv[i+1]; if (alt) { const j = argv.indexOf(alt); if (j >= 0 && j + 1 < argv.length) return argv[j+1]; } return undefined; }

const filePath = getArg('--file','-f');
const fnName = getArg('--name','-n');
const replPath = getArg('--replacement','-r');
const indexArg = getArg('--index');
const apply = hasFlag('--apply');
const check = hasFlag('--check');

if (!filePath || !fnName || !replPath) usage();

let src;
try { src = fs.readFileSync(filePath,'utf8'); } catch (e) { console.error('Failed to read file:', e.message); process.exit(1); }
let replacement;
try { replacement = fs.readFileSync(replPath,'utf8'); } catch (e) { console.error('Failed to read replacement file:', e.message); process.exit(1); }

let ast;
try { ast = acorn.parse(src, { ecmaVersion: 2020, sourceType: 'module', locations: true, ranges: true }); } catch (e) { console.error('Failed to parse source with acorn:', e.message); process.exit(1); }

const matches = [];
function walk(node, parents) {
  if (!node || typeof node.type !== 'string') return;
  const parent = parents[parents.length - 1] || null;
  if (node.type === 'FunctionDeclaration' && node.id && node.id.name === fnName) {
    matches.push({ node, parents: parents.slice() });
  } else if (node.type === 'VariableDeclarator' && node.id && node.id.name === fnName) {
    const init = node.init;
    if (init && (init.type === 'FunctionExpression' || init.type === 'ArrowFunctionExpression')) {
      matches.push({ node, parents: parents.slice() });
    }
  }
  for (const k of Object.keys(node)) {
    const child = node[k];
    if (Array.isArray(child)) {
      for (const c of child) walk(c, parents.concat(node));
    } else if (child && typeof child.type === 'string') {
      walk(child, parents.concat(node));
    }
  }
}
walk(ast, []);

if (matches.length === 0) { console.error(`No function named '${fnName}' found in ${filePath}`); process.exit(1); }

let chosen = null;
if (matches.length === 1) chosen = matches[0];
else {
  if (indexArg === undefined) {
    console.error(`Found ${matches.length} candidates for '${fnName}':`);
    matches.forEach((m,i) => {
      const n = m.node; const s = n.loc && n.loc.start ? `${n.loc.start.line}:${n.loc.start.column}` : `@${n.start}`; const e = n.loc && n.loc.end ? `${n.loc.end.line}:${n.loc.end.column}` : `@${n.end}`; const snippet = src.slice(n.start, Math.min(n.end, n.start + 200)).split('\n')[0];
      console.error(`${i}: ${m.node.type} (${s} - ${e}) => ${snippet.replace(/\s+/g,' ').slice(0,120)}`);
    });
    console.error('Rerun with --index <N> to pick one of the above.');
    process.exit(2);
  } else {
    const idx = parseInt(indexArg, 10);
    if (isNaN(idx) || idx < 0 || idx >= matches.length) { console.error('Invalid --index value'); process.exit(2); }
    chosen = matches[idx];
  }
}
if (!chosen) chosen = matches[0];

const node = chosen.node;
// find enclosing export wrapper if present (check parents array)
const parents = chosen.parents || [];
const parent = parents[parents.length - 1] || null;
const grandparent = parents[parents.length - 2] || null;
let replaceStart = node.start;
let replaceEnd = node.end;
// if parent is an ExportNamed/DefaultDeclaration, replace the wrapper
if (parent && parent.type && parent.type.startsWith('Export')) {
  replaceStart = parent.start; replaceEnd = parent.end;
} else if (node.type === 'VariableDeclarator') {
  // try to replace the whole VariableDeclaration if possible
  // parent should be VariableDeclaration
  const varDecl = parents.slice().reverse().find(p => p && p.type === 'VariableDeclaration');
  const varDeclParent = parents[parents.length - 2] || null;
  if (varDecl && varDecl.declarations && varDecl.declarations.length === 1) {
    replaceStart = varDecl.start; replaceEnd = varDecl.end;
    if (varDeclParent && varDeclParent.type && varDeclParent.type.startsWith('Export')) { replaceStart = varDeclParent.start; replaceEnd = varDeclParent.end; }
  } else {
    console.error('Found a declaration with multiple declarators; not attempting partial rewrites.'); process.exit(1);
  }
}

// adjust end to include the last '}' inside range and trailing semicolons/whitespace
function adjustRangeToLastClosingBrace(start, end, src) {
  const slice = src.slice(start, end);
  const lastInSlice = slice.lastIndexOf('}');
  let newEnd = end;
  if (lastInSlice !== -1) newEnd = start + lastInSlice + 1;
  else {
    const lastBrace = src.lastIndexOf('}', Math.max(0, end - 1));
    if (lastBrace >= start) newEnd = lastBrace + 1;
  }
  while (newEnd < src.length && [';', ' ', '\t', '\r', '\n'].includes(src.charAt(newEnd))) newEnd++;
  return [start, newEnd];
}
const adj = adjustRangeToLastClosingBrace(replaceStart, replaceEnd, src);
replaceStart = adj[0]; replaceEnd = adj[1];

const newSource = src.slice(0, replaceStart) + replacement + src.slice(replaceEnd);

// write temps and show diff
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'replace-fn-'));
const origTmp = path.join(tmpDir, 'orig');
const newTmp = path.join(tmpDir, 'new');
fs.writeFileSync(origTmp, src, 'utf8');
fs.writeFileSync(newTmp, newSource, 'utf8');

function runDiff(a,b) {
  try { const res = child_process.spawnSync('diff', ['-u', '--label', `a/${filePath}`, '--label', `b/${filePath}`, a, b], { encoding: 'utf8' }); if (res.error) throw res.error; return res.stdout || ''; } catch (err) { return null; }
}
const patch = runDiff(origTmp, newTmp);
if (patch === null) {
  console.log('----- BEGIN NEW FILE CONTENT -----');
  console.log(newSource);
  console.log('----- END NEW FILE CONTENT -----');
} else {
  if (patch.trim() === '') console.log('No changes detected (no-op).'); else console.log(patch);
}

if (apply) {
  const backup = filePath + '.bak.replace-fn';
  try {
    if (fs.existsSync(filePath)) fs.copyFileSync(filePath, backup);
    fs.writeFileSync(filePath, newSource, 'utf8');
    if (check) {
      const chk = child_process.spawnSync('node', ['--check', filePath], { encoding: 'utf8' });
      if (chk.status !== 0) {
        console.error('Syntax check failed after applying change; rolling back. Output:\n', chk.stderr || chk.stdout);
        if (fs.existsSync(backup)) fs.copyFileSync(backup, filePath);
        if (fs.existsSync(backup)) fs.unlinkSync(backup);
        process.exit(3);
      }
    }
    if (fs.existsSync(backup)) fs.unlinkSync(backup);
    console.error('Successfully applied replacement to', filePath);
  } catch (err) {
    console.error('Failed to apply replacement:', err.message);
    try { if (fs.existsSync(backup)) fs.copyFileSync(backup, filePath); } catch(e){}
    process.exit(1);
  }
} else {
  console.error('Dry-run (no changes written). Use --apply to write the file in-place.');
}
