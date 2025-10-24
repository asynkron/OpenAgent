/* eslint-env jest */
import { describe, expect, test, jest } from '@jest/globals';
import { CommandRuntime } from '../../commandRuntime.js';
import { ApprovalManager } from '../../../approvalManager.js';
import { createEscState } from '../../../escState.js';
import { prepareCommandCandidate, runApprovedCommand } from '../executor.js';
import type { PlanRuntime } from '../../planRuntime.js';
import type ObservationBuilder from '../../observationBuilder.js';

const createPlanRuntimeMock = () =>
  ({
    markCommandRunning: jest.fn(),
    emitPlanSnapshot: jest.fn().mockReturnValue({ type: 'plan-snapshot', plan: [] }),
    applyEffects: jest.fn(),
  }) as unknown as PlanRuntime;

describe('prepareCommandCandidate', () => {
  test('trims command run text', () => {
    const candidate = {
      step: { id: 's1', status: 'pending' },
      command: { run: '  ls  ' },
    };

    const prepared = prepareCommandCandidate(candidate as never);
    expect(prepared).toMatchObject({
      type: 'prepared',
      normalizedRun: 'ls',
      command: { run: 'ls' },
    });
  });
});

describe('runApprovedCommand', () => {
  test('executes command safely and emits snapshot effect', async () => {
    const planRuntime = createPlanRuntimeMock();
    const executeAgentCommandFn = jest.fn().mockResolvedValue({
      result: { exit_code: 0 },
      executionDetails: { type: 'EXECUTE' },
    });

    const outcome = await runApprovedCommand(
      {
        executeAgentCommandFn: executeAgentCommandFn as never,
        runCommandFn: jest.fn(),
        emitEvent: jest.fn(),
        planRuntime,
        virtualCommandExecutor: null,
      },
      {
        type: 'approved',
        command: { run: 'ls' },
        planStep: { id: 'root', status: 'pending' },
        normalizedRun: 'ls',
      },
    );

    expect(planRuntime.markCommandRunning).toHaveBeenCalled();
    expect(planRuntime.applyEffects).toHaveBeenCalledWith([{ type: 'plan-snapshot', plan: [] }]);
    expect(outcome).toMatchObject({ type: 'executed', result: { exit_code: 0 } });
  });
});

describe('CommandRuntime', () => {
  test('returns stop when ESC triggers during execution', async () => {
    const escController = createEscState();
    const planRuntime = {
      markCommandRunning: jest.fn(),
      emitPlanSnapshot: jest.fn(() => ({ type: 'plan-snapshot', plan: [] })),
      applyEffects: jest.fn(),
      applyCommandObservation: jest.fn(),
    } as unknown as PlanRuntime;

    const observationBuilder = {
      build: jest.fn(() => ({
        renderPayload: {
          stdout: '',
          stderr: '',
          stdoutPreview: '',
          stderrPreview: '',
        },
        observation: {
          observation_for_llm: { stdout: '', stderr: '', truncated: false },
          observation_metadata: {
            runtime_ms: 5,
            killed: true,
            timestamp: new Date().toISOString(),
          },
        },
      })),
    };

    let resolveCommand: ((value: unknown) => void) | null = null;
    const executeAgentCommandFn = jest.fn(
      () =>
        new Promise((resolve) => {
          resolveCommand = resolve;
        }),
    );

    const emitEvent = jest.fn();
    const runtime = new CommandRuntime({
      approvalManager: null,
      emitEvent,
      emitAutoApproveStatus: false,
      runCommandFn: jest.fn(),
      executeAgentCommandFn: executeAgentCommandFn as never,
      virtualCommandExecutor: null,
      incrementCommandCountFn: jest.fn().mockResolvedValue(undefined),
      observationBuilder: observationBuilder as never,
      planRuntime,
      emitDebug: jest.fn(),
      escState: escController.state,
    });

    const candidate = {
      command: {
        reason: '',
        shell: '',
        run: 'echo hello',
        cwd: '.',
        timeout_sec: 1,
        filter_regex: '',
        tail_lines: 200,
        max_bytes: 1024,
      },
      step: { id: 'step-1', status: 'pending' },
    } as never;

    const executePromise = runtime.execute(candidate);
    for (let i = 0; i < 10 && executeAgentCommandFn.mock.calls.length === 0; i += 1) {
      await Promise.resolve();
    }
    expect(executeAgentCommandFn).toHaveBeenCalled();
    escController.trigger?.({ reason: 'escape-key' });

    if (!resolveCommand) {
      throw new Error('executeAgentCommandFn did not expose a resolver.');
    }

    resolveCommand({
      result: {
        stdout: '',
        stderr: 'Command was canceled.',
        exit_code: null,
        killed: true,
        runtime_ms: 5,
      },
      executionDetails: { type: 'EXECUTE', command: candidate.command },
    });

    const outcome = await executePromise;
    expect(outcome).toBe('stop');
    await new Promise((resolve) => setImmediate(resolve));
    expect(planRuntime.applyCommandObservation).toHaveBeenCalled();
    expect(emitEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'status',
        payload: expect.objectContaining({ level: 'warn' }),
      }),
    );
  });

  test('returns stop immediately when ESC triggers during approval prompt', async () => {
    const escController = createEscState();
    const askHuman = jest.fn(
      () =>
        new Promise<string | undefined>(() => {
          // Intentionally never resolve to simulate a stuck approval prompt.
        }),
    );

    const approvalManager = new ApprovalManager({ askHuman });

    const planRuntime = {
      markCommandRunning: jest.fn(),
      emitPlanSnapshot: jest.fn(() => ({ type: 'plan-snapshot', plan: [] })),
      applyEffects: jest.fn(),
      applyCommandObservation: jest.fn(),
      handleCommandRejection: jest.fn(() => ({ effects: [] })),
    } as unknown as PlanRuntime;

    const runtime = new CommandRuntime({
      approvalManager,
      emitEvent: jest.fn(),
      emitAutoApproveStatus: false,
      runCommandFn: jest.fn(),
      executeAgentCommandFn: jest.fn(),
      virtualCommandExecutor: null,
      incrementCommandCountFn: jest.fn().mockResolvedValue(undefined),
      observationBuilder: {
        build: jest.fn(),
      } as unknown as ObservationBuilder,
      planRuntime,
      emitDebug: jest.fn(),
      escState: escController.state,
    });

    const candidate = {
      command: {
        reason: 'Check status',
        shell: '',
        run: 'status',
        cwd: '.',
        timeout_sec: 1,
        filter_regex: '',
        tail_lines: 200,
        max_bytes: 1024,
      },
      step: { id: 'step-approval', status: 'pending' },
    } as never;

    const executePromise = runtime.execute(candidate);

    for (let i = 0; i < 10 && askHuman.mock.calls.length === 0; i += 1) {
      await Promise.resolve();
    }

    expect(askHuman).toHaveBeenCalled();
    escController.trigger?.({ reason: 'escape-key' });

    const outcome = await executePromise;
    expect(outcome).toBe('stop');
  });
});
