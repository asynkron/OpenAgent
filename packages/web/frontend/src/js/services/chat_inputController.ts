import { addListener, autoResize } from './chat_dom.js';
import type { ChatInputElement } from './chat_domController.js';

type CleanupFn = () => void;

export interface ChatInputControllerOptions {
  startForm?: HTMLFormElement | null;
  startInput?: ChatInputElement | null;
  chatForm?: HTMLFormElement | null;
  chatInput?: ChatInputElement | null;
  autoResizeInput?: (input: ChatInputElement) => void;
  isBlocked?: () => boolean;
  onMessageSubmit?: (message: string) => boolean | void;
  onQueueUpdate?: (pending: readonly string[]) => void;
}

export interface ChatInputController {
  registerSender(send: (message: string) => boolean): void;
  flushPending(): void;
  hasPending(): boolean;
  getPendingMessages(): readonly string[];
  dispose(): void;
}

export function createChatInputController({
  startForm,
  startInput,
  chatForm,
  chatInput,
  autoResizeInput = autoResize,
  isBlocked,
  onMessageSubmit,
  onQueueUpdate,
}: ChatInputControllerOptions): ChatInputController {
  const cleanupFns: CleanupFn[] = [];
  const pendingMessages: string[] = [];
  let sendFn: ((message: string) => boolean) | null = null;

  const notifyQueueUpdate = (): void => {
    onQueueUpdate?.([...pendingMessages]);
  };

  const enqueue = (message: string): void => {
    if (!message) {
      return;
    }
    pendingMessages.push(message);
    notifyQueueUpdate();
    flushPending();
  };

  const flushPending = (): void => {
    if (!sendFn) {
      return;
    }
    while (pendingMessages.length > 0) {
      const nextMessage = pendingMessages[0];
      let delivered = false;
      try {
        delivered = sendFn(nextMessage);
      } catch (error) {
        console.warn('Failed to deliver chat message', error);
        break;
      }
      if (!delivered) {
        break;
      }
      pendingMessages.shift();
      notifyQueueUpdate();
    }
  };

  const dispatchFromInput = (
    input: ChatInputElement | null | undefined,
    { resize }: { resize: boolean },
  ): void => {
    const value = input?.value ?? '';
    const trimmed = value.trim();
    if (!trimmed) {
      return;
    }
    if (isBlocked?.()) {
      return;
    }

    const accepted = onMessageSubmit?.(trimmed);
    if (accepted === false) {
      return;
    }

    enqueue(trimmed);

    if (input) {
      input.value = '';
      if (resize) {
        autoResizeInput?.(input);
      }
    }
  };

  const handleStartSubmit = (event: SubmitEvent): void => {
    event.preventDefault();
    dispatchFromInput(startInput ?? null, { resize: false });
  };

  const handleChatSubmit = (event: SubmitEvent): void => {
    event.preventDefault();
    dispatchFromInput(chatInput ?? null, { resize: true });
  };

  const handleChatKeydown = (event: KeyboardEvent): void => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      dispatchFromInput(chatInput ?? null, { resize: true });
    }
  };

  const handleChatInputChange = (_event: Event): void => {
    if (chatInput) {
      autoResizeInput?.(chatInput);
    }
  };

  addListener(startForm ?? null, 'submit', handleStartSubmit, cleanupFns);
  addListener(chatForm ?? null, 'submit', handleChatSubmit, cleanupFns);
  addListener(chatInput ?? null, 'keydown', handleChatKeydown, cleanupFns);
  addListener(chatInput ?? null, 'input', handleChatInputChange, cleanupFns);

  if (chatInput) {
    autoResizeInput?.(chatInput);
  }

  return {
    registerSender(send: (message: string) => boolean): void {
      sendFn = send;
      flushPending();
    },
    flushPending,
    hasPending(): boolean {
      return pendingMessages.length > 0;
    },
    getPendingMessages(): readonly string[] {
      return [...pendingMessages];
    },
    dispose(): void {
      while (pendingMessages.length > 0) {
        pendingMessages.pop();
      }
      cleanupFns.splice(0).forEach((cleanup) => {
        try {
          cleanup();
        } catch (error) {
          console.warn('Failed to clean up chat input listener', error);
        }
      });
    },
  };
}
