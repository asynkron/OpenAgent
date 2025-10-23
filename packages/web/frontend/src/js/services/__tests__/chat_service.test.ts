import { jest } from '@jest/globals';
import { createChatActionRunner } from '../chat_actionRunner.js';
import { createChatBootstrap, type ChatBootstrapHandlers } from '../chat_bootstrap.js';
import { createChatLifecycle, type ChatLifecycleObserver } from '../chat_lifecycle.js';
import { createChatSessionController, createChatSessionState } from '../chat_sessionController.js';
import type { ChatDomController } from '../chat_domController.js';
import type { ChatInputController } from '../chat_inputController.js';
import type {
  ChatSocketManager,
  ChatSocketManagerOptions,
  ChatSocketStatusUpdate,
} from '../chat_socket.js';
import type { AgentIncomingPayload, ChatRouteAction } from '../chat_router.js';

describe('chat service helpers', () => {
  describe('createChatSessionState', () => {
    it('tracks destroyed, conversation, and socket connectivity', () => {
      const state = createChatSessionState();

      expect(state.isDestroyed()).toBe(false);
      expect(state.hasConversation()).toBe(false);
      expect(state.isSocketConnected()).toBe(false);

      expect(state.startConversation()).toBe(true);
      expect(state.hasConversation()).toBe(true);
      expect(state.startConversation()).toBe(false);

      state.setSocketConnected(true);
      expect(state.isSocketConnected()).toBe(true);

      state.markDestroyed();
      expect(state.isDestroyed()).toBe(true);
    });
  });

  describe('createChatActionRunner', () => {
    function createDomSpies(): jest.Mocked<ChatDomController> {
      return {
        appendCommand: jest.fn(),
        appendEvent: jest.fn(),
        appendMessage: jest.fn(),
        beginRuntimeSession: jest.fn(),
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
      const session = createChatSessionState();
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
      const session = createChatSessionState();
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

  describe('createChatSessionController', () => {
    const createDomSpies = (): jest.Mocked<ChatDomController> => ({
      appendCommand: jest.fn(),
      appendEvent: jest.fn(),
      appendMessage: jest.fn(),
      beginRuntimeSession: jest.fn(),
      dispose: jest.fn(),
      ensureConversationStarted: jest.fn(),
      isThinking: jest.fn(),
      setStatus: jest.fn(),
      setThinking: jest.fn(),
      updatePanelState: jest.fn(),
      updatePlan: jest.fn(),
    });

    const createInputSpies = (): jest.Mocked<ChatInputController> => ({
      dispose: jest.fn(),
      flushPending: jest.fn(),
      getPendingMessages: jest.fn(),
      hasPending: jest.fn(),
      registerSender: jest.fn(),
    });

    it('handles user messages, queue updates, and lifecycle events', () => {
      const dom = createDomSpies();
      const input = createInputSpies();
      const lifecycle = { connect: jest.fn(), isConnected: jest.fn(() => false) };
      const routePayload = jest.fn<ChatRouteAction[], [AgentIncomingPayload]>(() => [
        { type: 'message', role: 'agent', text: 'reply', startConversation: true },
      ]);
      const runActions = jest.fn();

      const session = createChatSessionController({
        dom,
        input,
        lifecycle,
        routePayload,
        runActions,
      });

      session.initialize();
      expect(dom.setStatus).toHaveBeenCalledWith('');
      expect(dom.updatePanelState).toHaveBeenCalledWith(false);

      expect(session.handleUserMessage('hello')).toBe(true);
      expect(dom.ensureConversationStarted).toHaveBeenCalledTimes(1);
      expect(dom.appendMessage).toHaveBeenCalledWith('user', 'hello');

      session.handleQueueUpdate(['hello']);
      expect(dom.setStatus).toHaveBeenLastCalledWith('Waiting for the agent runtime connection...');
      expect(lifecycle.connect).toHaveBeenCalled();

      session.handleLifecycleEvent({
        type: 'status',
        status: { state: 'connected', message: 'ready' } as ChatSocketStatusUpdate,
      });
      expect(dom.setThinking).toHaveBeenCalledWith(false);
      expect(dom.setStatus).toHaveBeenLastCalledWith('ready', { level: undefined });

      session.handleLifecycleEvent({ type: 'connection', connected: true });
      expect(input.flushPending).toHaveBeenCalled();

      const payload: AgentIncomingPayload = {
        type: 'message',
        body: { role: 'agent', text: 'hi' },
      } as AgentIncomingPayload;
      session.handleLifecycleEvent({ type: 'payload', payload });
      expect(routePayload).toHaveBeenCalledWith(payload);
      expect(runActions).toHaveBeenCalled();
    });

    it('starts a new runtime session when the socket reconnects', () => {
      const dom = createDomSpies();
      const input = createInputSpies();
      const lifecycle = { connect: jest.fn(), isConnected: jest.fn(() => false) };
      const routePayload = jest.fn<ChatRouteAction[], [AgentIncomingPayload]>(() => []);
      const runActions = jest.fn();

      const session = createChatSessionController({
        dom,
        input,
        lifecycle,
        routePayload,
        runActions,
      });

      session.handleLifecycleEvent({ type: 'connection', connected: true });
      expect(dom.beginRuntimeSession).toHaveBeenCalledTimes(1);
      expect(input.flushPending).toHaveBeenCalledTimes(1);

      session.handleLifecycleEvent({ type: 'connection', connected: true });
      expect(dom.beginRuntimeSession).toHaveBeenCalledTimes(1);

      session.handleLifecycleEvent({ type: 'connection', connected: false });
      session.handleLifecycleEvent({ type: 'connection', connected: true });
      expect(dom.beginRuntimeSession).toHaveBeenCalledTimes(2);
    });
  });

  describe('createChatLifecycle', () => {
    it('notifies observers for status, payload, and connection events', () => {
      const connect = jest.fn();
      const dispose = jest.fn();
      const sendPrompt = jest.fn().mockReturnValue(true);
      const isConnected = jest.fn().mockReturnValue(false);

      let capturedOptions: ChatSocketManagerOptions | null = null;
      const managerFactory = jest.fn((options: ChatSocketManagerOptions): ChatSocketManager => {
        capturedOptions = options;
        return { connect, dispose, sendPrompt, isConnected };
      });

      const lifecycle = createChatLifecycle({
        windowRef: {} as Window & typeof globalThis,
        reconnectDelay: 1,
        parsePayload: jest.fn(),
        createManager: managerFactory,
      });

      const observer = jest.fn<
        ReturnType<ChatLifecycleObserver>,
        Parameters<ChatLifecycleObserver>
      >();
      const unsubscribe = lifecycle.subscribe(observer);

      const statusUpdate: ChatSocketStatusUpdate = {
        state: 'connected',
        message: 'Connected',
        level: 'info',
      };

      capturedOptions?.onStatus(statusUpdate);
      expect(observer).toHaveBeenCalledWith({ type: 'status', status: statusUpdate });

      const payload = { type: 'message' } as AgentIncomingPayload;
      capturedOptions?.onPayload(payload);
      expect(observer).toHaveBeenLastCalledWith({ type: 'payload', payload });

      capturedOptions?.onConnectionChange?.(true);
      expect(observer).toHaveBeenLastCalledWith({ type: 'connection', connected: true });

      unsubscribe();
      lifecycle.dispose();
      expect(dispose).toHaveBeenCalled();
    });
  });

  describe('createChatBootstrap', () => {
    it('builds DOM and input controllers and allows handler updates', () => {
      const panel = {} as HTMLElement;
      const startButton = {} as HTMLButtonElement;
      const chatButton = {} as HTMLButtonElement;

      const startForm = {
        querySelector: jest.fn(() => startButton),
      } as unknown as HTMLFormElement;
      const chatForm = {
        querySelector: jest.fn(() => chatButton),
      } as unknown as HTMLFormElement;

      let capturedHandlers: ChatBootstrapHandlers = {};

      const dom = {
        beginRuntimeSession: jest.fn(),
        dispose: jest.fn(),
        isThinking: jest.fn(() => false),
      } as unknown as ChatDomController;

      const input = {
        dispose: jest.fn(),
        flushPending: jest.fn(),
        getPendingMessages: jest.fn(),
        hasPending: jest.fn(),
        registerSender: jest.fn(),
      } as unknown as ChatInputController;

      const bootstrap = createChatBootstrap(
        {
          panel,
          startForm,
          chatForm,
          windowRef: {} as Window & typeof globalThis,
          documentRef: {} as Document,
        },
        {
          createDomController: jest.fn((options) => {
            // Expose send button discovery for sanity
            expect(options.sendButtons.has(startButton)).toBe(true);
            expect(options.sendButtons.has(chatButton)).toBe(true);
            return dom;
          }),
          createInputController: jest.fn((options) => {
            capturedHandlers = {
              onMessageSubmit: options.onMessageSubmit,
              onQueueUpdate: options.onQueueUpdate,
            };
            return input;
          }),
        },
      );

      expect(bootstrap).not.toBeNull();
      const { updateHandlers, dispose } = bootstrap!;

      const handleMessage = jest.fn(() => true);
      const handleQueue = jest.fn();
      updateHandlers({ onMessageSubmit: handleMessage, onQueueUpdate: handleQueue });

      capturedHandlers.onMessageSubmit?.('hello');
      expect(handleMessage).toHaveBeenCalledWith('hello');

      capturedHandlers.onQueueUpdate?.(['pending']);
      expect(handleQueue).toHaveBeenCalledWith(['pending']);

      dispose();
      expect(input.dispose).toHaveBeenCalled();
      expect(dom.dispose).toHaveBeenCalled();
    });
  });
});
