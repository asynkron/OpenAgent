/**
 * Public surface for assistant response validation. The heavy lifting now lives in
 * `responseValidation/` so callers can import targeted helpers while keeping this
 * entry point stable for existing runtime wiring and tests.
 */
import {
  validateAssistantResponseSchema,
  validateAssistantResponse,
} from './responseValidation/index.js';

export {
  validateAssistantResponseSchema,
  validateAssistantResponse,
} from './responseValidation/index.js';
export type {
  AssistantResponseValidationResult,
  PlanValidationState,
  SchemaValidationError,
  SchemaValidationResult,
} from './responseValidation/index.js';

export default {
  validateAssistantResponseSchema,
  validateAssistantResponse,
};
