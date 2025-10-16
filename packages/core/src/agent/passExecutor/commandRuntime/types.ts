import type { ExecutableCandidate } from '../planRuntime.js';
import type { CommandRunOutcome } from '../types.js';
import type { CommandResult } from '../../observationBuilder.js';

interface CommandContext {
  readonly command: ExecutableCandidate['command'];
  readonly planStep: ExecutableCandidate['step'] | null;
  readonly normalizedRun: string;
}

export interface PreparedCommand extends CommandContext {
  readonly type: 'prepared';
}

export interface ApprovedCommand extends CommandContext {
  readonly type: 'approved';
}

export interface CommandRejectedResult {
  readonly type: 'command-rejected';
}

export interface CommandExecutedResult extends CommandContext {
  readonly type: 'executed';
  readonly outcome: CommandRunOutcome;
  readonly result: CommandResult;
}

export interface CommandContinueResult {
  readonly type: 'continue';
}

export type CommandPipelineResult =
  | PreparedCommand
  | ApprovedCommand
  | CommandRejectedResult
  | CommandExecutedResult
  | CommandContinueResult;
