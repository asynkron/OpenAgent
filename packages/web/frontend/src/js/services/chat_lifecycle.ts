import {
  createChatSocketManager,
  type ChatSocketManager,
  type ChatSocketManagerOptions,
  type ChatSocketStatusUpdate,
} from './chat_socket.js';
import type { AgentIncomingPayload } from './chat_router.js';

export type ChatLifecycleEvent =
  | { type: 'status'; status: ChatSocketStatusUpdate }
  | { type: 'payload'; payload: AgentIncomingPayload }
  | { type: 'connection'; connected: boolean };

export type ChatLifecycleObserver = (event: ChatLifecycleEvent) => void;

export interface ChatLifecycle {
  connect(): void;
  dispose(): void;
  sendPrompt(prompt: string): boolean;
  isConnected(): boolean;
  subscribe(observer: ChatLifecycleObserver): () => void;
}

export interface ChatLifecycleOptions
  extends Omit<ChatSocketManagerOptions, 'onStatus' | 'onPayload' | 'onConnectionChange'> {
  onConnectionChange?: ChatSocketManagerOptions['onConnectionChange'];
  createManager?: (options: ChatSocketManagerOptions) => ChatSocketManager;
}

export function createChatLifecycle({
  createManager,
  ...options
}: ChatLifecycleOptions): ChatLifecycle {
  const managerFactory = createManager ?? createChatSocketManager;
  const observers = new Set<ChatLifecycleObserver>();

  const notify = (event: ChatLifecycleEvent): void => {
    for (const observer of observers) {
      try {
        observer(event);
      } catch (error) {
        console.warn('Chat lifecycle observer threw an error', error);
      }
    }
  };

  const manager = managerFactory({
    ...options,
    onStatus(status) {
      notify({ type: 'status', status });
    },
    onPayload(payload) {
      notify({ type: 'payload', payload });
    },
    onConnectionChange(connected) {
      notify({ type: 'connection', connected });
      options.onConnectionChange?.(connected);
    },
  });

  return {
    connect() {
      manager.connect();
    },
    dispose() {
      observers.clear();
      manager.dispose();
    },
    sendPrompt(prompt) {
      return manager.sendPrompt(prompt);
    },
    isConnected() {
      return manager.isConnected();
    },
    subscribe(observer) {
      observers.add(observer);
      return () => {
        observers.delete(observer);
      };
    },
  };
}

export type { ChatSocketStatusUpdate, AgentIncomingPayload };
