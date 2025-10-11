const CORE_PACKAGE_ID = '@asynkron/openagent-core';
const LOCAL_CORE_ENTRY_URL = new URL('../../core/index.js', import.meta.url);

const defaultImporter = (specifier) => import(specifier);

let cachedModule;

/**
 * Loads the core runtime dependency used by the CLI.
 *
 * When the workspace dependency is not hoisted into node_modules (common when
 * developing straight from the repository without running `npm install`), we
 * fall back to the local source folder. The result is memoized to avoid loading
 * the module twice. Optional overrides make the behavior easy to exercise in
 * unit tests without touching the filesystem.
 */
export async function loadCoreModule({ importer, fallbackSpecifier } = {}) {
  if (cachedModule) {
    return cachedModule;
  }

  const importModule = typeof importer === 'function' ? importer : defaultImporter;
  const fallbackTarget = fallbackSpecifier ?? LOCAL_CORE_ENTRY_URL.href;

  try {
    cachedModule = await importModule(CORE_PACKAGE_ID);
  } catch (error) {
    if (isModuleNotFoundError(error)) {
      cachedModule = await importModule(fallbackTarget);
    } else {
      throw error;
    }
  }

  return cachedModule;
}

function isModuleNotFoundError(error) {
  if (!error) {
    return false;
  }

  const message = typeof error.message === 'string' ? error.message : '';

  return (
    error.code === 'ERR_MODULE_NOT_FOUND' ||
    error.code === 'MODULE_NOT_FOUND' ||
    /Cannot find (module|package)/i.test(message)
  );
}

/**
 * Visible for tests to ensure memoization does not leak between cases.
 */
export function __clearCoreModuleCacheForTesting() {
  cachedModule = undefined;
}
