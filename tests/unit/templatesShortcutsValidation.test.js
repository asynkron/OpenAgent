import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { jest } from '@jest/globals';

// These tests focus on the JSON validation layers that guard template and shortcut payloads.

describe('templates validation', () => {
  test('filters invalid template entries and normalises fields', async () => {
    jest.resetModules();
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'templates-test-'));
    const prevCwd = process.cwd();
    process.chdir(tmpDir);

    try {
      fs.mkdirSync(path.join(tmpDir, 'templates'), { recursive: true });
      const payload = [
        {
          id: 'valid-template',
          name: ' Valid Template ',
          description: ' helpful ',
          command: ' npm test ',
          variables: [
            { name: 'pkg', description: 'package name', default: 42 },
            { name: ' ', default: 'ignored' },
          ],
          tags: [' dev ', 123, null],
        },
        { id: '', command: 'missing-id' },
        'not-an-object',
      ];
      fs.writeFileSync(
        path.join(tmpDir, 'templates', 'command-templates.json'),
        JSON.stringify(payload),
        'utf8',
      );

      const mod = await import('../../src/templates/cli.js');
      const templates = mod.loadTemplates();

      expect(templates).toHaveLength(1);
      expect(templates[0]).toMatchObject({
        id: 'valid-template',
        name: 'Valid Template',
        description: 'helpful',
        command: 'npm test',
        tags: ['dev'],
      });
      expect(templates[0].variables).toEqual([
        { name: 'pkg', description: 'package name', default: '42' },
      ]);
    } finally {
      process.chdir(prevCwd);
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});

describe('shortcuts validation', () => {
  test('filters malformed shortcuts and trims metadata', async () => {
    jest.resetModules();
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'shortcuts-test-'));
    const prevCwd = process.cwd();
    process.chdir(tmpDir);

    try {
      fs.mkdirSync(path.join(tmpDir, 'shortcuts'), { recursive: true });
      const payload = [
        {
          id: 'run-tests',
          name: ' Run Tests ',
          description: ' run suite ',
          command: ' npm test ',
          tags: [' qa ', '', null],
        },
        { id: 'missing-command' },
        123,
      ];
      fs.writeFileSync(
        path.join(tmpDir, 'shortcuts', 'shortcuts.json'),
        JSON.stringify(payload),
        'utf8',
      );

      const mod = await import('../../src/shortcuts/cli.js');
      const shortcuts = mod.loadShortcutsFile();

      expect(shortcuts).toHaveLength(1);
      expect(shortcuts[0]).toEqual({
        id: 'run-tests',
        name: 'Run Tests',
        description: 'run suite',
        command: 'npm test',
        tags: ['qa'],
      });
    } finally {
      process.chdir(prevCwd);
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
