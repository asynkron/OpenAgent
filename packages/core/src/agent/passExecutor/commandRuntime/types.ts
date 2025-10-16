import type { CommandResult } from '../../observationBuilder.js';
import type { ExecutableCandidate } from '../planRuntime.js';
import type { CommandRunOutcome } from '../types.js';

export interface PreparedCommand {
  command: ExecutableCandidate['command'];
  planStep: ExecutableCandidate['step'] | null;
  normalizedRun: string;
}

export type CommandApprovalSource =
  | 'none'
  | 'allowlist'
  | 'session'
  | 'flag'
  | 'human-once'
  | 'human-session';

export interface CommandApproved extends PreparedCommand {
  status: 'approved';
  approvalSource: CommandApprovalSource;
}

export interface CommandRejected extends PreparedCommand {
  status: 'rejected';
  reason: 'human-declined';
}

export interface CommandExecution extends PreparedCommand {
  status: 'executed';
  approvalSource: CommandApprovalSource;
  outcome: CommandRunOutcome;
}

export interface CommandStatsRecorded extends PreparedCommand {
  status: 'stats-recorded';
  key: string;
}

export interface CommandStatsFailed extends PreparedCommand {
  status: 'stats-failed';
  key: string;
  error: string;
}

export type CommandStatsResult = CommandStatsRecorded | CommandStatsFailed;

export interface CommandResultEmission extends PreparedCommand {
  status: 'emitted';
  outcome: CommandRunOutcome;
  observation: Record<string, unknown>;
  commandResult: CommandResult;
  preview: unknown;
}

export interface CommandRuntimeSuccess {
  status: 'executed';
  approval: CommandApproved;
  execution: CommandExecution;
  stats: CommandStatsResult;
  emission: CommandResultEmission;
}

export type CommandRuntimeResult = CommandRuntimeSuccess | CommandRejected;
