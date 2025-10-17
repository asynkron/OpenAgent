/* eslint-env jest */
import { describe, expect, test, beforeEach } from '@jest/globals';
import { createPlanStateMachine } from '../stateMachine/index.js';
import { globalRegistry } from '../../planStepRegistry.js';
import type { PlanEntry } from '../../planTypes.js';

describe('createPlanStateMachine', () => {
  beforeEach(() => {
    globalRegistry.clear();
  });

  test('marks commands as running and mutated', () => {
    const machine = createPlanStateMachine();
    const step: PlanEntry = { id: 'step-1', status: 'pending', command: { run: 'echo hello' } };

    machine.replaceActivePlan([step]);
    machine.resetMutationFlag();

    expect(machine.state.planMutated).toBe(false);

    machine.markCommandRunning(step);
    expect(step.status).toBe('running');
    expect(machine.state.planMutated).toBe(true);
  });

  test('completes commands when exit code succeeds', () => {
    const machine = createPlanStateMachine();
    const initialPlan: PlanEntry[] = [
      { id: 'first', status: 'pending', command: { run: 'echo first' } },
      { id: 'second', status: 'pending', command: { run: 'echo second' } },
    ];
    machine.replaceActivePlan(initialPlan);
    machine.resetMutationFlag();

    const [first, second] = machine.state.activePlan;

    const result = machine.applyCommandObservation({
      planStep: first,
      observation: { exit_code: 0 },
      commandResult: { exit_code: 0 } as never,
    });

    expect(result.type).toBe('completed');

    const pruneOutcome = machine.pruneCompletedSteps();
    expect(pruneOutcome.removedStepIds).toContain('first');
    expect(machine.state.activePlan).toHaveLength(1);
    expect(machine.state.activePlan[0]).toBe(second);
  });

  test('detects pending executable work', () => {
    const machine = createPlanStateMachine();
    const waiting: PlanEntry = {
      id: 'child',
      status: 'pending',
      waitingForId: ['parent'],
      command: { run: 'run child' },
    };
    const parent: PlanEntry = { id: 'parent', status: 'pending', command: { run: 'run parent' } };

    machine.replaceActivePlan([parent, waiting]);

    expect(machine.hasPendingExecutableWork()).toBe(true);
    machine.completePlanStep(parent);
    machine.pruneCompletedSteps();
    expect(machine.hasPendingExecutableWork()).toBe(true);
  });
});
