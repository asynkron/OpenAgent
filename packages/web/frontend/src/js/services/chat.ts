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
import {
  createChatRouter,
  parseAgentPayload,
  type AgentIncomingPayload,
  type ChatRouteAction,
} from './chat_router.js';
import {
  createChatSocketManager,
  type ChatSocketManager,
  type ChatSocketStatusUpdate,
} from './chat_socket.js';

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

  let destroyed = false;
  let hasConversation = false;
  let socketConnected = false;
  let socketManager: ChatSocketManager | null = null;
  const router = createChatRouter();

  const ensureConversationStarted = (): void => {
    if (hasConversation) {
      return;
    }
    hasConversation = true;
    dom.ensureConversationStarted();
  };

  const updatePanelState = (): void => {
    dom.updatePanelState(hasConversation);
  };

  const applyRouteActions = (actions: ChatRouteAction[]): void => {
    for (const action of actions) {
      if (destroyed) {
        return;
      }
      switch (action.type) {
        case 'thinking':
          dom.setThinking(action.active);
          break;
        case 'status':
          if (action.clear) {
            dom.setStatus('');
          } else {
            dom.setStatus(action.message, { level: action.level });
          }
          break;
        case 'message':
          if (action.startConversation) {
            ensureConversationStarted();
          }
          if (action.text) {
            dom.appendMessage(action.role, action.text);
          }
          break;
        case 'plan':
          if (action.startConversation) {
            ensureConversationStarted();
          }
          dom.updatePlan(action.steps);
          break;
        case 'event':
          if (action.startConversation) {
            ensureConversationStarted();
          }
          dom.appendEvent(action.eventType, action.payload);
          break;
        case 'command':
          if (action.startConversation) {
            ensureConversationStarted();
          }
          dom.appendCommand(action.payload);
          break;
        default:
          break;
      }
    }
  };

  const handleAgentPayload = (payload: AgentIncomingPayload): void => {
    if (destroyed) {
      return;
    }
    const actions = router.route(payload);
    applyRouteActions(actions);
  };

  const handleSocketStatus = (status: ChatSocketStatusUpdate): void => {
    if (destroyed) {
      return;
    }
    dom.setThinking(false);
    dom.setStatus(status.message, { level: status.level });
  };

  let inputController: ChatInputController | null = null;

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
      if (pending.length > 0 && !socketConnected) {
        dom.setStatus('Waiting for the agent runtime connection...');
        socketManager?.connect();
      }
    },
  });

  socketManager = createChatSocketManager({
    windowRef,
    reconnectDelay,
    parsePayload: parseAgentPayload,
    onStatus: handleSocketStatus,
    onPayload: handleAgentPayload,
    onConnectionChange(connected) {
      socketConnected = connected;
      if (!inputController) {
        return;
      }
      if (connected) {
        dom.setThinking(false);
        inputController.flushPending();
      }
    },
  });

  inputController.registerSender((message) => socketManager?.sendPrompt(message) ?? false);

  dom.setStatus('');
  updatePanelState();

  return {
    connect(): void {
      socketManager?.connect();
    },
    dispose(): void {
      destroyed = true;
      dom.dispose();
      socketManager?.dispose();
      socketManager = null;
      inputController?.dispose();
      inputController = null;
    },
  };
}
