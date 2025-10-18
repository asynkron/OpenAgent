import type { Instance } from 'ink';

export type RuntimeLifecycle = {
  readonly promise: Promise<void>;
  readonly handleComplete: () => void;
  readonly handleError: (error: unknown) => void;
  readonly observeExit: (app: Instance) => void;
};

// Keeps the Ink app lifecycle deterministic so completion and error signals settle exactly once.
export function createRuntimeLifecycle(): RuntimeLifecycle {
  let settled = false;
  let resolvePromise: (() => void) | undefined;
  let rejectPromise: ((error: unknown) => void) | undefined;

  const promise = new Promise<void>((resolve, reject) => {
    resolvePromise = () => {
      if (!settled) {
        settled = true;
        resolve();
      }
    };
    rejectPromise = (error: unknown) => {
      if (!settled) {
        settled = true;
        reject(error);
      }
    };
  });

  const handleComplete = () => {
    if (resolvePromise !== undefined) {
      resolvePromise();
    }
  };

  const handleError = (error: unknown) => {
    if (rejectPromise !== undefined) {
      rejectPromise(error);
    }
  };

  const observeExit = (app: Instance) => {
    app.waitUntilExit().catch((error: unknown) => {
      handleError(error);
    });
  };

  return { promise, handleComplete, handleError, observeExit };
}
