/**
 * ESM compatibility shim that mirrors the legacy entry point while delegating to the
 * modern root module. Existing imports targeting `openagent/legacy` continue to work
 * without maintaining a duplicate implementation.
 */
export * from '../index.js';
export { default } from '../index.js';
