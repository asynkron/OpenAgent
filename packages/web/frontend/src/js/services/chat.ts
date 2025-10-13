import type { PlanStep } from '../components/plan_display.js';
import {
  isApprovalNotification,
  normaliseText,
  type AgentCommandPayload,
  type AgentEventPayload,
  type AgentMessagePayload,
} from './chat_model.js';
import { addListener, autoResize } from './chat_dom.js';
import {
  createChatDomController,
  shouldAppendStatusMessage,
  type ChatDomController,
  type ChatInputElement,
} from './chat_domController.js';

type CleanupFn = () => void;

type OptionalElement<T extends Element> = T | null | undefined;

const AGENT_PAYLOAD_TYPES = [
  'agent_message',
  'agent_status',
  'agent_error',
  'agent_thinking',
  'agent_request_input',
  'agent_plan',
  'agent_event',
  'agent_command',
] as const;

type AgentPayloadType = (typeof AGENT_PAYLOAD_TYPES)[number];

type AgentIncomingPayload =
  | (AgentMessagePayload & { type: 'agent_message' })
  | (AgentMessagePayload & { type: 'agent_status' })
  | (AgentMessagePayload & { type: 'agent_error' })
  | (AgentMessagePayload & { type: 'agent_thinking'; state?: 'start' | 'stop' })
  | (AgentMessagePayload & { type: 'agent_request_input' })
  | (AgentMessagePayload & { type: 'agent_plan' })
  | (AgentEventPayload & { type: 'agent_event' })
  | (AgentCommandPayload & { type: 'agent_command' });

type AgentPayloadByType = {
  [Type in AgentPayloadType]: Extract<AgentIncomingPayload, { type: Type }>;
};

const AGENT_PAYLOAD_TYPE_SET = new Set<string>(AGENT_PAYLOAD_TYPES);

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

function isAgentPayloadType(value: string): value is AgentPayloadType {
  return AGENT_PAYLOAD_TYPE_SET.has(value);
}

function parseAgentPayload(data: unknown): AgentIncomingPayload | null {
  if (!data || typeof data !== 'object') {
    return null;
  }

  const payload = data as { type?: unknown };
  if (typeof payload.type !== 'string' || !isAgentPayloadType(payload.type)) {
    return null;
  }

  return payload as AgentIncomingPayload;
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
  const cleanupFns: CleanupFn[] = [];
  const pendingMessages: string[] = [];
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

  let socket: WebSocket | null = null;
  let socketCleanup: CleanupFn | null = null;
  let reconnectTimer: number | null = null;
  let destroyed = false;
  let hasConversation = false;
  let isConnected = false;

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

  const flushPending = (): void => {
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      return;
    }
    while (pendingMessages.length > 0) {
      const nextMessage = pendingMessages[0];
      try {
        socket.send(JSON.stringify({ type: 'prompt', prompt: nextMessage }));
        pendingMessages.shift();
      } catch (error) {
        console.warn('Failed to deliver chat message', error);
        scheduleReconnect();
        break;
      }
    }
  };

  const agentPayloadHandlers = {
    agent_message(payload: AgentPayloadByType['agent_message']): void {
      dom.setThinking(false);
      const text = normaliseText(payload.text);
      if (text) {
        ensureConversationStarted();
        dom.appendMessage('agent', text);
      }
    },
    agent_status(payload: AgentPayloadByType['agent_status']): void {
      dom.setThinking(false);
      const text = normaliseText(payload.text);
      if (isApprovalNotification({ ...payload, text } satisfies AgentMessagePayload)) {
        return;
      }
      if (text) {
        dom.setStatus(text, { level: payload.level });
      }
    },
    agent_error(payload: AgentPayloadByType['agent_error']): void {
      dom.setThinking(false);
      const message = normaliseText(payload.message);
      if (message) {
        dom.setStatus(message, { level: 'error' });
        ensureConversationStarted();
        dom.appendMessage('agent', message);
      }
      const details = normaliseText(payload.details).trim();
      if (details && details !== message) {
        ensureConversationStarted();
        dom.appendMessage('agent', details);
      }
    },
    agent_thinking(payload: AgentPayloadByType['agent_thinking']): void {
      dom.setThinking(payload.state === 'start');
    },
    agent_request_input(payload: AgentPayloadByType['agent_request_input']): void {
      dom.setThinking(false);
      const promptText = normaliseText(payload.prompt).trim();
      if (!promptText || promptText === '▷' || !shouldAppendStatusMessage(payload)) {
        dom.setStatus('');
      } else {
        dom.setStatus(promptText);
      }
    },
    agent_plan(payload: AgentPayloadByType['agent_plan']): void {
      ensureConversationStarted();
      const planSteps: PlanStep[] = Array.isArray(payload.plan) ? (payload.plan as PlanStep[]) : [];
      dom.updatePlan(planSteps);
    },
    agent_event(payload: AgentPayloadByType['agent_event']): void {
      ensureConversationStarted();
      const eventType = payload.eventType ?? 'event';
      dom.appendEvent(eventType, payload);
    },
    agent_command(payload: AgentPayloadByType['agent_command']): void {
      dom.setThinking(false);
      ensureConversationStarted();
      dom.appendCommand(payload);
    },
  } satisfies { [Type in AgentPayloadType]: (payload: AgentPayloadByType[Type]) => void };

  function handleAgentPayload<Type extends AgentPayloadType>(
    payload: AgentPayloadByType[Type],
  ): void {
    const handler = agentPayloadHandlers[payload.type] as (payload: AgentPayloadByType[Type]) => void;
    handler(payload);
  }

  const isFromStaleSocket = (event: Event): boolean => {
    const currentTarget = event?.currentTarget ?? null;
    return Boolean(socket && currentTarget && socket !== currentTarget);
  };

  const clearReconnectTimer = (): void => {
    if (reconnectTimer) {
      windowRef.clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
  };

  const scheduleReconnect = (): void => {
    if (reconnectTimer || destroyed) {
      return;
    }
    reconnectTimer = windowRef.setTimeout(() => {
      reconnectTimer = null;
      connect();
    }, reconnectDelay);
  };

  const handleMessage = (event: MessageEvent<string>): void => {
    if (isFromStaleSocket(event)) {
      return;
    }
    if (!event.data) {
      return;
    }

    let payload: AgentIncomingPayload | null = null;
    try {
      const parsed = JSON.parse(event.data);
      payload = parseAgentPayload(parsed);
    } catch (error) {
      console.warn('Failed to parse agent message payload', error);
      return;
    }

    if (!payload) {
      return;
    }

    handleAgentPayload(payload);
  };

  const handleOpen = (event: Event): void => {
    if (isFromStaleSocket(event)) {
      return;
    }
    if (destroyed || !socket || socket.readyState !== WebSocket.OPEN) {
      return;
    }
    isConnected = true;
    dom.setThinking(false);
    dom.setStatus('Connected to the agent runtime.', { level: 'info' });
    flushPending();
  };

  const handleClose = (event: CloseEvent): void => {
    if (isFromStaleSocket(event)) {
      return;
    }
    if (destroyed) {
      return;
    }
    isConnected = false;
    dom.setThinking(false);
    dom.setStatus('Reconnecting to the agent runtime...', { level: 'warn' });
    scheduleReconnect();
    removeSocketListeners();
    socket = null;
  };

  const handleError = (event: Event): void => {
    if (isFromStaleSocket(event)) {
      return;
    }
    if (!socket) {
      return;
    }
    dom.setThinking(false);
    try {
      socket.close();
    } catch (error) {
      console.warn('Failed to close agent socket after error', error);
    } finally {
      socket = null;
    }
    dom.setStatus('Agent connection encountered an error.', { level: 'error' });
  };

  const removeSocketListeners = (): void => {
    if (socketCleanup) {
      try {
        socketCleanup();
      } catch (error) {
        console.warn('Failed to remove agent socket listeners', error);
      }
      socketCleanup = null;
    }
  };

  const attachSocketListeners = (target: WebSocket): void => {
    const handleMessageListener = (event: Event): void => {
      handleMessage(event as MessageEvent<string>);
    };

    target.addEventListener('open', handleOpen);
    target.addEventListener('message', handleMessageListener);
    target.addEventListener('close', handleClose);
    target.addEventListener('error', handleError);

    socketCleanup = () => {
      target.removeEventListener('open', handleOpen);
      target.removeEventListener('message', handleMessageListener);
      target.removeEventListener('close', handleClose);
      target.removeEventListener('error', handleError);
    };
  };

  const connect = (): void => {
    if (destroyed) {
      return;
    }

    clearReconnectTimer();

    if (
      socket &&
      socket.readyState !== WebSocket.CLOSED &&
      socket.readyState !== WebSocket.CLOSING
    ) {
      removeSocketListeners();
      try {
        socket.close();
      } catch (error) {
        console.warn('Failed to close existing agent socket', error);
      }
    }

    let url: string;
    try {
      const protocol = windowRef.location.protocol === 'https:' ? 'wss' : 'ws';
      url = `${protocol}://${windowRef.location.host}/ws/agent`;
    } catch (error) {
      console.error('Failed to resolve agent websocket URL', error);
      scheduleReconnect();
      return;
    }

    dom.setStatus('Connecting to the agent runtime...');

    const nextSocket = new WebSocket(url);
    socket = nextSocket;

    attachSocketListeners(nextSocket);
  };

  const queueMessage = (text: string): void => {
    if (!text) {
      return;
    }
    pendingMessages.push(text);
    flushPending();
    if (!isConnected) {
      if (!socket || socket.readyState === WebSocket.CLOSED) {
        connect();
      }
      scheduleReconnect();
      dom.setStatus('Waiting for the agent runtime connection...');
    }
  };

  const sendUserMessage = (rawText: string): boolean => {
    if (dom.isThinking()) {
      return false;
    }
    const trimmed = rawText.trim();
    if (!trimmed) {
      return false;
    }

    ensureConversationStarted();
    dom.appendMessage('user', trimmed);
    queueMessage(trimmed);
    return true;
  };

  const dispatchFromInput = (
    input: ChatInputElement | null | undefined,
    { resize = false }: { resize?: boolean } = {},
  ): void => {
    const value = input?.value ?? '';
    if (sendUserMessage(value) && input) {
      input.value = '';
      if (resize) {
        autoResize(input);
      }
    }
  };

  const handleStartSubmit = (event: SubmitEvent): void => {
    event.preventDefault();
    dispatchFromInput(startInput, { resize: false });
  };

  const handleChatSubmit = (event: SubmitEvent): void => {
    event.preventDefault();
    dispatchFromInput(chatInput, { resize: true });
  };

  const handleChatKeydown = (event: KeyboardEvent): void => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      dispatchFromInput(chatInput, { resize: true });
    }
  };

  const handleChatInputChange = (_event: Event): void => {
    if (chatInput) {
      autoResize(chatInput);
    }
  };

  addListener(startForm, 'submit', handleStartSubmit, cleanupFns);
  addListener(chatForm, 'submit', handleChatSubmit, cleanupFns);
  addListener(chatInput, 'keydown', handleChatKeydown, cleanupFns);
  addListener(chatInput, 'input', handleChatInputChange, cleanupFns);

  if (chatInput) {
    autoResize(chatInput);
  }

  dom.setStatus('');
  updatePanelState();

  return {
    connect,
    dispose(): void {
      destroyed = true;
      dom.dispose();
      clearReconnectTimer();
      removeSocketListeners();
      if (socket) {
        try {
          socket.close();
        } catch (error) {
          console.warn('Failed to close agent socket on dispose', error);
        }
        socket = null;
      }
      cleanupFns.splice(0).forEach((cleanup) => {
        try {
          cleanup();
        } catch (error) {
          console.warn('Failed to clean up chat listener', error);
        }
      });
    },
  };
}
