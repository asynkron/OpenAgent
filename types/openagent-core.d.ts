declare module '@asynkron/openagent-core' {
  export type PromptRequestScope = 'user-input' | 'approval' | (string & {});

  export interface PromptRequestMetadata extends Record<string, unknown> {
    scope: PromptRequestScope;
  }

  export interface PromptRequestEvent {
    type: 'request-input';
    prompt: string;
    metadata: PromptRequestMetadata;
    __id?: string;
  }

  export interface PromptCoordinatorStatusEvent {
    type: 'status';
    level: string;
    message: string;
    details?: unknown;
    __id?: string;
  }

  export type PromptCoordinatorEvent = PromptRequestEvent | PromptCoordinatorStatusEvent;

  export type CommandResult = {
    stdout: string;
    stderr: string;
    exit_code: number | null;
    killed: boolean;
    runtime_ms: number;
  };

  export type RunCommand = (
    command: string | readonly string[],
    cwd: string,
    timeoutSec: number,
    shellOrOptions?: unknown,
  ) => Promise<CommandResult>;

  export type AgentRuntimeConfig = {
    systemPrompt?: string;
    systemPromptAugmentation?: string;
    runCommandFn?: RunCommand;
    applyFilterFn?: (text: string, regex?: RegExp | string | null) => string;
    tailLinesFn?: (text: string, lines?: number | null) => string;
    isPreapprovedCommandFn?: (command: unknown, cfg?: unknown) => boolean;
    isSessionApprovedFn?: (command: unknown) => boolean;
    approveForSessionFn?: (command: unknown) => void | Promise<void>;
    preapprovedCfg?: unknown;
    getAutoApproveFlag?: () => boolean;
    getNoHumanFlag?: () => boolean;
    getPlanMergeFlag?: () => boolean;
    getDebugFlag?: () => boolean;
    setNoHumanFlag?: (value?: boolean) => void;
    emitAutoApproveStatus?: boolean;
    logger?: Console;
    [extra: string]: unknown;
  };

  export type AgentRuntime = {
    start(): Promise<void>;
    submitPrompt(value: string): void;
    cancel(payload?: unknown): void;
    getHistorySnapshot(): unknown;
    readonly outputs: unknown;
    readonly inputs: unknown;
    [extra: string]: unknown;
  };

  export function createAgentRuntime(config?: AgentRuntimeConfig): AgentRuntime;

  export function runCommand(
    command: string | readonly string[],
    cwd: string,
    timeoutSec: number,
    shellOrOptions?: unknown,
  ): Promise<CommandResult>;

  export function incrementCommandCount(
    commandKey: string,
    logPath?: string | null,
  ): Promise<boolean>;

  export function applyFilter(text: string, regex?: RegExp | string | null): string;

  export function tailLines(text: string, lines?: number | null): string;

  export function isPreapprovedCommand(command: unknown, cfg?: unknown): boolean;

  export function isSessionApproved(command: unknown): boolean;

  export function approveForSession(command: unknown): void | Promise<void>;

  export const PREAPPROVED_CFG: unknown;

  export function getAutoApproveFlag(): boolean;

  export function getNoHumanFlag(): boolean;

  export function getPlanMergeFlag(): boolean;

  export function getDebugFlag(): boolean;

  export function setNoHumanFlag(value?: boolean): void;

  export function applyStartupFlagsFromArgv(argv: string[]): void;

  export function cancel(reason?: unknown): void;

  export interface OpenAgentCoreModule {
    cancel?: (reason?: unknown) => void;
    [key: string]: unknown;
  }

  const coreModule: OpenAgentCoreModule;
  export default coreModule;
}
