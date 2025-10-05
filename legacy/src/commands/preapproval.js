/**
 * Legacy compatibility wrapper that now re-exports the modern ESM module.
 * This keeps existing import paths working while the implementation lives in src/.
 */
export * from '../../../src/commands/preapproval.js';
export { default } from '../../../src/commands/preapproval.js';
