import { describe, expect, test } from '@jest/globals';

import {
  OPENAGENT_RESPONSE_TOOL,
  RESPONSE_PARAMETERS_SCHEMA,
} from '../responseToolSchema.js';

describe('responseToolSchema integration', () => {
  test('tool exposes provider-agnostic JSON schema wrapper', () => {
    const schemaContainer =
      typeof (OPENAGENT_RESPONSE_TOOL as any).schema === 'function'
        ? (OPENAGENT_RESPONSE_TOOL as any).schema()
        : (OPENAGENT_RESPONSE_TOOL as any).schema;

    expect(schemaContainer).toBeTruthy();
    expect(typeof schemaContainer).toBe('object');
    expect('jsonSchema' in schemaContainer).toBe(true);

    const jsonSchema = (schemaContainer as any).jsonSchema;
    expect(jsonSchema).toBeTruthy();
    // Basic shape checks — we rely on the canonical export
    expect(jsonSchema).toMatchObject(RESPONSE_PARAMETERS_SCHEMA);
    expect(jsonSchema.properties).toHaveProperty('message');
    expect(jsonSchema.properties).toHaveProperty('plan');
  });
});

