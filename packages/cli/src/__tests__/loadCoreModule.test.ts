import { jest } from '@jest/globals';

const loaderPath = '../loadCoreModule.js';
const loaderUrl = new URL(loaderPath, import.meta.url);
const fallbackSpecifier = new URL('../../core/index.js', loaderUrl).href;

async function importLoader() {
  return import(loaderPath);
}

describe('loadCoreModule', () => {
  afterEach(() => {
    jest.resetModules();
  });

  test('returns the workspace dependency when available', async () => {
    const coreExports = { sentinel: 'workspace' };
    const importer = jest.fn(async (specifier) => {
      if (specifier === '@asynkron/openagent-core') {
        return coreExports;
      }
      throw new Error(`Unexpected specifier: ${specifier}`);
    });

    const { loadCoreModule } = await importLoader();
    const result = await loadCoreModule({ importer });

    expect(result).toEqual(coreExports);
    expect(importer).toHaveBeenCalledWith('@asynkron/openagent-core');
  });

  test('falls back to the local core entry when the package is missing', async () => {
    const notFoundError = new Error("Cannot find module '@asynkron/openagent-core'");
    (notFoundError as NodeJS.ErrnoException).code = 'ERR_MODULE_NOT_FOUND';

    const fallbackExports = { sentinel: 'fallback' };
    const importer = jest.fn(async (specifier) => {
      if (specifier === '@asynkron/openagent-core') {
        throw notFoundError;
      }
      if (specifier === fallbackSpecifier) {
        return fallbackExports;
      }
      throw new Error(`Unexpected specifier: ${specifier}`);
    });

    const { loadCoreModule } = await importLoader();
    const result = await loadCoreModule({ importer, fallbackSpecifier });

    expect(result).toBe(fallbackExports);
    expect(importer).toHaveBeenCalledTimes(2);
  });

  test('rethrows unexpected errors from the workspace import', async () => {
    const unexpected = new Error('boom');
    const importer = jest.fn(async (specifier) => {
      if (specifier === '@asynkron/openagent-core') {
        throw unexpected;
      }
      throw new Error(`Unexpected specifier: ${specifier}`);
    });

    const { loadCoreModule } = await importLoader();

    await expect(loadCoreModule({ importer })).rejects.toBe(unexpected);
  });

  test('memoizes the resolved module between calls', async () => {
    const coreExports = { sentinel: 'workspace' };
    const importer = jest.fn(async (specifier) => {
      if (specifier === '@asynkron/openagent-core') {
        return coreExports;
      }
      throw new Error(`Unexpected specifier: ${specifier}`);
    });

    const { loadCoreModule, __clearCoreModuleCacheForTesting } = await importLoader();

    const first = await loadCoreModule({ importer });
    const second = await loadCoreModule({ importer });

    expect(first).toBe(second);

    __clearCoreModuleCacheForTesting();
  });
});
