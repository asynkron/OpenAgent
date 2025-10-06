# Changelog

## [2.0.0] - 2025-10-05
### Breaking Changes
- Removed the `legacy/` CommonJS tree and associated subpath exports. Downstream consumers must migrate to ESM and load the package with `import('openagent')` or static `import` syntax.

### Migration Notes
- Replace any usage of `require('openagent')` with `await import('openagent')` (or `import openagent from 'openagent'` in ESM modules).
- Review custom tooling that referenced `openagent/legacy`; the path no longer exists.
