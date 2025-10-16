import { createChatActionRunner } from './chat_actionRunner.js';
import { createChatBootstrap } from './chat_bootstrap.js';
import {
  createChatLifecycle,
  type ChatLifecycle,
  type ChatLifecycleEvent,
} from './chat_lifecycle.js';
import { createChatRouter, parseAgentPayload } from './chat_router.js';
import {
  createChatSessionController,
  createChatSessionState,
  type ChatSessionApi,
} from './chat_sessionController.js';
import type { ChatInputElement } from './chat_domController.js';

type OptionalElement<T extends Element> = T | null | undefined;

type ChatLifecycleSubscription = () => void;

type ChatServiceTeardown = () => void;

export interface ChatServiceOptions {
  panel: OptionalElement<HTMLElement>;
  startContainer?: OptionalElement<HTMLElement>;
  startForm?: OptionalElement<HTMLFormElement>;
  startInput?: OptionalElement<HTMLInputElement>;
  chatContainer?: OptionalElement<HTMLElement>;
  chatBody?: OptionalElement<HTMLElement>;
  messageList?: OptionalElement<HTMLElement>;
  chatForm?: OptionalElement<HTMLFormElement>;
  chatInput?: OptionalElement<ChatInputElement>;
  planContainer?: OptionalElement<HTMLElement>;
  statusElement?: OptionalElement<HTMLElement>;
  reconnectDelay?: number;
  windowRef?: Window & typeof globalThis;
  documentRef?: Document;
}

export interface ChatServiceApi {
  connect(): void;
  dispose(): void;
}

function subscribeLifecycle(
  lifecycle: ChatLifecycle,
  handler: (event: ChatLifecycleEvent) => void,
): ChatLifecycleSubscription {
  return lifecycle.subscribe(handler);
}

function composeTeardown(...teardowns: ChatServiceTeardown[]): ChatServiceTeardown {
  return () => {
    for (const teardown of teardowns) {
      try {
        teardown();
      } catch (error) {
        console.warn('Failed to tear down chat service dependency', error);
      }
    }
  };
}

export function createChatService({
  panel: panelElement,
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
  reconnectDelay = 2000,
  windowRef = window,
  documentRef = document,
}: ChatServiceOptions): ChatServiceApi | null {
  const bootstrap = createChatBootstrap({
    panel: panelElement ?? null,
    startContainer: startContainer ?? null,
    startForm: startForm ?? null,
    startInput: startInput ?? null,
    chatContainer: chatContainer ?? null,
    chatBody: chatBody ?? null,
    messageList: messageList ?? null,
    chatForm: chatForm ?? null,
    chatInput: (chatInput ?? null) as ChatInputElement | null,
    planContainer: planContainer ?? null,
    statusElement: statusElement ?? null,
    windowRef,
    documentRef,
  });

  if (!bootstrap) {
    return null;
  }

  const { dom, input, updateHandlers, dispose: disposeBootstrap } = bootstrap;

  const sessionState = createChatSessionState();
  const actionRunner = createChatActionRunner({ dom, session: sessionState });
  const router = createChatRouter();

  const lifecycle = createChatLifecycle({
    windowRef,
    reconnectDelay,
    parsePayload: parseAgentPayload,
  });

  const session: ChatSessionApi = createChatSessionController({
    dom,
    input,
    lifecycle,
    routePayload: (payload) => router.route(payload),
    runActions: (actions) => actionRunner.run(actions),
    state: sessionState,
  });

  updateHandlers({
    onMessageSubmit: (message) => session.handleUserMessage(message),
    onQueueUpdate: (pending) => session.handleQueueUpdate(pending),
  });

  const unsubscribeLifecycle = subscribeLifecycle(lifecycle, (event) => {
    session.handleLifecycleEvent(event);
  });

  input.registerSender((message) => lifecycle.sendPrompt(message));

  session.initialize();

  const dispose = composeTeardown(
    unsubscribeLifecycle,
    () => session.dispose(),
    () => lifecycle.dispose(),
    () => disposeBootstrap(),
  );

  return {
    connect(): void {
      lifecycle.connect();
    },
    dispose(): void {
      dispose();
    },
  };
}
