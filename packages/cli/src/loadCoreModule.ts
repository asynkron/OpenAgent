const CORE_PACKAGE_ID = '@asynkron/openagent-core';
const LOCAL_CORE_ENTRY_URL = new URL('../../core/index.js', import.meta.url);

type CoreModule = Record<string, unknown> & {
  applyStartupFlagsFromArgv?: (argv: string[]) => void;
};

type Importer = (specifier: string) => Promise<CoreModule>;

type LoadCoreModuleOptions = {
  importer?: Importer;
  fallbackSpecifier?: string | URL;
};

const defaultImporter: Importer = (specifier) => import(specifier) as Promise<CoreModule>;

let cachedModule: CoreModule | undefined;

/**
 * Loads the core runtime dependency used by the CLI.
 *
 * When the workspace dependency is not hoisted into node_modules (common when
 * developing straight from the repository without running `npm install`), we
 * fall back to the local source folder. The result is memoized to avoid loading
 * the module twice. Optional overrides make the behavior easy to exercise in
 * unit tests without touching the filesystem.
 */
export async function loadCoreModule({
  importer,
  fallbackSpecifier,
}: LoadCoreModuleOptions = {}): Promise<CoreModule> {
  if (cachedModule) {
    return cachedModule;
  }

  const importModule = typeof importer === 'function' ? importer : defaultImporter;
  const fallbackTarget = resolveFallbackTarget(fallbackSpecifier);

  try {
    cachedModule = await importModule(CORE_PACKAGE_ID);
  } catch (error: unknown) {
    if (isModuleNotFoundError(error)) {
      cachedModule = await importModule(fallbackTarget);
    } else {
      throw error;
    }
  }

  if (!cachedModule) {
    throw new Error(`Failed to load ${CORE_PACKAGE_ID}`);
  }

  return cachedModule;
}

function resolveFallbackTarget(fallbackSpecifier?: string | URL): string {
  if (!fallbackSpecifier) {
    return LOCAL_CORE_ENTRY_URL.href;
  }

  if (typeof fallbackSpecifier === 'string') {
    return fallbackSpecifier;
  }

  return fallbackSpecifier.href;
}

function isModuleNotFoundError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  const code = (error as { code?: unknown }).code;
  const message = typeof error.message === 'string' ? error.message : '';

  return (
    code === 'ERR_MODULE_NOT_FOUND' ||
    code === 'MODULE_NOT_FOUND' ||
    /Cannot find (module|package)/i.test(message)
  );
}

/**
 * Visible for tests to ensure memoization does not leak between cases.
 */
export function __clearCoreModuleCacheForTesting(): void {
  cachedModule = undefined;
}
