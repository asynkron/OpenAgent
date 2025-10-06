/**
 * Internal state and helpers for startup flags shared between the CLI runner
 * and library consumers.
 */

let startupForceAutoApprove = false;
let startupNoHuman = false;

export function getAutoApproveFlag() {
  return startupForceAutoApprove;
}

export function getNoHumanFlag() {
  return startupNoHuman;
}

export function setNoHumanFlag(value) {
  startupNoHuman = Boolean(value);
}

export function setStartupFlags({ forceAutoApprove = false, noHuman = false } = {}) {
  startupForceAutoApprove = Boolean(forceAutoApprove);
  startupNoHuman = Boolean(noHuman);
}

export function parseStartupFlagsFromArgv(argv = process.argv) {
  const positional = Array.isArray(argv) ? argv.slice(2) : [];
  let forceAutoApprove = false;
  let noHuman = false;

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
    }

    if (normalized === 'nohuman' || normalized === '--nohuman' || normalized === '--no-human') {
      noHuman = true;
    }
  }

  return { forceAutoApprove, noHuman };
}

export function applyStartupFlagsFromArgv(argv = process.argv) {
  const flags = parseStartupFlagsFromArgv(argv);
  setStartupFlags(flags);
  return flags;
}

export const startupFlagAccessors = {
  get STARTUP_FORCE_AUTO_APPROVE() {
    return startupForceAutoApprove;
  },
  set STARTUP_FORCE_AUTO_APPROVE(value) {
    startupForceAutoApprove = Boolean(value);
  },
  get STARTUP_NO_HUMAN() {
    return startupNoHuman;
  },
  set STARTUP_NO_HUMAN(value) {
    startupNoHuman = Boolean(value);
  },
};

export default {
  getAutoApproveFlag,
  getNoHumanFlag,
  setNoHumanFlag,
  setStartupFlags,
  parseStartupFlagsFromArgv,
  applyStartupFlagsFromArgv,
  startupFlagAccessors,
};
