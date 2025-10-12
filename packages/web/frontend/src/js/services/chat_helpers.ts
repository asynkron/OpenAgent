import hljs from 'highlight.js';
import { marked } from 'marked';
import type { MarkedOptions } from 'marked';

import {
  normaliseClassList,
  type AgentCommandPayload,
  type AgentEventPayload,
  type AgentMessagePayload,
} from './chat_model.js';

export type CleanupFn = () => void;
export type ChatInputElement = HTMLTextAreaElement | HTMLInputElement;
export type OptionalElement<T extends Element> = T | null | undefined;

interface HighlightedMarkedOptions extends MarkedOptions {
  /**
   * `marked` does not currently expose the `highlight` callback on the options
   * interface, so we extend it to keep the type-safe override local.
   */
  highlight?(code: string, infoString?: string): string;
}

export interface HighlightedCodeBlockOptions {
  language?: string | null;
  classNames?: ReadonlyArray<string> | string;
  documentRef?: Document;
}

/**
 * Render a chunk of code as a highlighted block using marked/hljs.
 * Falls back to a plain text node when syntax highlighting fails.
 */
export function createHighlightedCodeBlock(
  text: string | null | undefined,
  { language = '', classNames = [], documentRef }: HighlightedCodeBlockOptions = {},
): HTMLPreElement | null {
  const content = text ?? '';
  if (content.length === 0) {
    return null;
  }

  const blockClasses = normaliseClassList(classNames);
  const safeLanguage = (language ?? '').trim();
  const doc = documentRef ?? document;

  try {
    const markdown = `\`\`\`${safeLanguage}\n${content}\n\`\`\``;
    const options: HighlightedMarkedOptions = {
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
    const parsed = marked.parse(markdown, options);

    if (typeof parsed === 'string') {
      const template = doc.createElement('template');
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

  const pre = doc.createElement('pre');
  blockClasses.forEach((className) => pre.classList.add(className));

  const codeElement = doc.createElement('code');

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

export function autoResize(textarea: OptionalElement<ChatInputElement>): void {
  if (!textarea) {
    return;
  }
  textarea.style.height = 'auto';
  const maxHeight = 220;
  textarea.style.height = `${Math.min(textarea.scrollHeight, maxHeight)}px`;
}

export type ListenerTarget = EventTarget & {
  addEventListener(
    type: string,
    listener: EventListener,
    options?: boolean | AddEventListenerOptions,
  ): void;
  removeEventListener(
    type: string,
    listener: EventListener,
    options?: boolean | EventListenerOptions,
  ): void;
};

export type ListenerMap = HTMLElementEventMap;

export function addListener<Type extends keyof ListenerMap, Target extends ListenerTarget>(
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

export const AGENT_PAYLOAD_TYPES = [
  'agent_message',
  'agent_status',
  'agent_error',
  'agent_thinking',
  'agent_request_input',
  'agent_plan',
  'agent_event',
  'agent_command',
] as const;

export type AgentPayloadType = (typeof AGENT_PAYLOAD_TYPES)[number];

export type AgentIncomingPayload =
  | (AgentMessagePayload & { type: 'agent_message' })
  | (AgentMessagePayload & { type: 'agent_status' })
  | (AgentMessagePayload & { type: 'agent_error' })
  | (AgentMessagePayload & { type: 'agent_thinking'; state?: 'start' | 'stop' })
  | (AgentMessagePayload & { type: 'agent_request_input' })
  | (AgentMessagePayload & { type: 'agent_plan' })
  | (AgentEventPayload & { type: 'agent_event' })
  | (AgentCommandPayload & { type: 'agent_command' });

export type AgentPayloadByType = {
  [Type in AgentPayloadType]: Extract<AgentIncomingPayload, { type: Type }>;
};

const AGENT_PAYLOAD_TYPE_SET = new Set<string>(AGENT_PAYLOAD_TYPES);

export function isAgentPayloadType(value: string): value is AgentPayloadType {
  return AGENT_PAYLOAD_TYPE_SET.has(value);
}

export function parseAgentPayload(data: unknown): AgentIncomingPayload | null {
  if (!data || typeof data !== 'object') {
    return null;
  }

  const payload = data as { type?: unknown };
  if (typeof payload.type !== 'string' || !isAgentPayloadType(payload.type)) {
    return null;
  }

  return payload as AgentIncomingPayload;
}
