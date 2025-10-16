import {
  createChatSocketManager,
  type ChatSocketManager,
  type ChatSocketManagerOptions,
  type ChatSocketStatusUpdate,
} from './chat_socket.js';
import type { AgentIncomingPayload } from './chat_router.js';

export interface ChatConnection {
  connect(): void;
  dispose(): void;
  sendPrompt(prompt: string): boolean;
  isConnected(): boolean;
}

export interface ChatConnectionOptions extends ChatSocketManagerOptions {
  createManager?: (options: ChatSocketManagerOptions) => ChatSocketManager;
}

export function createChatConnection({
  createManager,
  ...options
}: ChatConnectionOptions): ChatConnection {
  const managerFactory = createManager ?? createChatSocketManager;
  const manager = managerFactory(options);

  return {
    connect() {
      manager.connect();
    },
    dispose() {
      manager.dispose();
    },
    sendPrompt(prompt) {
      return manager.sendPrompt(prompt);
    },
    isConnected() {
      return manager.isConnected();
    },
  };
}

export type { ChatSocketStatusUpdate, AgentIncomingPayload };
