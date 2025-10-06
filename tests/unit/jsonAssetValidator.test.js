import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, test } from '@jest/globals';

import {
  ensurePromptCopiesInSync,
  ensureUniqueByProperty,
  loadJsonFile,
  validateWithSchema,
} from '../../src/utils/jsonAssetValidator.js';

describe('jsonAssetValidator utilities', () => {
  test('loadJsonFile parses JSON content', async () => {
    const filePath = path.join(os.tmpdir(), `validator-${Date.now()}.json`);
    await writeFile(filePath, '{"key":"value"}', 'utf8');

    const result = await loadJsonFile(filePath);
    expect(result).toEqual({ key: 'value' });
  });

  test('loadJsonFile throws on invalid JSON', async () => {
    const filePath = path.join(os.tmpdir(), `validator-${Date.now()}-bad.json`);
    await writeFile(filePath, '{"key":', 'utf8');

    await expect(loadJsonFile(filePath)).rejects.toThrow('Failed to parse JSON');
  });

  test('validateWithSchema enforces structure', () => {
    const schema = {
      type: 'object',
      required: ['id'],
      properties: {
        id: { type: 'string' },
      },
    };

    expect(() =>
      validateWithSchema({ schema, data: { id: 'ok' }, resource: 'test' }),
    ).not.toThrow();
    expect(() => validateWithSchema({ schema, data: {}, resource: 'test' })).toThrow(
      'Schema validation failed',
    );
  });

  test('ensureUniqueByProperty detects duplicate ids', () => {
    const items = [{ id: 'first' }, { id: 'second' }, { id: 'first' }];

    expect(() => ensureUniqueByProperty(items, 'id', { resource: 'resource.json' })).toThrow(
      'Duplicate id values detected',
    );
  });

  test('ensurePromptCopiesInSync verifies canonical and copies', async () => {
    const workspace = await mkdtemp(path.join(os.tmpdir(), 'prompt-sync-'));
    const canonicalPath = path.join(workspace, 'canonical.md');
    const copyPath = path.join(workspace, 'copy.md');

    try {
      // Matching files should pass without throwing.
      await writeFile(canonicalPath, 'content', 'utf8');
      await writeFile(copyPath, 'content', 'utf8');

      const manifest = {
        prompts: [
          {
            id: 'sample',
            canonical: 'canonical.md',
            copies: ['copy.md'],
          },
        ],
      };

      await expect(
        ensurePromptCopiesInSync(manifest, { rootDir: workspace }),
      ).resolves.toBeUndefined();

      // Diverging contents should be reported.
      await writeFile(copyPath, 'stale', 'utf8');
      await expect(ensurePromptCopiesInSync(manifest, { rootDir: workspace })).rejects.toThrow(
        'Prompt copy synchronization failed',
      );
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });
});
