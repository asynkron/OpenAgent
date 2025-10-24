/**
 * @jest-environment jsdom
 */

import { describe, expect, it } from '@jest/globals';
import { createChatDomController } from '../chat_domController.js';

describe('createChatDomController', () => {
  const setupController = () => {
    const panel = document.createElement('div');
    const startContainer = document.createElement('div');
    const chatContainer = document.createElement('div');
    const chatBody = document.createElement('div');
    const messageList = document.createElement('div');
    const chatInput = document.createElement('textarea');
    const planContainer = document.createElement('div');
    const statusElement = document.createElement('div');
    const sendButton = document.createElement('button');

    const controller = createChatDomController({
      panel,
      startContainer,
      chatContainer,
      chatBody,
      messageList,
      chatInput,
      planContainer,
      statusElement,
      windowRef: window,
      documentRef: document,
      sendButtons: new Set([sendButton]),
    });

    return { controller, messageList };
  };

  it('reuses streaming entries across runtime reconnects when the event id is stable', () => {
    const { controller, messageList } = setupController();

    controller.beginRuntimeSession();

    controller.appendMessage('agent', 'Hello', { eventId: 'message-1' });
    expect(messageList.children).toHaveLength(1);

    controller.appendMessage('agent', 'Hello friend', { eventId: 'message-1' });
    expect(messageList.children).toHaveLength(1);

    controller.beginRuntimeSession();

    controller.appendMessage('agent', 'Hello friend!', {
      eventId: 'message-1',
      final: true,
    });

    expect(messageList.children).toHaveLength(1);

    const wrapper = messageList.firstElementChild as HTMLElement | null;
    expect(wrapper?.dataset.runtimeGeneration).toBe('2');

    const bubble = messageList.querySelector('.agent-message-bubble');
    expect(bubble?.textContent ?? '').toContain('Hello friend!');
  });
});
