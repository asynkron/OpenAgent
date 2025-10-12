const CORE_PACKAGE_ID = '@asynkron/openagent-core';
const LOCAL_CORE_ENTRY_URL = new URL('../../core/index.js', import.meta.url);

type CoreModule = typeof import('@asynkron/openagent-core');

type CoreModuleContract = CoreModule & {
  createAgentRuntime: NonNullable<CoreModule['createAgentRuntime']>;
  applyStartupFlagsFromArgv: NonNullable<CoreModule['applyStartupFlagsFromArgv']>;
};

type Importer = (specifier: string) => Promise<CoreModule>;

type LoadCoreModuleOptions = {
  importer?: Importer;
  fallbackSpecifier?: string | URL;
};

const defaultImporter: Importer = (specifier) => import(specifier) as Promise<CoreModule>;

let cachedModule: CoreModuleContract | undefined;

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
}: LoadCoreModuleOptions = {}): Promise<CoreModuleContract> {
  if (cachedModule) {
    return cachedModule;
  }

  const importModule = typeof importer === 'function' ? importer : defaultImporter;
  const fallbackTarget = resolveFallbackTarget(fallbackSpecifier);

  try {
    cachedModule = ensureCoreModule(await importModule(CORE_PACKAGE_ID));
  } catch (error: unknown) {
    if (isModuleNotFoundError(error)) {
      cachedModule = ensureCoreModule(await importModule(fallbackTarget));
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

  return typeof fallbackSpecifier === 'string' ? fallbackSpecifier : fallbackSpecifier.href;
}

type ModuleNotFoundError = Error & { code?: string };

function isModuleNotFoundError(error: unknown): error is ModuleNotFoundError {
  if (!(error instanceof Error)) {
    return false;
  }

  const code = (error as ModuleNotFoundError).code;
  const message = typeof error.message === 'string' ? error.message : '';

  return (
    code === 'ERR_MODULE_NOT_FOUND' ||
    code === 'MODULE_NOT_FOUND' ||
    /Cannot find (module|package)/iu.test(message)
  );
}

/**
 * Visible for tests to ensure memoization does not leak between cases.
 */
export function __clearCoreModuleCacheForTesting(): void {
  cachedModule = undefined;
}

function ensureCoreModule(module: CoreModule): CoreModuleContract {
  if (
    !module ||
    typeof module.createAgentRuntime !== 'function' ||
    typeof module.applyStartupFlagsFromArgv !== 'function'
  ) {
    throw new TypeError(
      `Module loaded from ${CORE_PACKAGE_ID} is missing required exports for the CLI runtime.`,
    );
  }

  return module as CoreModuleContract;
}
