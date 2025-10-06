import { jest } from '@jest/globals';

async function loadTemplatesModuleWithData(data) {
  jest.resetModules();
  jest.unstable_mockModule('node:fs', () => ({
    readFileSync: jest.fn(() => data),
    existsSync: jest.fn(() => false),
  }));

  const mod = await import('../../src/templates/cli.js');
  return mod;
}

afterEach(() => {
  jest.resetModules();
});

test('loadTemplates filters unsafe entries and sanitizes variables', async () => {
  const payload = JSON.stringify([
    {
      id: 'safe',
      name: 'Safe Template',
      command: 'npm test',
      variables: [
        { name: 'pkg', default: 'lodash' },
        { name: '  ', default: 'ignored' },
      ],
    },
    {
      id: 'bad',
      name: 'Bad Template',
      command: 'npm test && rm -rf /',
    },
    {
      id: '',
      name: 'Missing Id',
      command: 'echo hello',
    },
  ]);

  const { loadTemplates } = await loadTemplatesModuleWithData(payload);
  const templates = loadTemplates();

  expect(templates).toHaveLength(1);
  expect(templates[0].id).toBe('safe');
  expect(templates[0].variables).toEqual([{ name: 'pkg', default: 'lodash' }]);
});
