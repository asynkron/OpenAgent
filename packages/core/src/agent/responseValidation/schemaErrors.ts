/** Helpers to translate AJV error structures into human-readable diagnostics. */
import type { ErrorObject } from 'ajv';
import type { SchemaValidationError } from './types.js';

function decodePointerSegment(segment: string): string {
  return segment.replace(/~1/g, '/').replace(/~0/g, '~');
}

export function formatInstancePath(instancePath: string): string {
  if (!instancePath) {
    return 'response';
  }

  const segments = instancePath
    .split('/')
    .filter(Boolean)
    .map((segment) => decodePointerSegment(segment));

  let pathLabel = 'response';
  for (const segment of segments) {
    if (/^\d+$/.test(segment)) {
      pathLabel += `[${segment}]`;
    } else if (/^[A-Za-z_$][\w$]*$/.test(segment)) {
      pathLabel += `.${segment}`;
    } else {
      pathLabel += `['${segment}']`;
    }
  }

  return pathLabel;
}

export function buildSchemaErrorMessage(error: ErrorObject | null | undefined): string {
  if (!error) {
    return 'Schema validation failed.';
  }

  if (error.keyword === 'required' && typeof error.params?.missingProperty === 'string') {
    return `Missing required property "${error.params.missingProperty}".`;
  }

  if (
    error.keyword === 'additionalProperties' &&
    typeof error.params?.additionalProperty === 'string'
  ) {
    return `Unexpected property "${error.params.additionalProperty}".`;
  }

  if (error.keyword === 'enum' && Array.isArray(error.params?.allowedValues)) {
    return `Must be one of: ${error.params.allowedValues.join(', ')}.`;
  }

  if (error.keyword === 'type' && typeof error.params?.type === 'string') {
    return `Must be of type ${error.params.type}.`;
  }

  const message = typeof error.message === 'string' ? error.message : 'failed validation.';
  return message.trim();
}

export function describeSchemaError(error: ErrorObject | null | undefined): SchemaValidationError {
  const pathLabel = formatInstancePath(error?.instancePath ?? '');
  return {
    path: pathLabel,
    message: buildSchemaErrorMessage(error),
    keyword: error?.keyword ?? 'unknown',
    instancePath: error?.instancePath ?? '',
    params: (error?.params ?? {}) as Record<string, unknown>,
  };
}
