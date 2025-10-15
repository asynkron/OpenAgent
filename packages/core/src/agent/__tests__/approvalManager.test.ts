// @ts-nocheck
/* eslint-env jest */
import { DEFAULT_COMMAND_MAX_BYTES } from '../../constants.js';
import { ApprovalManager } from '../approvalManager.js';

describe('ApprovalManager.shouldAutoApprove', () => {
  const baseDeps = {
    isPreapprovedCommand: () => false,
    isSessionApproved: () => false,
    approveForSession: () => {},
    getAutoApproveFlag: () => false,
    askHuman: async () => '',
    preapprovedCfg: {},
  };

  test('returns allowlist source when command is pre-approved', () => {
    const manager = new ApprovalManager({
      ...baseDeps,
      isPreapprovedCommand: () => true,
    });
    expect(manager.shouldAutoApprove({ run: 'ls', max_bytes: DEFAULT_COMMAND_MAX_BYTES })).toEqual({
      approved: true,
      source: 'allowlist',
    });
  });

  test('returns session source when command already approved this session', () => {
    const manager = new ApprovalManager({
      ...baseDeps,
      isSessionApproved: () => true,
    });
    expect(manager.shouldAutoApprove({ run: 'ls', max_bytes: DEFAULT_COMMAND_MAX_BYTES })).toEqual({
      approved: true,
      source: 'session',
    });
  });

  test('returns flag source when CLI auto-approve enabled', () => {
    const manager = new ApprovalManager({
      ...baseDeps,
      getAutoApproveFlag: () => true,
    });
    expect(manager.shouldAutoApprove({ run: 'ls', max_bytes: DEFAULT_COMMAND_MAX_BYTES })).toEqual({
      approved: true,
      source: 'flag',
    });
  });

  test('returns not approved when nothing matches', () => {
    const manager = new ApprovalManager(baseDeps);
    expect(manager.shouldAutoApprove({ run: 'ls', max_bytes: DEFAULT_COMMAND_MAX_BYTES })).toEqual({
      approved: false,
      source: null,
    });
  });

  test('rejects invalid command input gracefully', () => {
    const manager = new ApprovalManager(baseDeps);
    expect(manager.shouldAutoApprove(null)).toEqual({ approved: false, source: null });
  });
});

describe('ApprovalManager.requestHumanDecision', () => {
  const makeManager = ({ responses }) => {
    const logs = { info: [], warn: [], success: [] };
    let approvedCommand = null;
    const manager = new ApprovalManager({
      isPreapprovedCommand: () => false,
      isSessionApproved: () => false,
      approveForSession: (cmd) => {
        approvedCommand = cmd;
      },
      getAutoApproveFlag: () => false,
      askHuman: async () => {
        if (!responses.length) throw new Error('No more responses queued');
        return responses.shift();
      },
      preapprovedCfg: {},
      logInfo: (msg) => logs.info.push(msg),
      logWarn: (msg) => logs.warn.push(msg),
      logSuccess: (msg) => logs.success.push(msg),
    });

    return { manager, logs, approvedCommandRef: () => approvedCommand };
  };

  test('returns approve_once when user selects option 1', async () => {
    const { manager, logs } = makeManager({ responses: ['1'] });
    const outcome = await manager.requestHumanDecision({
      command: { run: 'ls', max_bytes: DEFAULT_COMMAND_MAX_BYTES },
    });
    expect(outcome).toEqual({ decision: 'approve_once' });
    expect(logs.success).toContain('Approved (run once).');
  });

  test('records session approval when user selects option 2', async () => {
    const { manager, logs, approvedCommandRef } = makeManager({ responses: ['2'] });
    const command = { run: 'pwd', max_bytes: DEFAULT_COMMAND_MAX_BYTES };
    const outcome = await manager.requestHumanDecision({ command });
    expect(outcome).toEqual({ decision: 'approve_session' });
    expect(approvedCommandRef()).toBe(command);
    expect(logs.success).toContain('Approved and added to session approvals.');
  });

  test('returns reject when user selects option 3', async () => {
    const { manager, logs } = makeManager({ responses: ['3'] });
    const outcome = await manager.requestHumanDecision({
      command: { run: 'rm', max_bytes: DEFAULT_COMMAND_MAX_BYTES },
    });
    expect(outcome).toEqual({ decision: 'reject', reason: 'human_declined' });
    expect(logs.warn).toContain('Command execution canceled by human (requested alternative).');
  });

  test('re-prompts on invalid input until valid choice provided', async () => {
    const { manager, logs } = makeManager({ responses: ['maybe', 'YES'] });
    const outcome = await manager.requestHumanDecision({
      command: { run: 'ls', max_bytes: DEFAULT_COMMAND_MAX_BYTES },
    });
    expect(outcome).toEqual({ decision: 'approve_once' });
    expect(logs.warn).toContain('Please enter 1, 2, or 3.');
  });
});
