import { createAgentRuntime } from '../loop.js';
import { QUEUE_DONE } from '../../utils/asyncQueue.js';

class TestOutputsQueue {
  constructor() {
    this.items = [];
    this.closed = false;
  }

  push(value) {
    this.items.push(value);
  }

  close() {
    this.closed = true;
  }

  async next() {
    return QUEUE_DONE;
  }
}

class TestInputsQueue {
  constructor() {
    this.closed = false;
    this.done = false;
  }

  push() {}

  close() {
    this.closed = true;
  }

  async next() {
    if (this.done) {
      return QUEUE_DONE;
    }
    this.done = true;
    return QUEUE_DONE;
  }
}

class StubPromptCoordinator {
  constructor({ emitEvent }) {
    this.emitEvent = emitEvent;
  }

  async request(prompt, metadata = {}) {
    this.emitEvent({ type: 'request-input', prompt, metadata });
    return 'exit';
  }

  handlePrompt() {}

  handleCancel() {}

  close() {}
}

describe('createAgentRuntime', () => {
  it('deep clones emitted events so downstream mutations are isolated', async () => {
    const outputsQueue = new TestOutputsQueue();
    let originalPlanEvent = null;

    const runtime = createAgentRuntime({
      createOutputsQueueFn: () => outputsQueue,
      createInputsQueueFn: () => new TestInputsQueue(),
      createPromptCoordinatorFn: (config) => new StubPromptCoordinator(config),
      // Provide a stubbed client so tests do not require a real OpenAI API key.
      getClient: () => ({ responses: {} }),
      // Disable history compaction since it depends on the real client instance.
      createHistoryCompactorFn: () => null,
      createPlanManagerFn: ({ emit }) => ({
        async initialize() {
          originalPlanEvent = {
            type: 'plan',
            plan: {
              steps: [
                {
                  id: 'step-1',
                  actions: ['initial'],
                },
              ],
            },
          };
          emit(originalPlanEvent);
          // Mutate after emitting to verify the queued copy stays frozen in time.
          originalPlanEvent.plan.steps[0].actions.push('mutated');
        },
      }),
      getNoHumanFlag: () => false,
    });

    await runtime.start();

    const emittedPlanEvent = outputsQueue.items.find((event) => event.type === 'plan');

    expect(originalPlanEvent.plan.steps[0].actions).toEqual(['initial', 'mutated']);
    expect(emittedPlanEvent).toBeDefined();
    expect(emittedPlanEvent.plan.steps[0].actions).toEqual(['initial']);
    expect(emittedPlanEvent.plan).not.toBe(originalPlanEvent.plan);
  });
});
