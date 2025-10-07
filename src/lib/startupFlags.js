const startupFlags = {
  forceAutoApprove: false,
  noHuman: false,
  planMerge: false,
};

export function getStartupFlags() {
  return { ...startupFlags };
}

export function getAutoApproveFlag() {
  return startupFlags.forceAutoApprove;
}

export function getNoHumanFlag() {
  return startupFlags.noHuman;
}

export function getPlanMergeFlag() {
  return startupFlags.planMerge;
}

export function setNoHumanFlag(value) {
  startupFlags.noHuman = Boolean(value);
  return startupFlags.noHuman;
}

export function setStartupFlags(nextFlags = {}) {
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

  return getStartupFlags();
}

export function parseStartupFlagsFromArgv(argv = process.argv) {
  const positional = Array.isArray(argv) ? argv.slice(2) : [];
  let forceAutoApprove = false;
  let noHuman = false;
  let planMerge = false;

  for (const arg of positional) {
    if (!arg) continue;
    const normalized = String(arg).trim().toLowerCase();
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
    }
  }

  return { forceAutoApprove, noHuman, planMerge };
}

export function applyStartupFlagsFromArgv(argv = process.argv) {
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
};

Object.defineProperties(startupFlagAccessors, {
  STARTUP_FORCE_AUTO_APPROVE: {
    get: getAutoApproveFlag,
    set(value) {
      setStartupFlags({ forceAutoApprove: Boolean(value) });
    },
    enumerable: true,
  },
  STARTUP_NO_HUMAN: {
    get: getNoHumanFlag,
    set(value) {
      setStartupFlags({ noHuman: Boolean(value) });
    },
    enumerable: true,
  },
  STARTUP_PLAN_MERGE: {
    get: getPlanMergeFlag,
    set(value) {
      setStartupFlags({ planMerge: Boolean(value) });
    },
    enumerable: true,
  },
});
