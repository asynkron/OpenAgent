import { describe, expect, test } from '@jest/globals';

import { OpenAgentTool, OpenAgentToolJsonSchema } from '../../contracts/index.js';

describe('responseToolSchema integration', () => {
  test('tool exposes provider-agnostic JSON schema wrapper', () => {
    const schemaContainer =
      typeof (OpenAgentTool as Record<string, unknown>).schema === 'function'
        ? (OpenAgentTool as Record<string, unknown>).schema()
        : (OpenAgentTool as Record<string, unknown>).schema;

    expect(schemaContainer).toBeTruthy();
    expect(typeof schemaContainer).toBe('object');
    expect('jsonSchema' in schemaContainer).toBe(true);

    const jsonSchema = (schemaContainer as Record<string, unknown>).jsonSchema;
    expect(jsonSchema).toBeTruthy();
    // Basic shape checks — we rely on the canonical export
    expect(jsonSchema).toMatchObject(OpenAgentToolJsonSchema);
    expect(jsonSchema.properties).toHaveProperty('message');
    expect(jsonSchema.properties).toHaveProperty('plan');
  });
});
