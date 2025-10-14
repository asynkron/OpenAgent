/**
 * AJV-backed schema validator for assistant responses with readable errors.
 */
import { Ajv, type ErrorObject } from 'ajv';
import { RuntimeToolResponseJsonSchema } from '../../contracts/index.js';
import { describeSchemaError } from './schemaErrors.js';
import type { SchemaValidationResult } from './types.js';

const ajv = new Ajv({ allErrors: true, strict: false });
const schemaValidator = ajv.compile(RuntimeToolResponseJsonSchema);

export function validateAssistantResponseSchema(payload: unknown): SchemaValidationResult {
  const valid = schemaValidator(payload);

  if (valid) {
    return { valid: true, errors: [] };
  }

  const errors = Array.isArray(schemaValidator.errors)
    ? schemaValidator.errors.map((error: ErrorObject | null | undefined) => describeSchemaError(error))
    : [
        {
          path: 'response',
          message: 'Schema validation failed for assistant response.',
          keyword: 'unknown',
          instancePath: '',
          params: {},
        },
      ];

  return {
    valid: false,
    errors,
  };
}
