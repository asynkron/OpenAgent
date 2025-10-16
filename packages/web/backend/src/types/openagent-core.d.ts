declare module '@asynkron/openagent-core' {
  export type PromptRequestScope = 'user-input' | 'approval' | (string & {});

  export interface PromptRequestMetadata extends Record<string, unknown> {
    scope: PromptRequestScope;
  }

  export interface AgentRuntime {
    submitPrompt(prompt: string): void;
  }

  export interface WebSocketBinding {
    readonly runtime?: AgentRuntime;
    start?(): void | Promise<void>;
    stop?(options?: { reason?: string }): void | Promise<void>;
  }

  export interface RuntimeOptions {
    getAutoApproveFlag: () => boolean;
    emitAutoApproveStatus?: boolean;
  }

  export interface WebSocketBindingOptions {
    socket: import('ws').WebSocket;
    autoStart?: boolean;
    formatOutgoing?: (event: unknown) => string | undefined;
    runtimeOptions?: RuntimeOptions;
  }

  export function createWebSocketBinding(options: WebSocketBindingOptions): WebSocketBinding;
}
