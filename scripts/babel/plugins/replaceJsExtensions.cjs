const fs = require('node:fs');
const path = require('node:path');

/**
 * Jest runs directly against the TypeScript sources, but the CLI package keeps
 * `.js` import specifiers so the emitted ESM stays Node-compatible. During the
 * tests there are no `.js` siblings, so we rewrite specifiers to `.ts`/`.tsx`
 * when a matching source file exists. At runtime the compiled output still preserves
 * the `.js` extensions because the original TypeScript keeps them intact.
 */
module.exports = function replaceJsExtensions({ types: t }) {
  function maybeRewriteLiteral(literal, filename) {
    if (!literal || typeof literal.value !== 'string') {
      return;
    }

    if (!literal.value.endsWith('.js') || !filename) {
      return;
    }

    const specifierDir = path.dirname(filename);
    const candidate = path.resolve(specifierDir, literal.value);

    if (fs.existsSync(candidate)) {
      // A real `.js` module is present, so we should not rewrite the import.
      return;
    }

    const replacementExtensions = ['.ts', '.tsx'];
    for (const extension of replacementExtensions) {
      const candidateWithExtension = candidate.replace(/\.js$/, extension);
      if (fs.existsSync(candidateWithExtension)) {
        const updated = literal.value.replace(/\.js$/, extension);
        return t.stringLiteral(updated);
      }
    }

    return undefined;
  }

  function rewriteSource(sourcePath, state) {
    const filename = state.file.opts.filename;
    const replacement = maybeRewriteLiteral(sourcePath.node, filename);
    if (replacement) {
      sourcePath.replaceWith(replacement);
    }
  }

  return {
    name: 'replace-js-extensions',
    visitor: {
      ImportDeclaration(path, state) {
        rewriteSource(path.get('source'), state);
      },
      CallExpression(path, state) {
        if (path.get('callee').isImport()) {
          const [firstArg] = path.get('arguments');
          if (firstArg && firstArg.isStringLiteral()) {
            rewriteSource(firstArg, state);
          }
        }
      },
      ExportNamedDeclaration(path, state) {
        if (path.node.source) {
          rewriteSource(path.get('source'), state);
        }
      },
      ExportAllDeclaration(path, state) {
        rewriteSource(path.get('source'), state);
      },
    },
  };
};
