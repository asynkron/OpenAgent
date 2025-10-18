import type { WebSocket } from 'ws';
import type { WebSocketBinding } from '@asynkron/openagent-core';

export interface CleanupBundle {
  cleanup: (reason?: string) => Promise<void>;
  handleClose: () => void;
  handleError: (error: unknown) => void;
}

export function createCleanupBundle(
  ws: WebSocket,
  record: { cleaned: boolean; cleanup: ((reason?: string) => Promise<void>) | null },
  removeClient: () => void,
  binding: WebSocketBinding,
): CleanupBundle {
  let cleanupRef: (reason?: string) => Promise<void>;

  const handleClose = (): void => {
    console.log('Agent websocket closed by client');
    void cleanupRef('socket-close');
  };

  const handleError = (socketError: unknown): void => {
    if (socketError instanceof Error && socketError.message) {
      console.warn('Agent websocket error', socketError);
    }
    void cleanupRef('socket-error');
  };

  cleanupRef = async (reason = 'socket-close'): Promise<void> => {
    if (record.cleaned) {
      return;
    }

    record.cleaned = true;
    removeClient();
    console.log('Cleaning up agent websocket binding', { reason });

    try {
      ws.off?.('close', handleClose);
      ws.off?.('error', handleError);
    } catch (_error) {
      // Ignore listener removal failures; closed sockets may throw.
    }

    try {
      await binding.stop?.({ reason });
    } catch (error) {
      console.warn('Failed to stop agent binding cleanly', error);
    }
  };

  return {
    cleanup: cleanupRef,
    handleClose,
    handleError,
  };
}

export function registerLifecycleHandlers(ws: WebSocket, bundle: CleanupBundle): void {
  ws.on('close', bundle.handleClose);
  ws.on('error', bundle.handleError);
}
