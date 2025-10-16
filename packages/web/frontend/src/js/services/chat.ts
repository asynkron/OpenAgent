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
import { createChatActionRunner } from './chat_actionRunner.js';
import {
  createChatConnection,
  type ChatConnection,
  type ChatSocketStatusUpdate,
} from './chat_connection.js';
import {
  createChatRouter,
  parseAgentPayload,
  type AgentIncomingPayload,
} from './chat_router.js';
import {
  createChatSessionController,
  type ChatSessionController,
} from './chat_session.js';

type OptionalElement<T extends Element> = T | null | undefined;

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
  if (!panelElement) {
    return null;
  }

  const panelRef = panelElement;
  const sendButtons = new Set<HTMLButtonElement>();

  const startButton = startForm?.querySelector<HTMLButtonElement>('button[type="submit"]');
  if (startButton) {
    sendButtons.add(startButton);
  }
  const chatButton = chatForm?.querySelector<HTMLButtonElement>('button[type="submit"]');
  if (chatButton) {
    sendButtons.add(chatButton);
  }

  const dom: ChatDomController = createChatDomController({
    panel: panelRef,
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
    autoResizeInput: autoResize,
  });

  const session: ChatSessionController = createChatSessionController();
  const router = createChatRouter();
  const actionRunner = createChatActionRunner({ dom, session });

  const ensureConversationStarted = (): void => {
    if (session.startConversation()) {
      dom.ensureConversationStarted();
    }
  };

  let inputController: ChatInputController | null = null;
  let connection: ChatConnection | null = null;

  const routeAgentPayload = (payload: AgentIncomingPayload): void => {
    if (session.isDestroyed()) {
      return;
    }
    const actions = router.route(payload);
    actionRunner.run(actions);
  };

  const handleSocketStatus = (status: ChatSocketStatusUpdate): void => {
    if (session.isDestroyed()) {
      return;
    }
    dom.setThinking(false);
    dom.setStatus(status.message, { level: status.level });
  };

  connection = createChatConnection({
    windowRef,
    reconnectDelay,
    parsePayload: parseAgentPayload,
    onStatus: handleSocketStatus,
    onPayload: routeAgentPayload,
    onConnectionChange(connected) {
      session.setSocketConnected(connected);
      if (!inputController) {
        return;
      }
      if (connected) {
        dom.setThinking(false);
        inputController.flushPending();
      }
    },
  });

  session.setSocketConnected(connection.isConnected());

  inputController = createChatInputController({
    startForm: startForm ?? null,
    startInput: startInput ?? null,
    chatForm: chatForm ?? null,
    chatInput: chatInput ?? null,
    autoResizeInput: autoResize,
    isBlocked: () => dom.isThinking(),
    onMessageSubmit(message) {
      ensureConversationStarted();
      dom.appendMessage('user', message);
      return true;
    },
    onQueueUpdate(pending) {
      if (pending.length > 0 && !session.isSocketConnected()) {
        dom.setStatus('Waiting for the agent runtime connection...');
        connection?.connect();
      }
    },
  });

  inputController.registerSender((message) => connection?.sendPrompt(message) ?? false);

  dom.setStatus('');
  dom.updatePanelState(session.hasConversation());

  return {
    connect(): void {
      connection?.connect();
    },
    dispose(): void {
      session.markDestroyed();
      dom.dispose();
      connection?.dispose();
      connection = null;
      inputController?.dispose();
      inputController = null;
    },
  };
}
