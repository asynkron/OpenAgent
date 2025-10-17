export interface StartupFlags {
  forceAutoApprove: boolean;
  noHuman: boolean;
  planMerge: boolean;
  debug: boolean;
}

const startupFlags: StartupFlags = {
  forceAutoApprove: false,
  noHuman: false,
  planMerge: false,
  debug: false,
};

export function getStartupFlags(): StartupFlags {
  return { ...startupFlags };
}

export function getAutoApproveFlag(): boolean {
  return startupFlags.forceAutoApprove;
}

export function getNoHumanFlag(): boolean {
  return startupFlags.noHuman;
}

export function getPlanMergeFlag(): boolean {
  return startupFlags.planMerge;
}

export function getDebugFlag(): boolean {
  return startupFlags.debug;
}

export function setNoHumanFlag(value: unknown): boolean {
  startupFlags.noHuman = Boolean(value);
  return startupFlags.noHuman;
}

export interface StartupFlagOverrides {
  forceAutoApprove?: unknown;
  noHuman?: unknown;
  planMerge?: unknown;
  debug?: unknown;
}

export function setStartupFlags(nextFlags: StartupFlagOverrides = {}): StartupFlags {
  if (!nextFlags || typeof nextFlags !== 'object') {
    return getStartupFlags();
  }

  if (Object.prototype.hasOwnProperty.call(nextFlags, 'forceAutoApprove')) {
    startupFlags.forceAutoApprove = Boolean(nextFlags.forceAutoApprove);
  }

  if (Object.prototype.hasOwnProperty.call(nextFlags, 'noHuman')) {
    startupFlags.noHuman = Boolean(nextFlags.noHuman);
  }

  if (Object.prototype.hasOwnProperty.call(nextFlags, 'planMerge')) {
    startupFlags.planMerge = Boolean(nextFlags.planMerge);
  }

  if (Object.prototype.hasOwnProperty.call(nextFlags, 'debug')) {
    startupFlags.debug = Boolean(nextFlags.debug);
  }

  return getStartupFlags();
}

export function parseStartupFlagsFromArgv(argv: readonly unknown[] = process.argv): StartupFlags {
  const positional = Array.isArray(argv) ? argv.slice(2).map((value) => String(value)) : [];
  let forceAutoApprove = false;
  let noHuman = false;
  let planMerge = false;
  let debug = false;

  for (const arg of positional) {
    if (!arg) continue;
    const normalized = arg.trim().toLowerCase();
    if (
      normalized === 'auto' ||
      normalized === '--auto' ||
      normalized === '--auto-approve' ||
      normalized === '--auto-approval'
    ) {
      forceAutoApprove = true;
      continue;
    }

    if (normalized === 'nohuman' || normalized === '--nohuman' || normalized === '--no-human') {
      noHuman = true;
      continue;
    }

    if (normalized === 'plan-merge' || normalized === '--plan-merge') {
      planMerge = true;
      continue;
    }

    if (normalized === 'debug' || normalized === '--debug') {
      debug = true;
    }
  }

  return { forceAutoApprove, noHuman, planMerge, debug };
}

export function applyStartupFlagsFromArgv(argv: readonly unknown[] = process.argv): StartupFlags {
  const parsed = parseStartupFlagsFromArgv(argv);
  return setStartupFlags(parsed);
}

export const startupFlagAccessors = {
  getStartupFlags,
  setStartupFlags,
  getAutoApproveFlag,
  getNoHumanFlag,
  setNoHumanFlag,
  getPlanMergeFlag,
  getDebugFlag,
};

type AccessorValue = boolean;

Object.defineProperties(startupFlagAccessors, {
  STARTUP_FORCE_AUTO_APPROVE: {
    get: getAutoApproveFlag,
    set(value: AccessorValue) {
      setStartupFlags({ forceAutoApprove: value });
    },
    enumerable: true,
  },
  STARTUP_NO_HUMAN: {
    get: getNoHumanFlag,
    set(value: AccessorValue) {
      setStartupFlags({ noHuman: value });
    },
    enumerable: true,
  },
  STARTUP_PLAN_MERGE: {
    get: getPlanMergeFlag,
    set(value: AccessorValue) {
      setStartupFlags({ planMerge: value });
    },
    enumerable: true,
  },
  STARTUP_DEBUG: {
    get: getDebugFlag,
    set(value: AccessorValue) {
      setStartupFlags({ debug: value });
    },
    enumerable: true,
  },
});
