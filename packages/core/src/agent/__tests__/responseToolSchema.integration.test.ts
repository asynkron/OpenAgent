import { describe, expect, test } from '@jest/globals';

import { ToolDefinition, ToolResponseJsonSchema } from '../../contracts/index.js';

describe('responseToolSchema integration', () => {
  test('tool exposes provider-agnostic JSON schema wrapper', () => {
    const schemaContainer =
      typeof (ToolDefinition as Record<string, unknown>).schema === 'function'
        ? (ToolDefinition as Record<string, unknown>).schema()
        : (ToolDefinition as Record<string, unknown>).schema;

    expect(schemaContainer).toBeTruthy();
    expect(typeof schemaContainer).toBe('object');
    expect('jsonSchema' in schemaContainer).toBe(true);

    const jsonSchema = (schemaContainer as Record<string, unknown>).jsonSchema;
    expect(jsonSchema).toBeTruthy();
    // Basic shape checks — we rely on the canonical export
    expect(jsonSchema).toMatchObject(ToolResponseJsonSchema);
    expect(jsonSchema.properties).toHaveProperty('message');
    expect(jsonSchema.properties).toHaveProperty('plan');
  });
});
