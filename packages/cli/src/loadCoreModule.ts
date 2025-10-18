import {
  ensureCoreModule,
  importCoreWithFallback,
  resolveFallbackTarget,
  resolveImporter,
  type CoreModule,
  type CoreModuleContract,
  type Importer,
} from './loadCoreModuleHelpers.js';

const CORE_PACKAGE_ID = '@asynkron/openagent-core';
const LOCAL_CORE_ENTRY_URL = new URL('../../core/index.js', import.meta.url);

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

  const importModule = resolveImporter(importer, defaultImporter);
  const fallbackTarget = resolveFallbackTarget(
    fallbackSpecifier,
    LOCAL_CORE_ENTRY_URL.href,
  );
  const importedModule = await importCoreWithFallback(
    importModule,
    CORE_PACKAGE_ID,
    fallbackTarget,
  );

  cachedModule = ensureCoreModule(importedModule, CORE_PACKAGE_ID);
  return cachedModule;
}

/**
 * Visible for tests to ensure memoization does not leak between cases.
 */
export function __clearCoreModuleCacheForTesting(): void {
  cachedModule = undefined;
}
