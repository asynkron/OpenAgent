/**
 * Command data contracts used by the CLI rendering helpers.
 *
 * These interfaces intentionally mirror the loose payloads that the runtime
 * emits so components remain tolerant of partially populated command data.
 */

export type CommandRenderType = 'EDIT' | 'REPLACE' | 'EXECUTE';

export interface CommandEditChange {
  start?: number;
  end?: number;
  content?: string;
}

export interface CommandEditSpecification {
  path?: string;
  encoding?: string;
  edits?: CommandEditChange[];
}

export interface CommandReplaceSpecification {
  pattern?: string;
  replacement?: string;
  files?: string[];
  dry_run?: boolean;
  dryRun?: boolean;
}

export interface CommandDefinition {
  run?: string | null;
  edit?: CommandEditSpecification | null;
  replace?: CommandReplaceSpecification | null;
  description?: string | null;
}

export type CommandExecutionSpec = CommandEditSpecification | CommandReplaceSpecification | undefined;

export interface CommandExecutionEnvelope {
  type?: string | null;
  spec?: CommandExecutionSpec | null;
  command?: CommandDefinition | null;
  description?: string | null;
}

export interface CommandPreviewPayload {
  stdoutPreview?: string | null;
  stderrPreview?: string | null;
  execution?: CommandExecutionEnvelope | null;
}

export interface CommandResultPayload {
  exit_code?: number | null;
  killed?: boolean;
}

export interface SummaryLineArrow {
  kind: 'arrow';
  text: string;
}

export interface SummaryLineIndent {
  kind: 'indent';
  text: string;
}

export interface SummaryLineErrorArrow {
  kind: 'error-arrow';
  text: string;
}

export interface SummaryLineErrorIndent {
  kind: 'error-indent';
  text: string;
}

export interface SummaryLineExitCode {
  kind: 'exit-code';
  text: string;
  status: 'success' | 'error';
}

export type SummaryLine =
  | SummaryLineArrow
  | SummaryLineIndent
  | SummaryLineErrorArrow
  | SummaryLineErrorIndent
  | SummaryLineExitCode;

export interface CommandRenderData {
  type: CommandRenderType;
  detail: string;
  description: string;
  summaryLines: SummaryLine[];
}
