import { autoResize } from './chat_dom.js';
import {
  createChatDomController,
  type ChatDomController,
  type ChatInputElement,
} from './chat_domController.js';
import {
  createChatInputController,
  type ChatInputController,
} from './chat_inputController.js';

export interface ChatBootstrapOptions {
  panel: HTMLElement | null | undefined;
  startContainer?: HTMLElement | null | undefined;
  startForm?: HTMLFormElement | null | undefined;
  startInput?: HTMLInputElement | ChatInputElement | null | undefined;
  chatContainer?: HTMLElement | null | undefined;
  chatBody?: HTMLElement | null | undefined;
  messageList?: HTMLElement | null | undefined;
  chatForm?: HTMLFormElement | null | undefined;
  chatInput?: ChatInputElement | null | undefined;
  planContainer?: HTMLElement | null | undefined;
  statusElement?: HTMLElement | null | undefined;
  windowRef?: Window & typeof globalThis;
  documentRef?: Document;
}

export interface ChatBootstrapHandlers {
  onMessageSubmit?: (message: string) => boolean;
  onQueueUpdate?: (pending: readonly string[]) => void;
}

export interface ChatBootstrapResult {
  dom: ChatDomController;
  input: ChatInputController;
  updateHandlers(handlers: ChatBootstrapHandlers): void;
  dispose(): void;
}

export interface ChatBootstrapDependencies {
  createDomController?: typeof createChatDomController;
  createInputController?: typeof createChatInputController;
  autoResizeInput?: (input: ChatInputElement) => void;
}

export function createChatBootstrap({
  panel,
  startContainer,
  startForm,
  startInput,
  chatContainer,
  chatBody,
  messageList,
  chatForm,
  chatInput,
  planContainer,
  statusElement,
  windowRef = window,
  documentRef = document,
}: ChatBootstrapOptions,
{ createDomController: createDom = createChatDomController,
  createInputController: createInput = createChatInputController,
  autoResizeInput = autoResize }: ChatBootstrapDependencies = {}): ChatBootstrapResult | null {
  if (!panel) {
    return null;
  }

  const sendButtons = new Set<HTMLButtonElement>();

  const collectButton = (form: HTMLFormElement | null | undefined): void => {
    const button = form?.querySelector<HTMLButtonElement>('button[type="submit"]');
    if (button) {
      sendButtons.add(button);
    }
  };

  collectButton(startForm ?? null);
  collectButton(chatForm ?? null);

  const dom = createDom({
    panel,
    startContainer: startContainer ?? null,
    chatContainer: chatContainer ?? null,
    chatBody: chatBody ?? null,
    messageList: messageList ?? null,
    chatInput: chatInput ?? null,
    planContainer: planContainer ?? null,
    statusElement: statusElement ?? null,
    windowRef,
    documentRef,
    sendButtons,
    autoResizeInput,
  });

  let submitHandler: (message: string) => boolean = () => true;
  let queueHandler: (pending: readonly string[]) => void = () => {};

  const input = createInput({
    startForm: startForm ?? null,
    startInput: (startInput ?? null) as ChatInputElement | null,
    chatForm: chatForm ?? null,
    chatInput: chatInput ?? null,
    autoResizeInput,
    isBlocked: () => dom.isThinking(),
    onMessageSubmit(message) {
      return submitHandler(message);
    },
    onQueueUpdate(pending) {
      queueHandler(pending);
    },
  });

  const dispose = (): void => {
    input.dispose();
    dom.dispose();
    sendButtons.clear();
  };

  return {
    dom,
    input,
    updateHandlers({ onMessageSubmit, onQueueUpdate }) {
      if (onMessageSubmit) {
        submitHandler = onMessageSubmit;
      }
      if (onQueueUpdate) {
        queueHandler = onQueueUpdate;
      }
    },
    dispose,
  };
}
