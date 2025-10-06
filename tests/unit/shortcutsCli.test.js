import { jest } from '@jest/globals';

async function loadShortcutsModuleWithData(data) {
  jest.resetModules();
  jest.unstable_mockModule('node:fs', () => ({
    readFileSync: jest.fn(() => data),
    existsSync: jest.fn(() => false),
  }));

  const mod = await import('../../src/shortcuts/cli.js');
  return mod;
}

afterEach(() => {
  jest.resetModules();
});

test('loadShortcutsFile filters unsafe commands and normalises tags', async () => {
  const payload = JSON.stringify([
    {
      id: 'valid',
      name: 'Valid Shortcut',
      command: 'npm test',
      tags: [' dev ', 123, 'ci'],
    },
    {
      id: 'danger',
      name: 'Danger Shortcut',
      command: 'echo ok & rm -rf /',
    },
    {
      id: 'missingName',
      command: 'npm run lint',
    },
  ]);

  const { loadShortcutsFile } = await loadShortcutsModuleWithData(payload);
  const shortcuts = loadShortcutsFile();

  expect(shortcuts).toHaveLength(1);
  expect(shortcuts[0].id).toBe('valid');
  expect(shortcuts[0].tags).toEqual(['dev', 'ci']);
});
