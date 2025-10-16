import type { ChatDomController } from './chat_domController.js';
import type { ChatInputController } from './chat_inputController.js';
import type { ChatLifecycle, ChatLifecycleEvent } from './chat_lifecycle.js';
import type { AgentIncomingPayload, ChatRouteAction } from './chat_router.js';

export interface ChatSessionState {
  isDestroyed(): boolean;
  hasConversation(): boolean;
  isSocketConnected(): boolean;
  markDestroyed(): void;
  startConversation(): boolean;
  setSocketConnected(connected: boolean): void;
}

export function createChatSessionState(): ChatSessionState {
  let destroyed = false;
  let conversationStarted = false;
  let socketConnected = false;

  return {
    isDestroyed() {
      return destroyed;
    },
    hasConversation() {
      return conversationStarted;
    },
    isSocketConnected() {
      return socketConnected;
    },
    markDestroyed() {
      destroyed = true;
    },
    startConversation() {
      if (conversationStarted) {
        return false;
      }
      conversationStarted = true;
      return true;
    },
    setSocketConnected(connected) {
      socketConnected = connected;
    },
  };
}

export interface ChatSessionControllerOptions {
  dom: ChatDomController;
  input: ChatInputController;
  lifecycle: Pick<ChatLifecycle, 'connect' | 'isConnected'>;
  routePayload: (payload: AgentIncomingPayload) => ChatRouteAction[];
  runActions: (actions: ChatRouteAction[]) => void;
  state?: ChatSessionState;
}

export interface ChatSessionApi {
  readonly state: ChatSessionState;
  initialize(): void;
  handleUserMessage(message: string): boolean;
  handleQueueUpdate(pending: readonly string[]): void;
  handleLifecycleEvent(event: ChatLifecycleEvent): void;
  dispose(): void;
}

export function createChatSessionController({
  dom,
  input,
  lifecycle,
  routePayload,
  runActions,
  state = createChatSessionState(),
}: ChatSessionControllerOptions): ChatSessionApi {
  const sessionState = state;

  const ensureConversationStarted = (): void => {
    if (!sessionState.startConversation()) {
      return;
    }
    dom.ensureConversationStarted();
    dom.updatePanelState(true);
  };

  const processActions = (actions: ChatRouteAction[]): void => {
    if (actions.length === 0) {
      return;
    }
    runActions(actions);
    dom.updatePanelState(sessionState.hasConversation());
  };

  return {
    state: sessionState,
    initialize() {
      sessionState.setSocketConnected(lifecycle.isConnected());
      dom.setStatus('');
      dom.updatePanelState(sessionState.hasConversation());
    },
    handleUserMessage(message) {
      if (sessionState.isDestroyed()) {
        return false;
      }
      ensureConversationStarted();
      dom.appendMessage('user', message);
      return true;
    },
    handleQueueUpdate(pending) {
      if (sessionState.isDestroyed()) {
        return;
      }
      if (pending.length > 0 && !sessionState.isSocketConnected()) {
        dom.setStatus('Waiting for the agent runtime connection...');
        lifecycle.connect();
      }
    },
    handleLifecycleEvent(event) {
      if (sessionState.isDestroyed()) {
        return;
      }

      switch (event.type) {
        case 'status':
          dom.setThinking(false);
          dom.setStatus(event.status.message, { level: event.status.level });
          break;
        case 'payload':
          processActions(routePayload(event.payload));
          break;
        case 'connection':
          sessionState.setSocketConnected(event.connected);
          if (event.connected) {
            dom.setThinking(false);
            input.flushPending();
          }
          break;
        default:
          break;
      }
    },
    dispose() {
      sessionState.markDestroyed();
    },
  };
}
