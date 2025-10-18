export type CoreModule = typeof import('@asynkron/openagent-core');

export type CoreModuleContract = CoreModule & {
  createAgentRuntime: NonNullable<CoreModule['createAgentRuntime']>;
  applyStartupFlagsFromArgv: NonNullable<CoreModule['applyStartupFlagsFromArgv']>;
};

export type Importer = (specifier: string) => Promise<CoreModule>;

type ModuleNotFoundError = Error & { code?: string };

export function resolveImporter(
  candidate: Importer | undefined,
  defaultImporter: Importer,
): Importer {
  if (typeof candidate === 'function') {
    return candidate;
  }

  return defaultImporter;
}

export function resolveFallbackTarget(
  fallbackSpecifier: string | URL | undefined,
  defaultHref: string,
): string {
  if (!fallbackSpecifier) {
    return defaultHref;
  }

  if (typeof fallbackSpecifier === 'string') {
    return fallbackSpecifier;
  }

  return fallbackSpecifier.href;
}

/**
 * Attempts to import the core runtime, falling back to the provided specifier
 * when the dependency is not hoisted. Exported so tests can exercise the error
 * handling without patching module state.
 */
export async function importCoreWithFallback(
  importModule: Importer,
  packageId: string,
  fallbackTarget: string,
): Promise<CoreModule> {
  const primaryModule = await tryImport(importModule, packageId);

  if (primaryModule) {
    return primaryModule;
  }

  const fallbackModule = await tryImport(importModule, fallbackTarget);

  if (fallbackModule) {
    return fallbackModule;
  }

  throw new Error(
    `Failed to import "${packageId}" or fallback specifier "${fallbackTarget}".`,
  );
}

async function tryImport(importModule: Importer, specifier: string): Promise<CoreModule | null> {
  try {
    return await importModule(specifier);
  } catch (error: unknown) {
    const normalizedError = toError(error);

    if (isModuleNotFoundError(normalizedError)) {
      return null;
    }

    throw normalizedError;
  }
}

function toError(value: unknown): Error {
  if (value instanceof Error) {
    return value;
  }

  return new Error(String(value));
}

function isModuleNotFoundError(error: Error): error is ModuleNotFoundError {
  const code = (error as ModuleNotFoundError).code;
  const message = typeof error.message === 'string' ? error.message : '';

  return (
    code === 'ERR_MODULE_NOT_FOUND' ||
    code === 'MODULE_NOT_FOUND' ||
    /Cannot find (module|package)/iu.test(message)
  );
}

export function ensureCoreModule(
  module: CoreModule,
  packageId: string,
): CoreModuleContract {
  if (
    !module ||
    typeof module.createAgentRuntime !== 'function' ||
    typeof module.applyStartupFlagsFromArgv !== 'function'
  ) {
    throw new TypeError(
      `Module loaded from ${packageId} is missing required exports for the CLI runtime.`,
    );
  }

  return module as CoreModuleContract;
}
