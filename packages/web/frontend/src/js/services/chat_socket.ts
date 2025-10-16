import type { AgentIncomingPayload } from './chat_router.js';

export interface ChatSocketStatusUpdate {
  state: 'connecting' | 'connected' | 'reconnecting' | 'error';
  message: string;
  level?: 'info' | 'warn' | 'error';
}

export interface ChatSocketManagerOptions {
  windowRef: Window & typeof globalThis;
  reconnectDelay: number;
  parsePayload: (data: unknown) => AgentIncomingPayload | null;
  onStatus: (status: ChatSocketStatusUpdate) => void;
  onPayload: (payload: AgentIncomingPayload) => void;
  onConnectionChange?: (connected: boolean) => void;
  createSocket?: (url: string) => WebSocket;
}

export interface ChatSocketManager {
  connect(): void;
  dispose(): void;
  sendPrompt(prompt: string): boolean;
  isConnected(): boolean;
}

type CleanupFn = () => void;

function isFromStaleSocket(target: WebSocket | null, event: Event): boolean {
  const currentTarget = event?.currentTarget ?? null;
  return Boolean(target && currentTarget && target !== currentTarget);
}

export function createChatSocketManager({
  windowRef,
  reconnectDelay,
  parsePayload,
  onStatus,
  onPayload,
  onConnectionChange,
  createSocket,
}: ChatSocketManagerOptions): ChatSocketManager {
  const { location } = windowRef;
  const createSocketFn =
    createSocket ?? ((url: string) => new windowRef.WebSocket(url));

  let socket: WebSocket | null = null;
  let cleanup: CleanupFn | null = null;
  let reconnectTimer: number | null = null;
  let destroyed = false;
  let connected = false;

  const OPEN_STATE = windowRef.WebSocket?.OPEN ?? 1;
  const CLOSING_STATE = windowRef.WebSocket?.CLOSING ?? 2;
  const CLOSED_STATE = windowRef.WebSocket?.CLOSED ?? 3;

  const emitStatus = (status: ChatSocketStatusUpdate): void => {
    onStatus(status);
  };

  const updateConnection = (isConnected: boolean): void => {
    if (connected === isConnected) {
      return;
    }
    connected = isConnected;
    onConnectionChange?.(connected);
  };

  const clearReconnectTimer = (): void => {
    if (reconnectTimer) {
      windowRef.clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
  };

  const scheduleReconnect = (): void => {
    if (reconnectTimer || destroyed) {
      return;
    }
    reconnectTimer = windowRef.setTimeout(() => {
      reconnectTimer = null;
      connect();
    }, reconnectDelay);
  };

  const removeSocketListeners = (): void => {
    if (!cleanup) {
      return;
    }
    try {
      cleanup();
    } catch (error) {
      console.warn('Failed to remove agent socket listeners', error);
    }
    cleanup = null;
  };

  const handleOpen = (event: Event): void => {
    if (!socket || isFromStaleSocket(socket, event)) {
      return;
    }
    if (destroyed || socket.readyState !== OPEN_STATE) {
      return;
    }
    clearReconnectTimer();
    updateConnection(true);
    emitStatus({
      state: 'connected',
      level: 'info',
      message: 'Connected to the agent runtime.',
    });
  };

  const handleMessage = (event: MessageEvent<string>): void => {
    if (!socket || isFromStaleSocket(socket, event)) {
      return;
    }
    if (!event.data) {
      return;
    }

    let payload: AgentIncomingPayload | null = null;
    try {
      const parsed = JSON.parse(event.data);
      payload = parsePayload(parsed);
    } catch (error) {
      console.warn('Failed to parse agent message payload', error);
      return;
    }

    if (!payload) {
      return;
    }

    onPayload(payload);
  };

  const handleClose = (event: CloseEvent): void => {
    const target = event.currentTarget as WebSocket | null;
    if (socket && target && socket !== target) {
      return;
    }
    if (destroyed) {
      return;
    }
    updateConnection(false);
    emitStatus({
      state: 'reconnecting',
      level: 'warn',
      message: 'Reconnecting to the agent runtime...',
    });
    scheduleReconnect();
    removeSocketListeners();
    if (socket === target) {
      socket = null;
    }
  };

  const handleError = (event: Event): void => {
    const target = event.currentTarget as WebSocket | null;
    if (socket && target && socket !== target) {
      return;
    }
    updateConnection(false);
    emitStatus({
      state: 'error',
      level: 'error',
      message: 'Agent connection encountered an error.',
    });
    try {
      target?.close();
    } catch (error) {
      console.warn('Failed to close agent socket after error', error);
    } finally {
      if (socket === target) {
        socket = null;
      }
    }
    scheduleReconnect();
  };

  const attachSocketListeners = (target: WebSocket): void => {
    const handleMessageListener = (event: Event): void => {
      handleMessage(event as MessageEvent<string>);
    };

    target.addEventListener('open', handleOpen);
    target.addEventListener('message', handleMessageListener);
    target.addEventListener('close', handleClose);
    target.addEventListener('error', handleError);

    cleanup = () => {
      target.removeEventListener('open', handleOpen);
      target.removeEventListener('message', handleMessageListener);
      target.removeEventListener('close', handleClose);
      target.removeEventListener('error', handleError);
    };
  };

  const connect = (): void => {
    if (destroyed) {
      return;
    }

    clearReconnectTimer();

    if (socket && socket.readyState !== CLOSED_STATE && socket.readyState !== CLOSING_STATE) {
      removeSocketListeners();
      try {
        socket.close();
      } catch (error) {
        console.warn('Failed to close existing agent socket', error);
      }
    }

    let url: string;
    try {
      const protocol = location.protocol === 'https:' ? 'wss' : 'ws';
      url = `${protocol}://${location.host}/ws/agent`;
    } catch (error) {
      console.error('Failed to resolve agent websocket URL', error);
      scheduleReconnect();
      return;
    }

    emitStatus({ state: 'connecting', message: 'Connecting to the agent runtime...' });

    const nextSocket = createSocketFn(url);
    socket = nextSocket;
    attachSocketListeners(nextSocket);
  };

  const sendPrompt = (prompt: string): boolean => {
    if (!socket || socket.readyState !== OPEN_STATE) {
      return false;
    }
    try {
      socket.send(JSON.stringify({ type: 'prompt', prompt }));
      return true;
    } catch (error) {
      console.warn('Failed to deliver chat message', error);
      scheduleReconnect();
      return false;
    }
  };

  const dispose = (): void => {
    destroyed = true;
    clearReconnectTimer();
    removeSocketListeners();
    if (socket) {
      try {
        socket.close();
      } catch (error) {
        console.warn('Failed to close agent socket on dispose', error);
      }
      socket = null;
    }
  };

  return {
    connect,
    dispose,
    sendPrompt,
    isConnected(): boolean {
      return connected;
    },
  };
}
