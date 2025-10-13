import { createMarkdownDisplay, type MarkdownDisplayApi } from '../components/markdown_display.js';
import { createPlanDisplay, type PlanStep } from '../components/plan_display.js';
import {
  normaliseText,
  type AgentCommandPayload,
  type AgentEventPayload,
  type AgentMessagePayload,
  type AgentRole,
} from './chat_model.js';
import { createHighlightedCodeBlock } from './chat_highlight.js';
import {
  resolveAgentEventDisplay,
  resolveCommandPreview,
  shouldDisplayApprovalText,
} from './chat_eventDisplay.js';

export type ChatInputElement = HTMLTextAreaElement | HTMLInputElement;

export interface ChatDomControllerOptions {
  panel: HTMLElement;
  startContainer?: HTMLElement | null;
  chatContainer?: HTMLElement | null;
  chatBody?: HTMLElement | null;
  messageList?: HTMLElement | null;
  chatInput?: ChatInputElement | null;
  planContainer?: HTMLElement | null;
  statusElement?: HTMLElement | null;
  windowRef: Window & typeof globalThis;
  documentRef: Document;
  sendButtons: Set<HTMLButtonElement>;
  autoResizeInput?: (input: ChatInputElement) => void;
}

export interface ChatDomController {
  appendMessage(role: AgentRole, text: string): void;
  appendEvent(eventType: string, payload: AgentEventPayload): void;
  appendCommand(payload?: AgentCommandPayload | null): void;
  setStatus(message: string | null | undefined, options?: { level?: string }): void;
  setThinking(active: boolean): void;
  ensureConversationStarted(): void;
  updatePanelState(active: boolean): void;
  updatePlan(steps: PlanStep[]): void;
  isThinking(): boolean;
  dispose(): void;
}

function createElement<T extends keyof HTMLElementTagNameMap>(
  documentRef: Document,
  tagName: T,
  className: string,
  text?: string,
): HTMLElementTagNameMap[T] {
  const element = documentRef.createElement(tagName);
  element.className = className;
  if (text) {
    element.textContent = text;
  }
  return element;
}

export function createChatDomController({
  panel,
  startContainer,
  chatContainer,
  chatBody,
  messageList,
  chatInput,
  planContainer,
  statusElement,
  windowRef,
  documentRef,
  sendButtons,
  autoResizeInput,
}: ChatDomControllerOptions): ChatDomController {
  const scrollContainer = chatBody ?? messageList ?? null;
  const planDisplay = createPlanDisplay({ container: planContainer ?? null });

  let thinkingMessage: HTMLElement | null = null;
  let isThinking = false;
  let lastStatus = '';
  let lastStatusLevel = '';

  const ensureButtons = (disabled: boolean): void => {
    for (const button of sendButtons) {
      button.disabled = disabled;
    }
  };

  const scrollToLatest = (): void => {
    if (!scrollContainer) {
      return;
    }
    windowRef.requestAnimationFrame(() => {
      scrollContainer.scrollTop = scrollContainer.scrollHeight;
    });
  };

  const updateStatusDisplay = (): void => {
    if (!statusElement) {
      return;
    }
    statusElement.textContent = lastStatus;
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
  };

  const setPanelActive = (active: boolean): void => {
    panel.classList.toggle('agent-panel--empty', !active);
    if (startContainer) {
      startContainer.classList.toggle('hidden', active);
    }
    if (chatContainer) {
      chatContainer.classList.toggle('hidden', !active);
    }
    if (active && chatInput) {
      windowRef.requestAnimationFrame(() => {
        chatInput.focus();
        autoResizeInput?.(chatInput);
      });
    }
  };

  const ensureThinkingMessage = (): void => {
    if (!messageList || thinkingMessage) {
      return;
    }

    const wrapper = createElement(
      documentRef,
      'div',
      'agent-message agent-message--agent agent-message--thinking',
    );

    const bubble = createElement(
      documentRef,
      'div',
      'agent-message-bubble agent-message-bubble--thinking',
    );
    bubble.setAttribute('aria-live', 'polite');

    const indicator = createElement(documentRef, 'div', 'agent-thinking-indicator');
    const text = createElement(documentRef, 'span', 'agent-thinking-text', 'Preparing response');
    indicator.appendChild(text);

    const dots = createElement(documentRef, 'span', 'agent-thinking-dots');
    for (let index = 0; index < 3; index += 1) {
      const dot = createElement(documentRef, 'span', 'agent-thinking-dot');
      dots.appendChild(dot);
    }
    indicator.appendChild(dots);

    bubble.appendChild(indicator);
    wrapper.appendChild(bubble);
    messageList.appendChild(wrapper);

    thinkingMessage = wrapper;
    scrollToLatest();
  };

  const removeThinkingMessage = (): void => {
    if (thinkingMessage?.parentElement) {
      thinkingMessage.parentElement.removeChild(thinkingMessage);
    }
    thinkingMessage = null;
  };

  const appendMessageWrapper = (wrapper: HTMLElement): void => {
    if (!messageList) {
      return;
    }
    messageList.appendChild(wrapper);
    scrollToLatest();
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

  const appendTextBlock = (container: HTMLElement, className: string, content: string): void => {
    if (!content || !shouldDisplayApprovalText(content)) {
      return;
    }
    container.appendChild(createElement(documentRef, 'div', className, content));
  };

  const appendMetaTag = (container: HTMLElement, label: string, value: string): void => {
    if (!value) {
      return;
    }
    const meta = createElement(documentRef, 'div', 'agent-event-meta');
    const tag = createElement(documentRef, 'span', 'agent-event-meta-tag', `${label}: ${value}`);
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

  const appendMessage = (role: AgentRole, text: string): void => {
    const normalized = normaliseText(text);
    if (!normalized) {
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
      markdownDisplay.render(normalized, { updateCurrent: false });
    } else {
      bubble.textContent = normalized;
    }

    appendMessageWrapper(wrapper);
  };

  const appendEvent = (eventType: string, payload: AgentEventPayload = {}): void => {
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
  };

  const appendCommand = (payload?: AgentCommandPayload | null): void => {
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

    const header = createElement(documentRef, 'div', 'agent-command-header');
    const commandLabel = createElement(
      documentRef,
      'div',
      'agent-command-label',
      description || 'Command preview',
    );
    header.appendChild(commandLabel);

    if (workingDirectory) {
      header.appendChild(
        createElement(
          documentRef,
          'div',
          'agent-command-directory',
          `Working directory: ${workingDirectory}`,
        ),
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
  };

  return {
    appendMessage,
    appendEvent,
    appendCommand,
    setStatus(message, { level } = {}) {
      lastStatus = message ?? '';
      lastStatusLevel = level ?? '';
      if (!isThinking) {
        updateStatusDisplay();
      }
    },
    setThinking(active) {
      if (active) {
        ensureThinkingMessage();
      } else {
        removeThinkingMessage();
      }
      if (isThinking === active) {
        return;
      }
      isThinking = active;
      ensureButtons(active);
      updateStatusDisplay();
    },
    ensureConversationStarted() {
      setPanelActive(true);
    },
    updatePanelState(active) {
      setPanelActive(active);
    },
    updatePlan(steps) {
      planDisplay?.update(Array.isArray(steps) ? steps : []);
    },
    isThinking() {
      return isThinking;
    },
    dispose() {
      planDisplay?.reset?.();
      removeThinkingMessage();
      ensureButtons(false);
      lastStatus = '';
      lastStatusLevel = '';
      isThinking = false;
      setPanelActive(false);
      updateStatusDisplay();
    },
  };
}

export function shouldAppendStatusMessage(payload: AgentMessagePayload): boolean {
  const promptText = normaliseText(payload.prompt).trim();
  if (!promptText || promptText === '▷') {
    return false;
  }
  return shouldDisplayApprovalText(promptText);
}
