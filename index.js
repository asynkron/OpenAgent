/**
 * Compatibility shim that re-exports the CLI package.
 *
 * The real implementation now lives under `packages/cli`. Keeping this file lets
 * local tooling and examples that import `./index.js` continue to work during
 * the workspace transition.
 */

export * from './packages/cli/index.js';
export { default } from './packages/cli/index.js';
