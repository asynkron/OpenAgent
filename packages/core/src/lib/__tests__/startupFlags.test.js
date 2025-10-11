/* eslint-env jest */
import {
  getStartupFlags,
  setStartupFlags,
  getDebugFlag,
  parseStartupFlagsFromArgv,
  startupFlagAccessors,
} from '../startupFlags.js';

describe('startupFlags debug support', () => {
  afterEach(() => {
    setStartupFlags({
      forceAutoApprove: false,
      noHuman: false,
      planMerge: false,
      debug: false,
    });
  });

  test('parseStartupFlagsFromArgv enables debug flag', () => {
    const flags = parseStartupFlagsFromArgv(['node', 'cli', '--debug']);
    expect(flags.debug).toBe(true);
  });

  test('setStartupFlags toggles debug flag', () => {
    setStartupFlags({ debug: true });
    expect(getDebugFlag()).toBe(true);
    setStartupFlags({ debug: false });
    expect(getDebugFlag()).toBe(false);
  });

  test('startupFlagAccessors exposes STARTUP_DEBUG accessor', () => {
    expect(startupFlagAccessors.STARTUP_DEBUG).toBe(false);
    startupFlagAccessors.STARTUP_DEBUG = true;
    expect(getStartupFlags().debug).toBe(true);
  });
});
