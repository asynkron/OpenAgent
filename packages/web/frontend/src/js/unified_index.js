import './vendor_globals.js';
import { createChatService } from './services/chat.js';

function startChatAgent() {
  const panel = document.getElementById('agent-panel');
  const chatContainer = document.getElementById('agent-chat');
  const chatBody = document.getElementById('agent-chat-body');
  const planContainer = document.getElementById('agent-plan');
  const messageList = document.getElementById('agent-messages');
  const chatForm = document.getElementById('agent-chat-form');
  const chatInput = document.getElementById('agent-chat-input');
  const statusElement = document.getElementById('agent-status');

  const startContainer = document.getElementById('agent-start');
  const startForm = document.getElementById('agent-start-form');
  const startInput = document.getElementById('agent-start-input');

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
