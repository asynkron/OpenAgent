import { createMarkdownDisplay, type MarkdownDisplayApi } from '../components/markdown_display.js';
import { createPlanDisplay, type PlanStep } from '../components/plan_display.js';
import {
  isApprovalNotification,
  normaliseText,
  type AgentCommandPayload,
  type AgentEventPayload,
  type AgentMessagePayload,
  type AgentRole,
} from './chat_model.js';
import { createHighlightedCodeBlock } from './chat_highlight.js';
import { addListener, autoResize } from './chat_dom.js';
import {
  resolveAgentEventDisplay,
  resolveCommandPreview,
  shouldDisplayApprovalText,
} from './chat_eventDisplay.js';

type CleanupFn = () => void;

type ChatInputElement = HTMLTextAreaElement | HTMLInputElement;

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
  const scrollContainer = chatBody ?? messageList ?? null;
  const sendButtons = new Set<HTMLButtonElement>();
  const planDisplay = createPlanDisplay({ container: planContainer ?? null });

  const startButton = startForm?.querySelector<HTMLButtonElement>('button[type="submit"]');
  if (startButton) {
    sendButtons.add(startButton);
  }
  const chatButton = chatForm?.querySelector<HTMLButtonElement>('button[type="submit"]');
  if (chatButton) {
    sendButtons.add(chatButton);
  }

  let socket: WebSocket | null = null;
  let reconnectTimer: number | null = null;
  let destroyed = false;
  let hasConversation = false;
  let isConnected = false;
  let isThinking = false;
  let lastStatus = '';
  let lastStatusLevel = '';
  let thinkingMessage: HTMLElement | null = null;

  function scrollToLatest(): void {
    if (!scrollContainer) {
      return;
    }
    windowRef.requestAnimationFrame(() => {
      scrollContainer.scrollTop = scrollContainer.scrollHeight;
    });
  }

  function updateStatusDisplay(): void {
    if (!statusElement) {
      return;
    }
    statusElement.textContent = lastStatus || '';
    if (isThinking) {
      statusElement.dataset.level = 'info';
      statusElement.dataset.thinking = 'true';
    } else {
      if (lastStatusLevel) {
        statusElement.dataset.level = lastStatusLevel;
      } else {
        delete statusElement.dataset.level;
      }
      statusElement.dataset.thinking = 'false';
    }
  }

  function setStatus(message: string | null | undefined, { level }: { level?: string } = {}): void {
    lastStatus = message ?? '';
    lastStatusLevel = level ?? '';
    if (!isThinking) {
      updateStatusDisplay();
    }
  }

  function setPanelActive(active: boolean): void {
    panelRef.classList.toggle('agent-panel--empty', !active);
    if (startContainer) {
      startContainer.classList.toggle('hidden', active);
    }
    if (chatContainer) {
      chatContainer.classList.toggle('hidden', !active);
    }
    if (active && chatInput) {
      windowRef.requestAnimationFrame(() => {
        chatInput.focus();
        autoResize(chatInput);
      });
    }
  }

  function ensureConversationStarted(): void {
    if (hasConversation) {
      return;
    }
    hasConversation = true;
    setPanelActive(true);
  }

  const createElement = <K extends keyof HTMLElementTagNameMap>(
    tagName: K,
    className: string,
    text?: string,
  ): HTMLElementTagNameMap[K] => {
    const element = documentRef.createElement(tagName);
    element.className = className;
    if (text) {
      element.textContent = text;
    }
    return element;
  };

  function ensureThinkingMessage(): void {
    if (!messageList || thinkingMessage) {
      return;
    }

    ensureConversationStarted();

    const wrapper = createElement(
      'div',
      'agent-message agent-message--agent agent-message--thinking',
    );

    const bubble = createElement('div', 'agent-message-bubble agent-message-bubble--thinking');
    bubble.setAttribute('aria-live', 'polite');

    const indicator = createElement('div', 'agent-thinking-indicator');

    const text = createElement('span', 'agent-thinking-text', 'Preparing response');
    indicator.appendChild(text);

    const dots = createElement('span', 'agent-thinking-dots');
    for (let index = 0; index < 3; index += 1) {
      const dot = createElement('span', 'agent-thinking-dot');
      dots.appendChild(dot);
    }
    indicator.appendChild(dots);

    bubble.appendChild(indicator);
    wrapper.appendChild(bubble);
    messageList.appendChild(wrapper);

    thinkingMessage = wrapper;
    scrollToLatest();
  }

  function removeThinkingMessage(): void {
    if (thinkingMessage?.parentElement) {
      thinkingMessage.parentElement.removeChild(thinkingMessage);
    }
    thinkingMessage = null;
  }

  function updateThinkingState(active: boolean): void {
    if (active) {
      ensureThinkingMessage();
    } else {
      removeThinkingMessage();
    }
    if (isThinking === active) {
      return;
    }
    isThinking = active;
    for (const button of sendButtons) {
      button.disabled = active;
    }
    updateStatusDisplay();
  }

  function clearReconnectTimer(): void {
    if (reconnectTimer) {
      windowRef.clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
  }

  function scheduleReconnect(): void {
    if (reconnectTimer || destroyed) {
      return;
    }
    reconnectTimer = windowRef.setTimeout(() => {
      reconnectTimer = null;
      connect();
    }, reconnectDelay);
  }

  // Ignore events emitted by stale WebSocket instances so reconnect flows only
  // react to the live socket created by `connect()`.
  const isFromStaleSocket = (event: Event): boolean => {
    const currentTarget = event?.currentTarget ?? null;
    return Boolean(socket && currentTarget && socket !== currentTarget);
  };

  function flushPending(): void {
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
  }

  function appendMessage(role: AgentRole, text: string): void {
    if (!text) {
      return;
    }

    const { wrapper, bubble } = createMessageContainer(
      `agent-message agent-message--${role}`,
      'agent-message-bubble',
    );

    if (role === 'agent') {
      const markdownDisplay: MarkdownDisplayApi = createMarkdownDisplay({
        content: bubble,
        getCurrentFile: () => null,
        setCurrentContent: () => {
          /* noop */
        },
        buildQuery: () => '',
      });
      markdownDisplay.render(text, { updateCurrent: false });
    } else {
      bubble.textContent = text;
    }

    appendMessageWrapper(wrapper);
  }

  // Small helper so we only create DOM nodes for visible, non-approval text blocks.
  const appendTextBlock = (container: HTMLElement, className: string, content: string): void => {
    if (!content || !shouldDisplayApprovalText(content)) {
      return;
    }
    container.appendChild(createElement('div', className, content));
  };

  const appendMetaTag = (container: HTMLElement, label: string, value: string): void => {
    if (!value) {
      return;
    }
    const meta = createElement('div', 'agent-event-meta');
    const tag = createElement('span', 'agent-event-meta-tag', `${label}: ${value}`);
    meta.appendChild(tag);
    container.appendChild(meta);
  };

  const appendHighlightedBlock = (
    container: HTMLElement,
    code: string,
    {
      language,
      classNames = [],
      extraClasses = [],
    }: { language: string; classNames?: string[]; extraClasses?: string[] },
  ): void => {
    const trimmed = code.trim();
    if (!trimmed) {
      return;
    }
    const block = createHighlightedCodeBlock(trimmed, { language, classNames });
    if (!block) {
      return;
    }
    for (const className of extraClasses) {
      block.classList.add(className);
    }
    container.appendChild(block);
  };

  const createMessageContainer = (
    wrapperClass: string,
    bubbleClass: string,
  ): { wrapper: HTMLElement; bubble: HTMLElement } => {
    const wrapper = documentRef.createElement('div');
    wrapper.className = wrapperClass;

    const bubble = documentRef.createElement('div');
    bubble.className = bubbleClass;
    wrapper.appendChild(bubble);

    return { wrapper, bubble };
  };

  const appendMessageWrapper = (wrapper: HTMLElement): void => {
    if (!messageList) {
      return;
    }

    ensureConversationStarted();
    messageList.appendChild(wrapper);
    scrollToLatest();
  };

  function appendEvent(eventType: string, payload: AgentEventPayload = {}): void {
    const resolved = resolveAgentEventDisplay(eventType, payload);
    if (!resolved) {
      return;
    }

    const { display, level, scope } = resolved;

    const { wrapper, bubble } = createMessageContainer(
      'agent-message agent-message--event',
      'agent-message-bubble agent-message-bubble--event',
    );
    if (eventType) {
      wrapper.dataset.eventType = eventType;
    }
    if (level) {
      wrapper.dataset.level = level;
    }

    appendTextBlock(bubble, 'agent-event-title', display.header);
    if (display.body && (!display.header || display.body !== display.header)) {
      appendTextBlock(bubble, 'agent-event-body', display.body);
    }

    appendMetaTag(bubble, 'Scope', scope);

    appendMessageWrapper(wrapper);
  }

  function appendCommand(payload?: AgentCommandPayload | null): void {
    if (!messageList) {
      return;
    }

    const command = payload?.command ?? null;
    const runText = normaliseText(command?.run);
    const description = normaliseText(command?.description).trim();
    const shellText = normaliseText(command?.shell).trim();
    const preview = resolveCommandPreview(command?.preview);
    const workingDirectory = normaliseText(command?.workingDirectory).trim();

    const { wrapper, bubble } = createMessageContainer(
      'agent-message agent-message--command',
      'agent-message-bubble agent-message-bubble--command',
    );

    const header = createElement('div', 'agent-command-header');

    const commandLabel = createElement(
      'div',
      'agent-command-label',
      description || 'Command preview',
    );
    header.appendChild(commandLabel);

    if (workingDirectory) {
      header.appendChild(
        createElement('div', 'agent-command-directory', `Working directory: ${workingDirectory}`),
      );
    }

    bubble.appendChild(header);

    appendHighlightedBlock(bubble, runText, {
      language: shellText || 'bash',
      classNames: ['agent-command-run'],
    });

    appendHighlightedBlock(bubble, preview.code, {
      language: preview.language,
      classNames: preview.classNames,
      extraClasses: ['agent-command-preview'],
    });

    appendMessageWrapper(wrapper);
  }

  function updatePanelState(): void {
    setPanelActive(hasConversation);
  }

  /**
   * Map each agent payload type to a dedicated handler so we benefit from
   * TypeScript's discriminated unions without resorting to runtime `switch`
   * statements.
   */
  const agentPayloadHandlers = {
    agent_message(payload: AgentPayloadByType['agent_message']): void {
      updateThinkingState(false);
      const text = normaliseText(payload.text);
      if (text) {
        appendMessage('agent', text);
      }
    },
    agent_status(payload: AgentPayloadByType['agent_status']): void {
      updateThinkingState(false);
      const text = normaliseText(payload.text);
      if (isApprovalNotification({ ...payload, text } satisfies AgentMessagePayload)) {
        return;
      }
      if (text) {
        setStatus(text, { level: payload.level });
      }
    },
    agent_error(payload: AgentPayloadByType['agent_error']): void {
      updateThinkingState(false);
      const message = normaliseText(payload.message);
      if (message) {
        setStatus(message, { level: 'error' });
        appendMessage('agent', message);
      }
      const details = normaliseText(payload.details).trim();
      if (details && details !== message) {
        appendMessage('agent', details);
      }
    },
    agent_thinking(payload: AgentPayloadByType['agent_thinking']): void {
      updateThinkingState(payload.state === 'start');
    },
    agent_request_input(payload: AgentPayloadByType['agent_request_input']): void {
      updateThinkingState(false);
      const promptText = normaliseText(payload.prompt).trim();
      if (!promptText || promptText === '▷' || !shouldDisplayApprovalText(promptText)) {
        setStatus('');
      } else {
        setStatus(promptText);
      }
    },
    agent_plan(payload: AgentPayloadByType['agent_plan']): void {
      ensureConversationStarted();
      const planSteps: PlanStep[] = Array.isArray(payload.plan) ? (payload.plan as PlanStep[]) : [];
      planDisplay?.update(planSteps);
    },
    agent_event(payload: AgentPayloadByType['agent_event']): void {
      const eventType = payload.eventType ?? 'event';
      appendEvent(eventType, payload);
    },
    agent_command(payload: AgentPayloadByType['agent_command']): void {
      updateThinkingState(false);
      appendCommand(payload);
    },
  } satisfies { [Type in AgentPayloadType]: (payload: AgentPayloadByType[Type]) => void };

  function handleAgentPayload<Type extends AgentPayloadType>(
    payload: AgentPayloadByType[Type],
  ): void {
    // Narrow the handler to the precise payload type. TypeScript cannot track the
    // discriminant across the lookup, so we help it with a one-off assertion.
    const handler = agentPayloadHandlers[payload.type] as (
      payload: AgentPayloadByType[Type],
    ) => void;
    handler(payload);
  }

  function handleIncoming(event: MessageEvent<string>): void {
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
  }

  function handleOpen(event: Event): void {
    if (isFromStaleSocket(event)) {
      return;
    }
    if (destroyed || !socket || socket.readyState !== WebSocket.OPEN) {
      return;
    }
    isConnected = true;
    updateThinkingState(false);
    setStatus('Connected to the agent runtime.', { level: 'info' });
    flushPending();
  }

  function handleClose(event: CloseEvent): void {
    if (isFromStaleSocket(event)) {
      return;
    }
    if (destroyed) {
      return;
    }
    isConnected = false;
    updateThinkingState(false);
    setStatus('Reconnecting to the agent runtime...', { level: 'warn' });
    scheduleReconnect();
  }

  function handleError(event: Event): void {
    if (isFromStaleSocket(event)) {
      return;
    }
    if (!socket) {
      return;
    }
    updateThinkingState(false);
    try {
      socket.close();
    } catch (error) {
      console.warn('Failed to close agent socket after error', error);
    }
    setStatus('Agent connection encountered an error.', { level: 'error' });
  }

  function connect(): void {
    if (destroyed) {
      return;
    }

    clearReconnectTimer();

    if (
      socket &&
      socket.readyState !== WebSocket.CLOSED &&
      socket.readyState !== WebSocket.CLOSING
    ) {
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

    setStatus('Connecting to the agent runtime...');

    const nextSocket = new WebSocket(url);
    socket = nextSocket;

    nextSocket.addEventListener('open', handleOpen);
    nextSocket.addEventListener('message', handleIncoming as EventListener);
    nextSocket.addEventListener('close', handleClose);
    nextSocket.addEventListener('error', handleError);
  }

  function queueMessage(text: string): void {
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
      setStatus('Waiting for the agent runtime connection...');
    }
  }

  function sendUserMessage(rawText: string): boolean {
    if (isThinking) {
      return false;
    }
    const trimmed = rawText.trim();
    if (!trimmed) {
      return false;
    }

    appendMessage('user', trimmed);
    queueMessage(trimmed);
    return true;
  }

  function dispatchFromInput(
    input: ChatInputElement | null | undefined,
    { resize = false }: { resize?: boolean } = {},
  ): void {
    const value = input?.value ?? '';
    if (sendUserMessage(value) && input) {
      input.value = '';
      if (resize) {
        autoResize(input);
      }
    }
  }

  function handleStartSubmit(event: SubmitEvent): void {
    event.preventDefault();
    dispatchFromInput(startInput);
  }

  function handleChatSubmit(event: SubmitEvent): void {
    event.preventDefault();
    dispatchFromInput(chatInput, { resize: true });
  }

  function handleChatKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      dispatchFromInput(chatInput, { resize: true });
    }
  }

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

  updateStatusDisplay();
  updatePanelState();

  return {
    connect,
    dispose(): void {
      destroyed = true;
      planDisplay?.reset?.();
      clearReconnectTimer();
      updateThinkingState(false);
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
