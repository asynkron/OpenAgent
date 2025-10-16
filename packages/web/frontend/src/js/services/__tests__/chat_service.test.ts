import { jest } from '@jest/globals';
import { createChatActionRunner } from '../chat_actionRunner.js';
import { createChatConnection } from '../chat_connection.js';
import { createChatSessionController } from '../chat_session.js';
import type { ChatDomController } from '../chat_domController.js';
import type { ChatRouteAction } from '../chat_router.js';
import type { ChatSocketManager, ChatSocketManagerOptions } from '../chat_socket.js';

describe('chat service helpers', () => {
  describe('createChatSessionController', () => {
    it('tracks destroyed, conversation, and socket connectivity', () => {
      const session = createChatSessionController();

      expect(session.isDestroyed()).toBe(false);
      expect(session.hasConversation()).toBe(false);
      expect(session.isSocketConnected()).toBe(false);

      expect(session.startConversation()).toBe(true);
      expect(session.hasConversation()).toBe(true);
      expect(session.startConversation()).toBe(false);

      session.setSocketConnected(true);
      expect(session.isSocketConnected()).toBe(true);

      session.markDestroyed();
      expect(session.isDestroyed()).toBe(true);
    });
  });

  describe('createChatActionRunner', () => {
    function createDomSpies(): jest.Mocked<ChatDomController> {
      return {
        appendCommand: jest.fn(),
        appendEvent: jest.fn(),
        appendMessage: jest.fn(),
        dispose: jest.fn(),
        ensureConversationStarted: jest.fn(),
        isThinking: jest.fn(),
        setStatus: jest.fn(),
        setThinking: jest.fn(),
        updatePanelState: jest.fn(),
        updatePlan: jest.fn(),
      };
    }

    it('delegates actions to the DOM controller and only starts the conversation once', () => {
      const dom = createDomSpies();
      const session = createChatSessionController();
      const runner = createChatActionRunner({ dom, session });

      const actions: ChatRouteAction[] = [
        { type: 'thinking', active: true },
        { type: 'status', message: 'hello', level: 'info' },
        {
          type: 'message',
          role: 'agent',
          text: 'greetings',
          startConversation: true,
        },
        {
          type: 'plan',
          steps: [],
          startConversation: true,
        },
        {
          type: 'event',
          eventType: 'ping',
          payload: { text: 'payload' },
          startConversation: true,
        },
        {
          type: 'command',
          payload: { command: { run: 'run' } },
          startConversation: true,
        },
        { type: 'status', message: 'clear me', clear: true },
      ];

      runner.run(actions);

      expect(dom.setThinking).toHaveBeenCalledWith(true);
      expect(dom.setStatus).toHaveBeenNthCalledWith(1, 'hello', { level: 'info' });
      expect(dom.ensureConversationStarted).toHaveBeenCalledTimes(1);
      expect(dom.appendMessage).toHaveBeenCalledWith('agent', 'greetings');
      expect(dom.updatePlan).toHaveBeenCalledWith([]);
      expect(dom.appendEvent).toHaveBeenCalledWith('ping', { text: 'payload' });
      expect(dom.appendCommand).toHaveBeenCalledWith({ command: { run: 'run' } });
      expect(dom.setStatus).toHaveBeenLastCalledWith('');
    });

    it('stops processing once the session is destroyed', () => {
      const dom = createDomSpies();
      const session = createChatSessionController();
      const runner = createChatActionRunner({ dom, session });

      const actions: ChatRouteAction[] = [
        { type: 'thinking', active: true },
        { type: 'status', message: 'first' },
        { type: 'message', role: 'agent', text: 'second' },
      ];

      session.markDestroyed();
      runner.run(actions);

      expect(dom.setThinking).not.toHaveBeenCalled();
      expect(dom.setStatus).not.toHaveBeenCalled();
      expect(dom.appendMessage).not.toHaveBeenCalled();
    });
  });

  describe('createChatConnection', () => {
    it('wraps the socket manager and exposes its minimal API surface', () => {
      const connect = jest.fn();
      const dispose = jest.fn();
      const sendPrompt = jest.fn().mockReturnValue(true);
      const isConnected = jest.fn().mockReturnValue(true);

      let capturedOptions: ChatSocketManagerOptions | null = null;
      const managerFactory = jest.fn((options: ChatSocketManagerOptions): ChatSocketManager => {
        capturedOptions = options;
        return {
          connect,
          dispose,
          sendPrompt,
          isConnected,
        };
      });

      const onStatus = jest.fn();
      const onPayload = jest.fn();
      const onConnectionChange = jest.fn();

      const connection = createChatConnection({
        windowRef: {} as Window & typeof globalThis,
        reconnectDelay: 1,
        parsePayload: jest.fn(),
        onStatus,
        onPayload,
        onConnectionChange,
        createManager: managerFactory,
      });

      expect(managerFactory).toHaveBeenCalledTimes(1);
      expect(capturedOptions?.onStatus).toBe(onStatus);
      expect(capturedOptions?.onPayload).toBe(onPayload);
      expect(capturedOptions?.onConnectionChange).toBe(onConnectionChange);

      expect(connection.connect).toBeInstanceOf(Function);
      connection.connect();
      expect(connect).toHaveBeenCalledTimes(1);

      expect(connection.sendPrompt('test')).toBe(true);
      expect(sendPrompt).toHaveBeenCalledWith('test');

      expect(connection.isConnected()).toBe(true);
      expect(isConnected).toHaveBeenCalledTimes(1);

      connection.dispose();
      expect(dispose).toHaveBeenCalledTimes(1);
    });
  });
});
