# apply_patch failure log (2025-10-07)

## Summary

- Multiple `apply_patch` commands targeting `notes/codex-example.md` and `prompts/developer.md` failed while appending documentation.
- Failures were triggered by unified diff formatting issues (missing leading spaces on context lines, mismatched hunk counts/locations).
- Successful edits required either regenerating the diff with accurate metadata or overwriting the file directly.

## Environment

- Repository: OpenAgent (`main`)
- Command executor: `src/commands/runApplyPatch` (uses `diff.parsePatch`)
- Session: OpenAgent CLI assistant runs between 17:37–18:04 UTC, 2025-10-07

## Attempts

### Attempt 1 — Capitalize opening sentence (notes/codex-example.md)

**Command object:**

```json
{
  "description": "Update the first sentence in notes/codex-example.md to start with a capital letter",
  "cwd": ".",
  "apply_patch": {
    "target": "notes/codex-example.md",
    "patch": "--- a/notes/codex-example.md\n+++ b/notes/codex-example.md\n@@\n-› figure out what needs to be done to respect the --nohuman flag. when enabled, calling \"askHuman\"\n+› Figure out what needs to be done to respect the --nohuman flag. when enabled, calling \"askHuman\"\n"
  }
}
```

**Target excerpt before command:**

```
› figure out what needs to be done to respect the --nohuman flag. when enabled, calling "askHuman"
```

**Expected outcome:** capitalize "figure" → "Figure".
**Observed result:** `stderr: "apply_patch failed to apply the provided patch."`
**Diagnosis:** patch missing hunk metadata (`@@ -start,count +start,count @@`); parser could not map the change.

A follow-up command with explicit line counts (`@@ -1,4 +1,4 @@`) succeeded.

---

### Attempt 2 — Append follow-up reminders (variant A)

**Command object:**

```json
{
  "description": "Add a follow-up reminders section to notes/codex-example.md",
  "cwd": ".",
  "apply_patch": {
    "target": "notes/codex-example.md",
    "patch": "--- a/notes/codex-example.md\n+++ b/notes/codex-example.md\n@@ -79,3 +79,9 @@\n Tests\n \n - npm test\n \n Next step: try node index.js --nohuman in your workflow to confirm the CLI behavior matches your\n expectations, especially around providing the initial objectives.\n+\n+### Follow-up reminders\n+- Capture a CLI transcript once no-human mode is stabilized to share in onboarding docs.\n+- Draft integration coverage that exercises chained command approvals under no-human automation.\n+- Review `todo.md` entries related to the no-human flag and close or update them after verification.\n"
  }
}
```

**Target excerpt before command:**

```
Tests

- npm test

Next step: try node index.js --nohuman in your workflow to confirm the CLI behavior matches your
expectations, especially around providing the initial objectives.
```

**Expected outcome:** append a `Follow-up reminders` heading and bullets after the “Next step” paragraph.
**Observed result:** `stderr: "Removed line count did not match for hunk at line 3"`
**Diagnosis:** hunk header (`-79,3`) didn’t match actual context span; diff expected three removals but saw more/less lines, so `diff.parsePatch` rejected it.

---

### Attempt 3 — Append follow-up reminders (variant B)

**Command object:**

```json
{
  "description": "Extend notes/codex-example.md with follow-up reminders",
  "cwd": ".",
  "apply_patch": {
    "target": "notes/codex-example.md",
    "patch": "--- a/notes/codex-example.md\n+++ b/notes/codex-example.md\n@@ -109,3 +109,9 @@\n Tests\n \n - npm test\n \n Next step: try node index.js --nohuman in your workflow to confirm the CLI behavior matches your expectations, especially around providing the initial objectives.\n+\n+### Follow-up reminders\n+- Capture a CLI transcript once no-human mode is stabilized to share in onboarding docs.\n+- Draft integration coverage that exercises chained command approvals under no-human automation.\n+- Review `todo.md` entries related to the no-human flag and close or update them after verification.\n"
  }
}
```

**Observed result:** `stderr: "Removed line count did not match for hunk at line 3"`
**Diagnosis:** Same issue as Attempt 2; incorrect hunk location/counts.

---

### Attempt 4 — Append follow-up reminders (variant C, no explicit counts)

**Command object:**

```json
{
  "description": "Add follow-up reminders using context-only hunk",
  "cwd": ".",
  "apply_patch": {
    "target": "notes/codex-example.md",
    "patch": "--- a/notes/codex-example.md\n+++ b/notes/codex-example.md\n@@\n Next step: try node index.js --nohuman in your workflow to confirm the CLI behavior matches your\n expectations, especially around providing the initial objectives.\n+\n+### Follow-up reminders\n+- Capture a CLI transcript once no-human mode is stabilized to share in onboarding docs.\n+- Draft integration coverage that exercises chained command approvals under no-human automation.\n+- Review `todo.md` entries related to the no-human flag and close or update them after verification.\n"
  }
}
```

**Observed result:** `stderr: "Unknown line 5 \" expectations, especially around providing the initial objectives.\""`
**Diagnosis:** Context lines in the hunk were missing the leading space prefix required for unchanged lines; parser treated them as malformed diff rows.

---

### Attempt 5 — Append follow-up reminders (variant D, adjusted indentation)

**Command object:**

```json
{
  "description": "Apply refined patch with preserved indentation",
  "cwd": ".",
  "apply_patch": {
    "target": "notes/codex-example.md",
    "patch": "--- a/notes/codex-example.md\n+++ b/notes/codex-example.md\n@@ -111,2 +111,8 @@\n Next step: try node index.js --nohuman in your workflow to confirm the CLI behavior matches your\n expectations, especially around providing the initial objectives.\n+\n+### Follow-up reminders\n+- Capture a CLI transcript once no-human mode is stabilized to share in onboarding docs.\n+- Draft integration coverage that exercises chained command approvals under no-human automation.\n+- Review `todo.md` entries related to the no-human flag and close or update them after verification.\n"
  }
}
```

**Observed result:** `stderr: "Hunk at line 3 contained invalid line "`
**Diagnosis:** Context lines still lacked the leading whitespace marker; diff parser flagged them as invalid.

After repeated failures, the follow-up section was never added in this session.

---

### Attempt 6 — Update apply_patch guidance (prompts/developer.md, variant A)

**Command object:**

````json
{
  "description": "Add reminder about Unknown line errors to prompts/developer.md",
  "cwd": ".",
  "apply_patch": {
    "target": "prompts/developer.md",
    "patch": "--- a/prompts/developer.md\n+++ b/prompts/developer.md\n@@\n   - Provide the diff target explicitly (`target` preferred; `path`/`file` remain legacy aliases) and keep it consistent with the diff headers.\n   - Only single-file textual diffs are supported; the runtime will reject renames, binary blobs, or hunks that don't apply.\n   - Optional flags mirror the runtime's validators: `strip`, `reverse`, `whitespace` (`ignore-all`, `ignore-space-change`, `ignore-space-at-eol`), `fuzz`/`fuzzFactor`, and `allow_empty`/`allowEmpty`.\n   - Ensure the diff body follows unified diff conventions: unchanged lines start with a leading space (` `), removals with `-`, and additions with `+`. Extra leading hyphens (for example `- - line`) will be rejected before the patch runs.\n+  - Parse errors such as `Unknown line \"...\"` usually mean a context line is missing its leading space. Regenerate the diff (e.g., with `diff -u` / `git diff`) or add the proper prefixes before retrying.\n   - When composing patches manually, prefer generating them via `diff -u` or `git diff` to avoid formatting mistakes.\n   ```json\n   {\n"
  }
}
````

**Observed result:** `stderr: "Unknown line 5 \"   - Optional flags mirror the runtime's validators: ...\""`
**Diagnosis:** Context lines in the hunk lacked the leading space prefix; patch parser couldn’t match them.

---

### Attempt 7 — Update apply_patch guidance (prompts/developer.md, variant B)

**Command object:**

````json
{
  "description": "Insert Unknown line reminder with positional hunk",
  "cwd": ".",
  "apply_patch": {
    "target": "prompts/developer.md",
    "patch": "--- a/prompts/developer.md\n+++ b/prompts/developer.md\n@@ -90,6 +90,7 @@\n   - Provide the diff target explicitly (`target` preferred; `path`/`file` remain legacy aliases) and keep it consistent with the diff headers.\n   - Only single-file textual diffs are supported; the runtime will reject renames, binary blobs, or hunks that don't apply.\n   - Optional flags mirror the runtime's validators: `strip`, `reverse`, `whitespace` (`ignore-all`, `ignore-space-change`, `ignore-space-at-eol`), `fuzz`/`fuzzFactor`, and `allow_empty`/`allowEmpty`.\n   - Ensure the diff body follows unified diff conventions: unchanged lines start with a leading space (` `), removals with `-`, and additions with `+`. Extra leading hyphens (for example `- - line`) will be rejected before the patch runs.\n+  - Parse errors like `Unknown line \"...\"` usually mean a context line is missing its leading space. Regenerate the diff (`diff -u` / `git diff`) or add the prefixes before retrying.\n   - When composing patches manually, prefer generating them via `diff -u` or `git diff` to avoid formatting mistakes.\n   ```json\n"
  }
}
````

**Observed result:** `stderr: "Unknown line 11 \"   {\""`
**Diagnosis:** Hunk included JSON example lines without leading spaces; parser rejected them.

---

### Attempt 8 — Update apply_patch guidance (prompts/developer.md, variant C)

**Command object:**

```json
{
  "description": "Add Unknown line reminder with adjusted hunk counts",
  "cwd": ".",
  "apply_patch": {
    "target": "prompts/developer.md",
    "patch": "--- a/prompts/developer.md\n+++ b/prompts/developer.md\n@@ -87,8 +87,9 @@\n   - Provide the diff target explicitly (`target` preferred; `path`/`file` remain legacy aliases) and keep it consistent with the diff headers.\n   - Only single-file textual diffs are supported; the runtime will reject renames, binary blobs, or hunks that don't apply.\n   - Optional flags mirror the runtime's validators: `strip`, `reverse`, `whitespace` (`ignore-all`, `ignore-space-change`, `ignore-space-at-eol`), `fuzz`/`fuzzFactor`, and `allow_empty`/`allowEmpty`.\n-  - Ensure the diff body follows unified diff conventions: unchanged lines start with a leading space (` `), removals with `-`, and additions with `+`. Extra leading hyphens (for example `- - line`) will be rejected before the patch runs.\n-  - When composing patches manually, prefer generating them via `diff -u` or `git diff` to avoid formatting mistakes.\n+  - Ensure the diff body follows unified diff conventions: unchanged lines start with a leading space (` `), removals with `-`, and additions with `+`. Extra leading hyphens (for example `- - line`) will be rejected before the patch runs.\n+  - Parse errors like `Unknown line \"...\"` usually mean a context line is missing its leading space. Regenerate the diff (`diff -u` / `git diff`) or add the prefixes before retrying.\n+  - When composing patches manually, prefer generating them via `diff -u` or `git diff` to avoid formatting mistakes.\n ``
  }
}
```

**Observed result:** `stderr: "Added line count did not match for hunk at line 3"`
**Diagnosis:** Hunk metadata still inaccurate; diff expected two removals/one addition but net changes differed.

---

### Resolution

- After repeated parsing failures, `prompts/developer.md` was rewritten wholesale via a `cat <<'EOF' > ...` shell command to inject the desired guidance.
- No follow-up section was appended to `notes/codex-example.md` during this session; future edits should regenerate a fresh `diff -u` patch to avoid context mismatches.

## Recommendations

1. Generate patches with `git diff` / `diff -u` to ensure accurate hunk headers and context markers.
2. Treat `Unknown line` errors as indicators that a supposedly unchanged line is missing the leading-space prefix.
3. When a patch repeatedly fails, re-read the target file, adjust context/hunk metadata, or fall back to rewriting the file carefully.
4. Update developer documentation (done) so future sessions remember the leading-space requirement and common failure signatures.
