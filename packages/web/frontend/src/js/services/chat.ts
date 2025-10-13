import { createMarkdownDisplay, type MarkdownDisplayApi } from '../components/markdown_display.js';
import { createPlanDisplay, type PlanStep } from '../components/plan_display.js';
import {
  isApprovalNotification,
  isApprovalText,
  normalisePreview,
  normaliseText,
  type AgentCommandPayload,
  type AgentEventPayload,
  type AgentMessagePayload,
  type AgentRole,
} from './chat_model.js';
import { createHighlightedCodeBlock } from './chat_highlight.js';
import { addListener, autoResize } from './chat_dom.js';

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

  function ensureConversationStarted(): void {
    if (hasConversation) {
      return;
    }
    hasConversation = true;
    panelRef.classList.toggle('agent-panel--empty', false);
    if (startContainer) {
      startContainer.classList.toggle('hidden', true);
    }
    if (chatContainer) {
      chatContainer.classList.toggle('hidden', false);
    }
    if (chatInput) {
      windowRef.requestAnimationFrame(() => {
        chatInput.focus();
        autoResize(chatInput);
      });
    }
  }

  function ensureThinkingMessage(): void {
    if (!messageList || thinkingMessage) {
      return;
    }

    ensureConversationStarted();

    const wrapper = documentRef.createElement('div');
    wrapper.className = 'agent-message agent-message--agent agent-message--thinking';

    const bubble = documentRef.createElement('div');
    bubble.className = 'agent-message-bubble agent-message-bubble--thinking';
    bubble.setAttribute('aria-live', 'polite');

    const indicator = documentRef.createElement('div');
    indicator.className = 'agent-thinking-indicator';

    const text = documentRef.createElement('span');
    text.className = 'agent-thinking-text';
    text.textContent = 'Preparing response';
    indicator.appendChild(text);

    const dots = documentRef.createElement('span');
    dots.className = 'agent-thinking-dots';
    for (let index = 0; index < 3; index += 1) {
      const dot = documentRef.createElement('span');
      dot.className = 'agent-thinking-dot';
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
    if (!messageList || !text) {
      return;
    }

    ensureConversationStarted();

    const wrapper = documentRef.createElement('div');
    wrapper.className = `agent-message agent-message--${role}`;

    const bubble = documentRef.createElement('div');
    bubble.className = 'agent-message-bubble';

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

    wrapper.appendChild(bubble);
    messageList.appendChild(wrapper);

    scrollToLatest();
  }

  // Normalise event payload text once so downstream display logic stays consistent.
  interface NormalisedEventFields {
    text: string;
    title: string;
    subtitle: string;
    description: string;
    details: string;
    scope: string;
  }

  function normaliseEventFields(payload: AgentEventPayload = {}): NormalisedEventFields {
    return {
      text: normaliseText(payload.text).trim(),
      title: normaliseText(payload.title).trim(),
      subtitle: normaliseText(payload.subtitle).trim(),
      description: normaliseText(payload.description).trim(),
      details: normaliseText(payload.details).trim(),
      scope: normaliseText(payload.metadata?.scope).trim(),
    };
  }

  // Compute the header/body that should be rendered for an event while keeping
  // the legacy fallbacks that ensure banners and status updates stay readable.
  function resolveEventDisplay(
    eventType: string,
    fields: NormalisedEventFields,
  ): { header: string; body: string } | null {
    if (eventType === 'request-input') {
      return null;
    }

    const detailFallback = fields.subtitle || fields.description || fields.details || '';

    const resolveOrFallback = (
      header: string,
      body: string,
    ): { header: string; body: string } | null => {
      const resolvedHeader = header;
      let resolvedBody = body;

      if (!resolvedHeader && !resolvedBody && fields.text) {
        resolvedBody = fields.text;
      }

      if (!resolvedHeader && !resolvedBody) {
        return null;
      }

      return { header: resolvedHeader, body: resolvedBody };
    };

    switch (eventType) {
      case 'banner': {
        const header = fields.title || fields.text || 'Agent banner';
        let body = detailFallback;
        if (!body && fields.text && fields.text !== header) {
          body = fields.text;
        }
        return resolveOrFallback(header, body);
      }
      case 'status': {
        const header = fields.title || 'Status update';
        const body = detailFallback || fields.text;
        return resolveOrFallback(header, body);
      }
      default: {
        const header = fields.title || fields.text;
        const body = detailFallback || fields.text;
        return resolveOrFallback(header, body);
      }
    }
  }

  // Small helper so we only create DOM nodes for visible, non-approval text blocks.
  const appendTextBlock = (container: HTMLElement, className: string, content: string): void => {
    if (!content || isApprovalText(content)) {
      return;
    }
    const element = documentRef.createElement('div');
    element.className = className;
    element.textContent = content;
    container.appendChild(element);
  };

  function appendEvent(eventType: string, payload: AgentEventPayload = {}): void {
    if (!messageList) {
      return;
    }

    if (isApprovalNotification(payload)) {
      return;
    }

    const fields = normaliseEventFields(payload);
    const display = resolveEventDisplay(eventType, fields);

    if (!display) {
      return;
    }

    ensureConversationStarted();

    const wrapper = documentRef.createElement('div');
    wrapper.className = 'agent-message agent-message--event';
    if (eventType) {
      wrapper.dataset.eventType = eventType;
    }
    if (payload.level) {
      wrapper.dataset.level = payload.level;
    }

    const bubble = documentRef.createElement('div');
    bubble.className = 'agent-message-bubble agent-message-bubble--event';

    appendTextBlock(bubble, 'agent-event-title', display.header);
    if (display.body && (!display.header || display.body !== display.header)) {
      appendTextBlock(bubble, 'agent-event-body', display.body);
    }

    if (fields.scope) {
      const meta = documentRef.createElement('div');
      meta.className = 'agent-event-meta';
      const scope = documentRef.createElement('span');
      scope.className = 'agent-event-meta-tag';
      scope.textContent = `Scope: ${fields.scope}`;
      meta.appendChild(scope);
      bubble.appendChild(meta);
    }

    wrapper.appendChild(bubble);
    messageList.appendChild(wrapper);

    scrollToLatest();
  }

  function appendCommand(payload?: AgentCommandPayload | null): void {
    if (!messageList) {
      return;
    }

    const command = payload?.command ?? null;
    const runText = normaliseText(command?.run);
    const description = normaliseText(command?.description).trim();
    const shellText = normaliseText(command?.shell).trim();
    const preview = normalisePreview(command?.preview);
    const workingDirectory = normaliseText(command?.workingDirectory).trim();

    ensureConversationStarted();

    const wrapper = documentRef.createElement('div');
    wrapper.className = 'agent-message agent-message--command';

    const bubble = documentRef.createElement('div');
    bubble.className = 'agent-message-bubble agent-message-bubble--command';

    const header = documentRef.createElement('div');
    header.className = 'agent-command-header';

    const commandLabel = documentRef.createElement('div');
    commandLabel.className = 'agent-command-label';
    commandLabel.textContent = description || 'Command preview';
    header.appendChild(commandLabel);

    if (workingDirectory) {
      const directory = documentRef.createElement('div');
      directory.className = 'agent-command-directory';
      directory.textContent = `Working directory: ${workingDirectory}`;
      header.appendChild(directory);
    }

    bubble.appendChild(header);

    if (runText) {
      const runBlock = createHighlightedCodeBlock(runText, {
        language: shellText || 'bash',
        classNames: ['agent-command-run'],
      });
      if (runBlock) {
        bubble.appendChild(runBlock);
      }
    }

    if (preview.code.trim().length > 0) {
      const previewBlock = createHighlightedCodeBlock(preview.code, {
        language: preview.language,
        classNames: preview.classNames,
      });
      if (previewBlock) {
        previewBlock.classList.add('agent-command-preview');
        bubble.appendChild(previewBlock);
      }
    }

    wrapper.appendChild(bubble);
    messageList.appendChild(wrapper);
    scrollToLatest();
  }

  function updatePanelState(): void {
    const active = hasConversation;
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
      if (!promptText || promptText === '▷' || isApprovalText(promptText)) {
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
    if (socket && event.currentTarget && socket !== event.currentTarget) {
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
    if (socket && event.currentTarget && socket !== event.currentTarget) {
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
    if (socket && event.currentTarget && socket !== event.currentTarget) {
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
