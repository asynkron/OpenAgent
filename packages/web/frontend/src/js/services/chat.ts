import hljs from 'highlight.js';
import { marked } from 'marked';
import type { MarkedOptions } from 'marked';
import { createMarkdownDisplay, type MarkdownDisplayApi } from '../components/markdown_display.js';
import { createPlanDisplay, type PlanStep } from '../components/plan_display.js';
import {
  isApprovalNotification,
  isApprovalText,
  normaliseClassList,
  normalisePreview,
  normaliseText,
  type AgentCommandPayload,
  type AgentEventPayload,
  type AgentMessagePayload,
  type AgentRole,
} from './chat_model.js';

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

const AGENT_PAYLOAD_TYPE_SET = new Set<string>(AGENT_PAYLOAD_TYPES);

type ListenerTarget = EventTarget & {
  addEventListener(type: string, listener: EventListener, options?: boolean | AddEventListenerOptions): void;
  removeEventListener(
    type: string,
    listener: EventListener,
    options?: boolean | EventListenerOptions,
  ): void;
};

type ListenerMap = HTMLElementEventMap;

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

function createHighlightedCodeBlock(
  text: string | null | undefined,
  {
    language = '',
    classNames = [],
  }: { language?: string | null; classNames?: ReadonlyArray<string> | string } = {},
): HTMLPreElement | null {
  const content = text ?? '';
  if (content.length === 0) {
    return null;
  }

  const blockClasses = normaliseClassList(classNames);
  const safeLanguage = (language ?? '').trim();

  try {
    const markdown = `\`\`\`${safeLanguage}\n${content}\n\`\`\``;
    const options = {
      gfm: true,
      highlight(code: string, infoString?: string): string {
        const requestedLanguage = safeLanguage || (infoString || '').trim();
        try {
          if (requestedLanguage && hljs.getLanguage(requestedLanguage)) {
            return hljs.highlight(code, { language: requestedLanguage }).value;
          }
          return hljs.highlightAuto(code).value;
        } catch (error) {
          console.warn('Failed to highlight command preview snippet', error);
          return code;
        }
      },
    };
    const parsed = marked.parse(markdown, options as unknown as MarkedOptions);

    if (typeof parsed === 'string') {
      const template = document.createElement('template');
      template.innerHTML = parsed.trim();
      const pre = template.content.querySelector('pre');
      const codeElement = pre ? pre.querySelector('code') : null;
      if (pre && codeElement) {
        blockClasses.forEach((className) => pre.classList.add(className));
        if (safeLanguage) {
          codeElement.classList.add(`language-${safeLanguage}`);
        }
        if (!codeElement.classList.contains('hljs')) {
          codeElement.classList.add('hljs');
        }
        return pre;
      }
    }
  } catch (error) {
    console.warn('Failed to render command preview with marked', error);
  }

  const pre = document.createElement('pre');
  blockClasses.forEach((className) => pre.classList.add(className));

  const codeElement = document.createElement('code');

  try {
    const requestedLanguage = safeLanguage && hljs.getLanguage(safeLanguage) ? safeLanguage : '';
    if (requestedLanguage) {
      codeElement.innerHTML = hljs.highlight(content, { language: requestedLanguage }).value;
    } else {
      codeElement.innerHTML = hljs.highlightAuto(content).value;
    }
    codeElement.classList.add('hljs');
    if (requestedLanguage) {
      codeElement.classList.add(`language-${requestedLanguage}`);
    }
  } catch (error) {
    console.warn('Failed to highlight command preview fallback', error);
    codeElement.textContent = content;
    if (safeLanguage) {
      codeElement.classList.add(`language-${safeLanguage}`);
    }
  }

  pre.appendChild(codeElement);
  return pre;
}

function autoResize(textarea: OptionalElement<ChatInputElement>): void {
  if (!textarea) {
    return;
  }
  textarea.style.height = 'auto';
  const maxHeight = 220;
  textarea.style.height = `${Math.min(textarea.scrollHeight, maxHeight)}px`;
}

function addListener<Type extends keyof ListenerMap, Target extends ListenerTarget>(
  target: Target | null | undefined,
  type: Type,
  handler: (event: ListenerMap[Type]) => void,
  cleanupFns: CleanupFn[],
): void {
  if (!target) {
    return;
  }
  target.addEventListener(type, handler as EventListener);
  cleanupFns.push(() => target.removeEventListener(type, handler as EventListener));
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
  const sendButtons: HTMLButtonElement[] = [];
  const planDisplay = createPlanDisplay({ container: planContainer ?? null });

  const startButton = startForm?.querySelector<HTMLButtonElement>('button[type="submit"]');
  if (startButton && !sendButtons.includes(startButton)) {
    sendButtons.push(startButton);
  }
  const chatButton = chatForm?.querySelector<HTMLButtonElement>('button[type="submit"]');
  if (chatButton && !sendButtons.includes(chatButton)) {
    sendButtons.push(chatButton);
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

  function updateThinkingState(next: unknown): void {
    const active = Boolean(next);
    if (active) {
      ensureThinkingMessage();
    } else {
      removeThinkingMessage();
    }
    if (isThinking === active) {
      return;
    }
    isThinking = active;
    sendButtons.forEach((button) => {
      button.disabled = active;
    });
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

  function appendEvent(eventType: string, payload: AgentEventPayload = {}): void {
    if (!messageList) {
      return;
    }

    const text = normaliseText(payload.text).trim();
    const title = normaliseText(payload.title).trim();
    const subtitle = normaliseText(payload.subtitle).trim();
    const description = normaliseText(payload.description).trim();
    const details = normaliseText(payload.details).trim();

    if (
      isApprovalNotification({
        text,
        title,
        subtitle,
        description,
        details,
      })
    ) {
      return;
    }

    if (eventType === 'request-input') {
      return;
    }

    let headerText = title;
    let bodyText = '';

    const fallbackTitles = {
      banner: title || text || 'Agent banner',
      status: title || 'Status update',
      'request-input': title || 'Input requested',
    } as const;

    switch (eventType) {
      case 'banner': {
        headerText = fallbackTitles.banner;
        bodyText = subtitle || description || details || '';
        if (!bodyText && text && text !== headerText) {
          bodyText = text;
        }
        break;
      }
      case 'status':
      case 'request-input': {
        headerText = fallbackTitles[eventType as keyof typeof fallbackTitles] ?? headerText;
        bodyText = subtitle || description || details || text;
        break;
      }
      default: {
        if (!headerText) {
          headerText = title || text;
        }
        bodyText = subtitle || description || details || text;
      }
    }

    if (!headerText && !bodyText && text) {
      bodyText = text;
    }

    if (!headerText && !bodyText) {
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

    if (headerText && !isApprovalText(headerText)) {
      const header = documentRef.createElement('div');
      header.className = 'agent-event-title';
      header.textContent = headerText;
      bubble.appendChild(header);
    }

    if (bodyText && (!headerText || bodyText !== headerText) && !isApprovalText(bodyText)) {
      const body = documentRef.createElement('div');
      body.className = 'agent-event-body';
      body.textContent = bodyText;
      bubble.appendChild(body);
    }

    const scopeText = normaliseText(payload.metadata?.scope).trim();
    if (scopeText) {
      const meta = documentRef.createElement('div');
      meta.className = 'agent-event-meta';
      const scope = documentRef.createElement('span');
      scope.className = 'agent-event-meta-tag';
      scope.textContent = `Scope: ${scopeText}`;
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

    switch (payload.type) {
      case 'agent_message': {
        updateThinkingState(false);
        const text = normaliseText(payload.text);
        if (text) {
          appendMessage('agent', text);
        }
        break;
      }
      case 'agent_status': {
        updateThinkingState(false);
        const text = normaliseText(payload.text);
        const statusPayload = { ...payload, text };
        if (isApprovalNotification(statusPayload)) {
          break;
        }
        if (text) {
          setStatus(text, { level: payload.level });
        }
        break;
      }
      case 'agent_error': {
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
        break;
      }
      case 'agent_thinking': {
        if (payload.state === 'start') {
          updateThinkingState(true);
        } else if (payload.state === 'stop') {
          updateThinkingState(false);
        }
        break;
      }
      case 'agent_request_input': {
        updateThinkingState(false);
        const promptText = normaliseText(payload.prompt).trim();
        if (!promptText || promptText === '▷' || isApprovalText(promptText)) {
          setStatus('');
        } else {
          setStatus(promptText);
        }
        break;
      }
      case 'agent_plan': {
        ensureConversationStarted();
        const planSteps: PlanStep[] = Array.isArray(payload.plan) ? (payload.plan as PlanStep[]) : [];
        planDisplay?.update(planSteps);
        break;
      }
      case 'agent_event': {
        const eventType = payload.eventType ?? 'event';
        appendEvent(eventType, payload);
        break;
      }
      case 'agent_command': {
        updateThinkingState(false);
        appendCommand(payload);
        break;
      }
      default: {
        console.warn('Received unsupported agent payload', payload);
        break;
      }
    }
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
