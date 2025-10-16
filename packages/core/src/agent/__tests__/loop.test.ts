import { createAgentRuntime } from '../loop.js';
import { QUEUE_DONE } from '../../utils/asyncQueue.js';
import type { ResponsesClient, ResponsesProvider } from '../../openai/responses.js';
import type { PromptCoordinatorEvent, PromptRequestMetadata } from '../promptCoordinator.js';

class TestOutputsQueue {
  readonly items: Array<Record<string, unknown>> = [];

  closed = false;

  push(value: Record<string, unknown>): void {
    this.items.push(value);
  }

  close(): void {
    this.closed = true;
  }

  async next(): Promise<typeof QUEUE_DONE> {
    return QUEUE_DONE;
  }
}

class TestInputsQueue {
  closed = false;

  private done = false;

  push(): void {}

  close(): void {
    this.closed = true;
  }

  async next(): Promise<typeof QUEUE_DONE> {
    if (this.done) {
      return QUEUE_DONE;
    }
    this.done = true;
    return QUEUE_DONE;
  }
}

class StubPromptCoordinator {
  private readonly emitEvent: (event: PromptCoordinatorEvent) => void;

  constructor({ emitEvent }: { emitEvent: (event: PromptCoordinatorEvent) => void }) {
    this.emitEvent = emitEvent;
  }

  async request(
    prompt: string,
    metadata: PromptRequestMetadata = { scope: 'user-input' },
  ): Promise<string> {
    this.emitEvent({ type: 'request-input', prompt, metadata });
    return 'exit';
  }

  handlePrompt(): void {}

  handleCancel(): void {}

  close(): void {}
}

const createStubResponsesClient = (): ResponsesClient => {
  const responses = (() => ({})) as unknown as ResponsesProvider;
  return { responses } as ResponsesClient;
};

describe('createAgentRuntime', () => {
  it('deep clones emitted events so downstream mutations are isolated', async () => {
    const outputsQueue = new TestOutputsQueue();
    let originalPlanEvent = null;

    const runtime = createAgentRuntime({
      createOutputsQueueFn: () => outputsQueue,
      createInputsQueueFn: () => new TestInputsQueue(),
      createPromptCoordinatorFn: (config) => new StubPromptCoordinator(config),
      // Provide a stubbed client so tests do not require a real OpenAI API key.
      getClient: () => createStubResponsesClient(),
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
