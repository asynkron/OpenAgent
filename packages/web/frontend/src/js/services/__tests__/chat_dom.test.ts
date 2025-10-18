import { jest } from '@jest/globals';
import { createDomHelpers, type ListenerTarget } from '../chat_dom.js';

class FakeEventTarget implements ListenerTarget {
  addEventListener = jest.fn<
    void,
    [type: string, listener: EventListener, options?: boolean | AddEventListenerOptions]
  >();

  removeEventListener = jest.fn<
    void,
    [type: string, listener: EventListener, options?: boolean | EventListenerOptions]
  >();

  dispatchEvent(): boolean {
    return true;
  }
}

class FakeInput {
  style = { height: '' };

  scrollHeight = 0;
}

describe('createDomHelpers', () => {
  it('registers a listener and exposes a cleanup callback', () => {
    const helpers = createDomHelpers();
    const target = new FakeEventTarget();
    const cleanupFns: Array<() => void> = [];
    const handler = jest.fn();

    helpers.addListener(target, 'click', handler, cleanupFns);

    expect(target.addEventListener).toHaveBeenCalledWith('click', handler);
    expect(cleanupFns).toHaveLength(1);

    cleanupFns[0]?.();

    expect(target.removeEventListener).toHaveBeenCalledWith('click', handler);
  });

  it('schedules resize work using the provided scheduler', () => {
    const scheduled: Array<() => void> = [];
    const helpers = createDomHelpers({
      maxInputHeight: 150,
      schedule(callback) {
        scheduled.push(callback);
      },
    });
    const input = new FakeInput();
    input.scrollHeight = 120;

    helpers.autoResize(input as unknown as HTMLTextAreaElement);

    expect(scheduled).toHaveLength(1);

    scheduled[0]?.();

    expect(input.style.height).toBe('120px');
  });

  it('clamps the textarea height when exceeding the configured maximum', () => {
    const scheduled: Array<() => void> = [];
    const helpers = createDomHelpers({
      maxInputHeight: 180,
      schedule(callback) {
        scheduled.push(callback);
      },
    });
    const input = new FakeInput();
    input.scrollHeight = 400;

    helpers.autoResize(input as unknown as HTMLTextAreaElement);
    scheduled[0]?.();

    expect(input.style.height).toBe('180px');
  });

  it('ignores missing targets when scheduling a resize', () => {
    const schedule = jest.fn();
    const helpers = createDomHelpers({ schedule });

    helpers.autoResize(null);

    expect(schedule).not.toHaveBeenCalled();
  });
});
