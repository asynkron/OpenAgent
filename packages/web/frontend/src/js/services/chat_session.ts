export interface ChatSessionController {
  isDestroyed(): boolean;
  hasConversation(): boolean;
  isSocketConnected(): boolean;
  markDestroyed(): void;
  startConversation(): boolean;
  setSocketConnected(connected: boolean): void;
}

export function createChatSessionController(): ChatSessionController {
  let destroyed = false;
  let conversationStarted = false;
  let socketConnected = false;

  return {
    isDestroyed(): boolean {
      return destroyed;
    },
    hasConversation(): boolean {
      return conversationStarted;
    },
    isSocketConnected(): boolean {
      return socketConnected;
    },
    markDestroyed(): void {
      destroyed = true;
    },
    startConversation(): boolean {
      if (conversationStarted) {
        return false;
      }
      conversationStarted = true;
      return true;
    },
    setSocketConnected(connected: boolean): void {
      socketConnected = connected;
    },
  };
}
