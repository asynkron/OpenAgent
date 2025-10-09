# Directory Context: .vscode

## Purpose & Scope

- Workspace-local VS Code configuration to mirror the project's linting and formatting behavior.

## Key Files

- `settings.json` — sets Prettier to use the workspace installation, enables ESLint's flat config with npm-managed dependencies, and runs format/lint fixes on save.

## Maintenance Notes

- Adjust whenever linting or formatting tooling changes so the IDE stays aligned with `npm run lint` and `npm run format`.
