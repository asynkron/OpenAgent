# Developer helper scripts

This file documents the small helper scripts in `packages/core/scripts/` that provide safe, auditable, single-file refactors. Each script prints a unified diff by default (dry-run). Use `--apply` to write changes and `--check` to run a syntax check after applying.

Prerequisites

- Node.js (a version compatible with this repo)
- `diff` available in PATH (used to produce unified diffs)
- `acorn` Node module (the scripts dynamically import `acorn`). If you see "Missing dependency: acorn", install it locally:

```
npm install --no-save acorn
```

General workflow

1. Run the script in dry-run mode to get a unified diff and review the changes.
2. If the diff looks good, re-run with `--apply --check` to apply the change and verify syntax (the script will rollback on syntax errors).
3. Run lint/format and tests (e.g., `npm run lint`, `npm run format`, `npm test`) and commit when everything is green.

Scripts

## ./packages/core/scripts/apply_patch.mjs

What it does

- Applies raw/headless patches supplied on stdin wrapped in `*** Begin Patch` / `*** End Patch` blocks.
- Matches hunks by exact line content (no line-number context required) and writes modified files back to disk.

When to use

- You have a heredoc patch without traditional `diff --git` headers or line numbers.
- You need a deterministic helper for tests, automation, or manual application of OpenAI-style patch outputs.

Usage

```bash
node packages/core/scripts/apply_patch.mjs <<'EOF'
*** Begin Patch
*** Update File: path/to/file.js
@@
-const value = 1;
+const value = 2;
*** End Patch
EOF
```

Notes

- Fails fast when a hunk cannot be located or a file is missing.
- Preserves trailing newline semantics when present in the original file.
- Emits a success summary mirroring the format shown in `scripts/patchexample.md`.

## ./packages/core/scripts/rename-identifier.mjs

What it does

- Scope-aware per-file renamer. Renames a declaration and all references that resolve to that declaration, respecting lexical scoping and avoiding shadowed bindings.

When to use

- Rename local variables, function names, parameters, or classes inside a single file.
- Not intended for renaming across multiple files or across modules. For repo-wide renames use an IDE refactor or a codemod (e.g., jscodeshift).

Usage

Dry-run (preview unified diff):

```bash
node packages/core/scripts/rename-identifier.mjs --file path/to/file.js --old oldName --new newName
```

Apply with syntax check:

```bash
node packages/core/scripts/rename-identifier.mjs --file path/to/file.js --old oldName --new newName --apply --check
```

Notes

- If multiple declarations for `oldName` exist, run once to list candidates then re-run with `--index N` to pick the correct one.
- The script will not attempt to rewrite a single declarator inside a multi-declarator declaration (e.g., `const a = 1, b = 2;`). This is to avoid producing invalid syntax.
- Backup created on apply: `path/to/file.js.bak.rename-identifier`.

Best practices

- Always run dry-run and review the diff before applying.
- After applying, run the repository's linter/formatter and tests.
- Prefer tool-assisted or typed renames (TypeScript/IDE refactors) for cross-file or API-level renames.

Example npm scripts (optional)

Add these to `package.json` to make invocation shorter:

```json
"scripts": {
  "rename-id": "node packages/core/scripts/rename-identifier.mjs"
}
```

Troubleshooting

- Missing `acorn`: install with `npm install --no-save acorn`.
- `diff` not found: install coreutils or ensure your PATH contains a diff implementation.
- Syntax check fails after apply: the script attempts to rollback using the backup file. Inspect the backup and the printed error message.

Maintenance

- If you change or add helper scripts, update `scripts/context.md` and this README.

## Running the jscodeshift transform (transforms/replace-node.js)

We also provide a jscodeshift transform that can be run via npx against any JS project without adding dependencies to the target project.

Key points

- The transform file: `transforms/replace-node.js`.
- Runs via `npx jscodeshift -t transforms/replace-node.js <path>` and accepts the following options:
  - `--kind` (required): one of `class`, `method`, `function`, `variable`.
  - `--name` (required for class/function/variable): identifier name.
  - `--class` and `--method` (for kind=method): specify class and method names.
  - `--replacement` (required): path to a file containing the replacement source (read relative to your current working directory).
  - `--body-only` (optional): replace just the inner body of a class or method — replacement MUST include the surrounding braces (e.g. `{ /* new body */ }`).
  - `--index` (optional): if multiple matches in a file, choose one (0-based index).

Examples

Dry-run across the `src/` directory (shows a preview without writing):

```bash
npx jscodeshift -t transforms/replace-node.js src/ --kind=class --name=MyClass --replacement ./replacements/newClass.js -d --parser=babel
```

Apply the transform (writes changes):

```bash
npx jscodeshift -t transforms/replace-node.js src/ --kind=class --name=MyClass --replacement ./replacements/newClass.js --parser=babel --extensions=js,jsx
```

Replace a single class method (dry-run):

```bash
npx jscodeshift -t transforms/replace-node.js path/to/file.js --kind=method --class=MyClass --method=myMethod --replacement ./replacements/newMethod.js -d --parser=babel
```

Notes and tips

- Use `--parser=babel` to support modern JS syntax (class fields, private methods, optional chaining, etc.).
- The transform operates on any file types jscodeshift supports; use `--extensions` to set file extensions.
- Replacement files are inserted literally into the target range; ensure the replacement text matches the replacement target (i.e., include braces for body-only replacements, include `export` if replacing an exported declaration unless you want to preserve the original export prefix).
- The transform replaces all matches by default within a file; use `--index` to pick a single occurrence per file.
- Always run a dry-run and review diffs before applying across a codebase.

## Using packages/core/scripts/edit-lines.mjs with heredocs

Here are recommended ways to pass multiline text to `packages/core/scripts/edit-lines.mjs` (pick the approach that fits your workflow).

1. Write the snippet to a temporary file and pass `--text-file` (recommended)

```bash
cat > /tmp/snippet.txt <<'EOF'
// Inserted lines
console.log('hello');
console.log('world');
EOF

# preview (dry-run)
node packages/core/scripts/edit-lines.mjs --file path/to/file.js --start 5 --count 3 --text-file /tmp/snippet.txt

# apply with syntax check
node packages/core/scripts/edit-lines.mjs --file path/to/file.js --start 5 --count 3 --text-file /tmp/snippet.txt --apply --check
```

2. Inline via command-substitution (no temp file)

```bash
node packages/core/scripts/edit-lines.mjs --file path/to/file.js --start 5 --count 0 --text "$(cat <<'EOF'
line one
line two
EOF
)" --apply
```

3. Process-substitution (Bash/zsh) — pass a file descriptor to `--text-file` without creating a named file

```bash
node packages/core/scripts/edit-lines.mjs --file path/to/file.js --start 10 --count 2 --text-file <(cat <<'EOF'
first line
second line
EOF
) --apply
```

Notes

- Use `<<'EOF'` to avoid shell variable expansion inside the heredoc. Use `<<EOF` (no quotes) if you want variables expanded.
- Prefer `--text-file` for multiline inserts to avoid shell-quoting issues.
- `--start` is 1-based. Use `--count 0` to insert without deleting (append when `start` > last line).
- Use `--apply --check` to write changes and run `node --check` (for `.js` files); the script will attempt to roll back on syntax errors.
