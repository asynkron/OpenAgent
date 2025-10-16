import { jest } from '@jest/globals';
import { createChatInputController } from '../chat_inputController.js';

class FakeEventTarget implements EventTarget {
  private listeners: Map<string, Set<EventListener>> = new Map();

  addEventListener(type: string, listener: EventListener): void {
    const listeners = this.listeners.get(type) ?? new Set();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }

  removeEventListener(type: string, listener: EventListener): void {
    const listeners = this.listeners.get(type);
    listeners?.delete(listener);
  }

  dispatchEvent(event: Event): boolean {
    const listeners = this.listeners.get(event.type ?? '');
    if (!listeners) {
      return !('defaultPrevented' in event && (event as { defaultPrevented?: boolean }).defaultPrevented);
    }
    for (const listener of listeners) {
      listener.call(this, event);
    }
    return !('defaultPrevented' in event && (event as { defaultPrevented?: boolean }).defaultPrevented);
  }

  emit<Type extends string, EventShape extends Record<string, unknown>>(
    type: Type,
    event: EventShape & { preventDefault?: () => void } = {} as EventShape,
  ): void {
    const payload = {
      type,
      preventDefault: () => {
        (payload as unknown as { defaultPrevented: boolean }).defaultPrevented = true;
        event.preventDefault?.();
      },
      defaultPrevented: false,
      ...event,
    } as unknown as Event;
    this.dispatchEvent(payload);
  }
}

class FakeForm extends FakeEventTarget {}

class FakeInput extends FakeEventTarget {
  value = '';
  style = { height: '' };
  scrollHeight = 64;
  focus = jest.fn();
}

describe('createChatInputController', () => {
  it('queues messages and flushes them when sender succeeds', () => {
    const startForm = new FakeForm() as unknown as HTMLFormElement;
    const startInput = new FakeInput() as unknown as HTMLInputElement;
    const chatForm = new FakeForm() as unknown as HTMLFormElement;
    const chatInput = new FakeInput() as unknown as HTMLTextAreaElement;

    const onMessageSubmit = jest.fn(() => true);
    const onQueueUpdate = jest.fn();

    const controller = createChatInputController({
      startForm,
      startInput,
      chatForm,
      chatInput,
      onMessageSubmit,
      onQueueUpdate,
    });

    let allowSend = false;
    const send = jest.fn(() => allowSend);
    controller.registerSender(send);

    chatInput.value = ' queued message ';
    (chatForm as unknown as FakeForm).emit('submit');

    expect(onMessageSubmit).toHaveBeenCalledWith('queued message');
    expect(controller.hasPending()).toBe(true);
    expect(controller.getPendingMessages()).toEqual(['queued message']);
    expect(send).toHaveBeenCalledTimes(1);
    expect(onQueueUpdate).toHaveBeenLastCalledWith(['queued message']);
    expect(chatInput.value).toBe('');

    allowSend = true;
    controller.flushPending();

    expect(send).toHaveBeenCalledTimes(2);
    expect(controller.hasPending()).toBe(false);
    expect(onQueueUpdate).toHaveBeenLastCalledWith([]);

    controller.dispose();
  });

  it('honours the blocking callback before queuing messages', () => {
    const chatForm = new FakeForm() as unknown as HTMLFormElement;
    const chatInput = new FakeInput() as unknown as HTMLTextAreaElement;

    let blocked = true;
    const onMessageSubmit = jest.fn(() => true);

    const controller = createChatInputController({
      chatForm,
      chatInput,
      isBlocked: () => blocked,
      onMessageSubmit,
    });

    const send = jest.fn(() => true);
    controller.registerSender(send);

    chatInput.value = 'blocked';
    (chatForm as unknown as FakeForm).emit('submit');

    expect(onMessageSubmit).not.toHaveBeenCalled();
    expect(controller.hasPending()).toBe(false);

    blocked = false;
    chatInput.value = 'allowed';
    (chatForm as unknown as FakeForm).emit('submit');

    expect(onMessageSubmit).toHaveBeenCalledWith('allowed');
    expect(controller.hasPending()).toBe(false);

    controller.dispose();
  });
});
