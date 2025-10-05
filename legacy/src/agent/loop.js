/**
 * Legacy compatibility wrapper that now re-exports the modern ESM module.
 * This keeps existing import paths working while the implementation lives in src/.
 */
export * from '../../../src/agent/loop.js';
export { default } from '../../../src/agent/loop.js';
