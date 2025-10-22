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
import { resolveAgentEventDisplay, shouldDisplayApprovalText } from './chat_eventDisplay.js';

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
  appendMessage(role: AgentRole, text: string, options?: { eventId?: string }): void;
  appendEvent(eventType: string, payload: AgentEventPayload): void;
  appendCommand(payload?: AgentCommandPayload | null, options?: { eventId?: string }): void;
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

interface MessageEntry {
  role: AgentRole;
  wrapper: HTMLElement;
  bubble: HTMLElement;
  markdown: MarkdownDisplayApi | null;
}

interface CommandEntry {
  wrapper: HTMLElement;
  bubble: HTMLElement;
}

interface CommandOutputBlock {
  label: string;
  content: string;
  language?: string;
}

function normaliseEventId(value: unknown): string | null {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }
  return null;
}

function formatRuntimeMs(value: number | null | undefined): string {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    return '';
  }
  if (value < 1000) {
    return `${Math.round(value)} ms`;
  }
  const seconds = value / 1000;
  const precision = seconds >= 10 ? 0 : 1;
  return `${seconds.toFixed(precision)} s`;
}

function normaliseCommandPreviewBlocks(
  preview: AgentCommandPayload['preview'] | null | undefined,
): CommandOutputBlock[] {
  if (!preview || typeof preview !== 'object') {
    return [];
  }

  const blocks: CommandOutputBlock[] = [];
  const source = preview as { stdout?: unknown; stderr?: unknown };

  const stdout = normaliseText(source.stdout);
  if (stdout.trim().length > 0) {
    blocks.push({ label: 'stdout', content: stdout });
  }

  const stderr = normaliseText(source.stderr);
  if (stderr.trim().length > 0) {
    blocks.push({ label: 'stderr', content: stderr });
  }

  if (blocks.length > 0) {
    return blocks;
  }

  const fallback = preview as { code?: unknown; language?: unknown };
  const code = normaliseText(fallback.code);
  const trimmedCode = code.trim();
  if (trimmedCode.length > 0) {
    const language = typeof fallback.language === 'string' ? fallback.language.trim() : '';
    return [{ label: 'output', content: code, language }];
  }

  return [];
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
  const messageEntries = new Map<string, MessageEntry>();
  const commandEntries = new Map<string, CommandEntry>();

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

  const appendMessage = (role: AgentRole, text: string, options: { eventId?: string } = {}): void => {
    const normalized = normaliseText(text);
    const eventId = normaliseEventId(options.eventId);

    if (eventId) {
      const existing = messageEntries.get(eventId);
      if (existing) {
        if (existing.role !== role) {
          existing.role = role;
          existing.wrapper.className = `agent-message agent-message--${role}`;
        }

        if (role === 'agent') {
          const markdownDisplay =
            existing.markdown ??
            createMarkdownDisplay({
              content: existing.bubble,
              getCurrentFile: () => null,
              setCurrentContent: () => {
                /* noop */
              },
              buildQuery: () => '',
            });
          markdownDisplay.render(normalized, { updateCurrent: false });
          existing.markdown = markdownDisplay;
        } else {
          existing.bubble.textContent = normalized;
        }

        scrollToLatest();
        return;
      }
    }

    if (!normalized) {
      return;
    }

    const { wrapper, bubble } = createMessageContainer(
      `agent-message agent-message--${role}`,
      'agent-message-bubble',
    );

    let markdownDisplay: MarkdownDisplayApi | null = null;
    if (role === 'agent') {
      markdownDisplay = createMarkdownDisplay({
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

    if (eventId) {
      wrapper.dataset.eventId = eventId;
      messageEntries.set(eventId, { role, wrapper, bubble, markdown: markdownDisplay });
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

  const renderCommandBubble = (
    bubble: HTMLElement,
    payload: AgentCommandPayload | null | undefined,
  ): void => {
    bubble.innerHTML = '';

    const command = payload?.command ?? null;
    const runText = normaliseText(command?.run).trim();
    const description = normaliseText(command?.description).trim();
    const shellText = normaliseText(command?.shell).trim();
    const workingDirectory = normaliseText(command?.cwd ?? (command as { workingDirectory?: unknown })?.workingDirectory).trim();

    const titleCandidates = [
      description,
      normaliseText(payload?.title).trim(),
      normaliseText(payload?.text).trim(),
    ];
    const titleText = titleCandidates.find((value) => value.length > 0) ?? 'Command result';
    bubble.appendChild(createElement(documentRef, 'div', 'agent-command-title', titleText));

    const summaryCandidates = [
      normaliseText(payload?.text).trim(),
      normaliseText(payload?.details).trim(),
      normaliseText(payload?.description).trim(),
    ];
    const summaryText = summaryCandidates.find(
      (value) => value.length > 0 && value !== titleText,
    );
    if (summaryText) {
      bubble.appendChild(
        createElement(documentRef, 'div', 'agent-command-description', summaryText),
      );
    }

    if (runText) {
      appendHighlightedBlock(bubble, runText, {
        language: shellText || 'bash',
        classNames: ['agent-command-block'],
      });
    }

    const metaItems: Array<{ label: string; value: string }> = [];
    if (workingDirectory) {
      metaItems.push({ label: 'Working directory', value: workingDirectory });
    }
    if (shellText) {
      metaItems.push({ label: 'Shell', value: shellText });
    }

    const runtimeText = formatRuntimeMs(payload?.runtimeMs ?? null);
    if (runtimeText) {
      metaItems.push({ label: 'Runtime', value: runtimeText });
    }

    if (payload?.killed) {
      metaItems.push({ label: 'Result', value: 'Terminated' });
    } else if (typeof payload?.exitCode === 'number') {
      metaItems.push({ label: 'Exit code', value: String(payload.exitCode) });
    }

    if (metaItems.length > 0) {
      const metaContainer = createElement(documentRef, 'div', 'agent-command-meta');
      for (const item of metaItems) {
        const metaItem = createElement(documentRef, 'div', 'agent-command-meta-item');
        metaItem.appendChild(
          createElement(documentRef, 'span', 'agent-command-meta-label', item.label),
        );
        metaItem.appendChild(
          createElement(documentRef, 'span', 'agent-command-meta-value', item.value),
        );
        metaContainer.appendChild(metaItem);
      }
      bubble.appendChild(metaContainer);
    }

    const commandPreview = (command as { preview?: unknown } | null | undefined)?.preview;
    const previewSource = payload?.preview ?? commandPreview;
    const previewBlocks = normaliseCommandPreviewBlocks(previewSource as AgentCommandPayload['preview']);

    if (previewBlocks.length > 0) {
      const outputContainer = createElement(documentRef, 'div', 'agent-command-output');
      for (const block of previewBlocks) {
        const section = documentRef.createElement('div');
        section.appendChild(
          createElement(
            documentRef,
            'div',
            'agent-command-output-label',
            block.label.toUpperCase(),
          ),
        );
        appendHighlightedBlock(section, block.content, {
          language: block.language ?? '',
          classNames: ['agent-command-block', 'agent-command-output-block'],
        });
        outputContainer.appendChild(section);
      }
      bubble.appendChild(outputContainer);
    }
  };

  const appendCommand = (
    payload?: AgentCommandPayload | null,
    options: { eventId?: string } = {},
  ): void => {
    if (!messageList) {
      return;
    }

    const eventId = normaliseEventId(options.eventId);
    if (eventId) {
      const existing = commandEntries.get(eventId);
      if (existing) {
        renderCommandBubble(existing.bubble, payload ?? null);
        scrollToLatest();
        return;
      }
    }

    const { wrapper, bubble } = createMessageContainer(
      'agent-message agent-message--command',
      'agent-message-bubble agent-message-bubble--command',
    );

    renderCommandBubble(bubble, payload ?? null);

    if (eventId) {
      wrapper.dataset.eventId = eventId;
      commandEntries.set(eventId, { wrapper, bubble });
    }

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
      messageEntries.clear();
      commandEntries.clear();
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
