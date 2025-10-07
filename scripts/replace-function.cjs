#!/usr/bin/env node
// scripts/replace-function.cjs
// Replace a top-level function (or single-declarator variable) in a JS file by name.
// Usage:
//   node scripts/replace-function.cjs --file path/to/file.js --name myFn --replacement newFn.js [--index N] [--apply] [--check]
//
// Notes:
//  - Dry-run by default: prints a unified diff. Use --apply to write changes.
//  - If multiple matches exist, re-run with --index N to pick one.
//  - For variable-assigned functions, the script only replaces the whole declaration when that declaration contains a single declarator. Multi-declarator declarations are reported as unsupported (to avoid introducing syntax errors).
//  - If the original node is exported (export / export default), the script attempts to preserve the export prefix when helpful.

const fs = require('fs');
const path = require('path');
const os = require('os');
const child_process = require('child_process');

let acorn;
try {
  acorn = require('acorn');
} catch (e) {
  console.error('Missing dependency: acorn. Install it with `npm install --no-save acorn`');
  process.exit(1);
}

function usage() {
  console.error('Usage: node scripts/replace-function.cjs --file <file> --name <functionName> --replacement <replacement-file> [--index N] [--apply] [--check]');
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

const filePath = getArg('--file','-f');
const fnName = getArg('--name','-n');
const replPath = getArg('--replacement','-r');
const indexArg = getArg('--index');
const apply = hasFlag('--apply');
const check = hasFlag('--check');

if (!filePath || !fnName || !replPath) usage();

let src;
try { src = fs.readFileSync(filePath, 'utf8'); } catch (e) { console.error('Failed to read file:', e.message); process.exit(1); }
let replacement;
try { replacement = fs.readFileSync(replPath, 'utf8'); } catch (e) { console.error('Failed to read replacement file:', e.message); process.exit(1); }

let ast;
try {
  ast = acorn.parse(src, { ecmaVersion: 2020, sourceType: 'module', locations: true, ranges: true });
} catch (e) {
  console.error('Failed to parse source file with acorn:', e.message);
  process.exit(1);
}

const matches = [];
function walk(node, parents) {
  if (!node || typeof node.type !== 'string') return;
  const parent = parents[parents.length - 1] || null;
  // match function declarations
  if (node.type === 'FunctionDeclaration' && node.id && node.id.name === fnName) {
    matches.push({ type: 'FunctionDeclaration', node, parents: parents.slice() });
  }
  // match variable declarators (const/let/var name = function/arrow)
  if (node.type === 'VariableDeclarator' && node.id && node.id.name === fnName) {
    const init = node.init;
    if (init && (init.type === 'FunctionExpression' || init.type === 'ArrowFunctionExpression')) {
      matches.push({ type: 'VariableDeclarator', node, parents: parents.slice() });
    }
  }
  // recurse children
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

if (matches.length === 0) {
  console.error(`No function named '${fnName}' found in ${filePath}`);
  process.exit(1);
}

let chosen = null;
if (matches.length === 1) {
  chosen = matches[0];
} else {
  if (indexArg === undefined) {
    console.error(`Found ${matches.length} candidates for '${fnName}':`);
    matches.forEach((m,i) => {
      const n = m.node;
      const s = n.loc && n.loc.start ? `${n.loc.start.line}:${n.loc.start.column}` : `@${n.start}`;
      const e = n.loc && n.loc.end ? `${n.loc.end.line}:${n.loc.end.column}` : `@${n.end}`;
      const snippet = src.slice(n.start, Math.min(n.end, n.start + 240)).split('\n')[0];
      console.error(`${i}: ${m.type} (${s} - ${e}) => ${snippet.replace(/\s+/g,' ').slice(0,160)}`);
    });
    console.error('Rerun with --index <N> to pick one of the above.');
    process.exit(2);
  } else {
    const idx = parseInt(indexArg, 10);
    if (isNaN(idx) || idx < 0 || idx >= matches.length) {
      console.error('Invalid --index value');
      process.exit(2);
    }
    chosen = matches[idx];
  }
}

const node = chosen.node;
const parents = chosen.parents || [];
const parent = parents[parents.length - 1] || null;
const grandparent = parents[parents.length - 2] || null;

let replaceStart = node.start;
let replaceEnd = node.end;

if (chosen.type === 'FunctionDeclaration') {
  // If the function is wrapped in an ExportNamedDeclaration / ExportDefaultDeclaration, replace the outer export node so the replacement can include export if desired.
  if (parent && parent.type && parent.type.startsWith('Export')) {
    replaceStart = parent.start;
    replaceEnd = parent.end;
  }
} else if (chosen.type === 'VariableDeclarator') {
  // Find the nearest VariableDeclaration parent
  let varDecl = null;
  for (let i = parents.length - 1; i >= 0; i--) {
    if (parents[i] && parents[i].type === 'VariableDeclaration') { varDecl = parents[i]; break; }
  }
  const varDeclParent = varDecl && parents[parents.indexOf(varDecl) - 1] ? parents[parents.indexOf(varDecl) - 1] : null;
  if (!varDecl) {
    console.error('Internal: Could not locate enclosing VariableDeclaration for the VariableDeclarator.');
    process.exit(1);
  }
  if (varDecl.declarations && varDecl.declarations.length === 1) {
    // safe to replace the whole declaration (and include export if the declaration is exported)
    if (varDeclParent && varDeclParent.type && varDeclParent.type.startsWith('Export')) {
      replaceStart = varDeclParent.start;
      replaceEnd = varDeclParent.end;
    } else {
      replaceStart = varDecl.start;
      replaceEnd = varDecl.end;
    }
  } else {
    console.error('Found a declaration with multiple declarators (e.g. `const a = 1, b = 2;`).\nThis script will not try to rewrite a single declarator inside a multi-declarator declaration to avoid introducing syntax errors. Please split the declaration manually or run a custom codemod.');
    process.exit(1);
  }
}

// If we're replacing an exported node but the replacement text does not include 'export', attempt to preserve the original export prefix.
const prefixSlice = src.slice(replaceStart, node.start);
const exportMatch = prefixSlice.match(/^\s*(export(?:\s+default)?\s*)/);
if (exportMatch) {
  const exportPrefix = exportMatch[1];
  if (!/^\s*export\b/.test(replacement)) {
    replacement = exportPrefix + replacement;
  }
}

const newSource = src.slice(0, replaceStart) + replacement + src.slice(replaceEnd);

// Write temps and run diff -u for preview
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'replace-fn-'));
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
  if (patch.trim() === '') {
    console.log('No changes detected (replacement equals existing text in the range).');
  } else {
    console.log(patch);
  }
}

if (apply) {
  const backup = filePath + '.bak.replace-fn';
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
    console.error('Successfully applied replacement to', filePath);
  } catch (err) {
    console.error('Failed to apply replacement:', err.message);
    try { if (fs.existsSync(backup)) fs.copyFileSync(backup, filePath); } catch(e){}
    process.exit(1);
  }
} else {
  console.error('Dry-run (no changes written). Use --apply to write the file in-place.');
}

// Clean up temp dir if desired - leaving it for inspection can be helpful when debugging.
