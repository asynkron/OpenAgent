import { createChatService } from './services/chat.js';

type ElementId<T extends HTMLElement> = T | null;

function getElementById<T extends HTMLElement>(id: string): ElementId<T> {
  const element = document.getElementById(id);
  return element instanceof HTMLElement ? (element as T) : null;
}

function startChatAgent(): void {
  const panel = getElementById<HTMLElement>('agent-panel');
  const chatContainer = getElementById<HTMLElement>('agent-chat');
  const chatBody = getElementById<HTMLElement>('agent-chat-body');
  const planContainer = getElementById<HTMLElement>('agent-plan');
  const messageList = getElementById<HTMLElement>('agent-messages');
  const chatForm = getElementById<HTMLFormElement>('agent-chat-form');
  const chatInput = getElementById<HTMLInputElement>('agent-chat-input');
  const statusElement = getElementById<HTMLElement>('agent-status');

  const startContainer = getElementById<HTMLElement>('agent-start');
  const startForm = getElementById<HTMLFormElement>('agent-start-form');
  const startInput = getElementById<HTMLInputElement>('agent-start-input');

  const chatService = createChatService({
    panel,
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
  });

  chatService?.connect?.();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', startChatAgent, { once: true });
} else {
  startChatAgent();
}
