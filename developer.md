# Developer Guide

## Regex Replace Command

OpenAgent now supports a dedicated `replace` command for regex-based find/replace operations across one or more files.

### Command JSON structure

```json
{
  "command": {
    "replace": {
      "pattern": "foo",
      "replacement": "bar",
      "flags": "gi",
      "files": [
        "src/example.js",
        "docs/example.md"
      ],
      "dry_run": false,
      "encoding": "utf8"
    },
    "cwd": "."
  }
}
```

### Fields

| Field | Description |
| --- | --- |
| `pattern` | Required. Regex pattern string; must be valid for JavaScript’s `RegExp`. |
| `replacement` | Text that replaces each match (defaults to empty string). |
| `flags` | Optional regex flags. `g` is automatically added if omitted. |
| `files` | Required array of relative file paths. Each path is resolved from `cwd`. |
| `dry_run` | When true, shows match counts without modifying files. |
| `encoding` | File encoding, defaults to `utf8`. |

### Behavior

- All files are read synchronously and rewritten atomically.
- A temp file is not created; writes happen directly when replacements occur.
- Dry runs leave files untouched and include a summary message in stdout.
- Errors set `exit_code` to `1` and report the error message in stderr.

### Example usage inside a plan

```
- step: Update API references
  command:
    replace:
      pattern: "OldAPI"
      replacement: "NewAPI"
      files:
        - src/client.js
        - src/server.js
```

Run `npm test` before committing to ensure unit coverage passes.
