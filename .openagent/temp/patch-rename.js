const fs = require('fs');
const p = 'scripts/rename-identifier.cjs';
let s = fs.readFileSync(p,'utf8');
// Add walkVisited if not present
if (!/const\s+walkVisited\s*=/.test(s)) {
  s = s.replace(/const\s+visitedNodes\s*=\s*new\s+WeakSet\(\)\s*;?/, m => m + '\nconst walkVisited = new WeakSet();');
}
// Replace function walkIdentifiers with a guarded version
s = s.replace(/function\s+walkIdentifiers\(node, parent\)\s*\{[\s\S]*?\n\}/, `function walkIdentifiers(node, parent) {
  if (!node || typeof node.type !== 'string') return;
  if (walkVisited.has(node)) return;
  walkVisited.add(node);
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
      for (const c of child) if (c && typeof c.type === 'string') walkIdentifiers(c, node);
    } else if (child && typeof child.type === 'string') {
      walkIdentifiers(child, node);
    }
  }
}`);

fs.writeFileSync(p, s, 'utf8');
console.log('patched', p);
