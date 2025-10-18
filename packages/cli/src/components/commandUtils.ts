/**
 * Shared formatting helpers for command summaries across Ink components and
 * compatibility console renderers.
 */

export type Command = {
  run?: string | null;
  edit?: {
    path?: string;
    encoding?: string;
    edits?: unknown[];
  } | null;
  replace?: {
    pattern?: unknown;
    replacement?: unknown;
    files?: string[];
    dry_run?: boolean;
    dryRun?: boolean;
  } | null;
  description?: string | null;
};

export type CommandExecution = {
  type?: string | null;
  spec?: CommandExecutionSpec | null;
  command?: Command | null;
  description?: string | null;
};

export type EditSpecification = {
  path?: string;
  encoding?: string;
  edits?: unknown[];
};

export type ReplaceSpecification = {
  pattern?: unknown;
  replacement?: unknown;
  files?: string[];
  dry_run?: boolean;
  dryRun?: boolean;
};

export type CommandExecutionSpec = EditSpecification | ReplaceSpecification;

export type CommandPreview = {
  stdoutPreview?: string | null;
  stderrPreview?: string | null;
  execution?: CommandExecution | null;
};

export type CommandResult = {
  exit_code?: number | null;
  killed?: boolean;
};

export type SummaryLine =
  | { kind: 'arrow'; text: string }
  | { kind: 'indent'; text: string }
  | { kind: 'error-arrow'; text: string }
  | { kind: 'error-indent'; text: string }
  | { kind: 'exit-code'; text: string; status: 'success' | 'error' };

export type CommandRenderData = {
  type: string;
  detail: string;
  description: string;
  summaryLines: SummaryLine[];
};

type SummaryContext = {
  command: Command;
  result: CommandResult | null | undefined;
  preview: CommandPreview;
  execution: CommandExecution;
  summaryLines: SummaryLine[];
};

export function normalizePreviewLines(preview: string | null | undefined): string[] {
  if (!preview) {
    return [];
  }
  const lines = String(preview).split('\n');
  while (lines.length > 0 && lines[lines.length - 1].trim() === '') {
    lines.pop();
  }
  return lines;
}

export function inferCommandType(
  command: Command | null | undefined,
  execution: CommandExecution | null | undefined,
): string {
  if (!command || typeof command !== 'object') {
    return 'EXECUTE';
  }

  if (execution?.type) {
    return String(execution.type).toUpperCase();
  }

  if (command.edit) return 'EDIT';
  if (command.replace) return 'REPLACE';

  return 'EXECUTE';
}

function pluralize(word: string, count: number): string {
  return `${word}${count === 1 ? '' : 's'}`;
}

const isEditSpecification = (value: unknown): value is EditSpecification =>
  Boolean(value) && typeof value === 'object';

const isReplaceSpecification = (value: unknown): value is ReplaceSpecification =>
  Boolean(value) && typeof value === 'object';

function buildEditDetail(spec: EditSpecification): string {
  const parts: string[] = [];
  if (typeof spec.path === 'string') {
    parts.push(spec.path);
  }
  if (typeof spec.encoding === 'string') {
    parts.push(spec.encoding);
  }
  const edits = Array.isArray(spec.edits) ? spec.edits : [];
  const editCount = edits.length;
  parts.push(`${editCount} ${pluralize('edit', editCount)}`);
  return `(${parts.join(', ')})`;
}

function buildReplaceDetail(spec: ReplaceSpecification): string {
  const parts: string[] = [];
  if ('pattern' in spec) {
    parts.push(`pattern: ${JSON.stringify(spec.pattern ?? '')}`);
  }
  if ('replacement' in spec) {
    parts.push(`replacement: ${JSON.stringify(spec.replacement ?? '')}`);
  }
  const files = Array.isArray(spec.files) ? spec.files.filter(Boolean) : [];
  if (files.length > 0) {
    parts.push(`[${files.join(', ')}]`);
  }
  if (spec.dry_run || spec.dryRun) {
    parts.push('dry-run');
  }
  return `(${parts.join(', ')})`;
}

export function buildHeadingDetail(
  type: string,
  execution: CommandExecution | null | undefined,
  command: Command | null | undefined,
): string {
  switch (type) {
    case 'EDIT': {
      const specCandidate = execution?.spec ?? command?.edit;
      const spec: EditSpecification = isEditSpecification(specCandidate) ? specCandidate : {};
      return buildEditDetail(spec);
    }
    case 'REPLACE': {
      const specCandidate = execution?.spec ?? command?.replace;
      const spec: ReplaceSpecification = isReplaceSpecification(specCandidate) ? specCandidate : {};
      return buildReplaceDetail(spec);
    }
    default: {
      // Execute headings stay focused on status so the syntax-highlighted
      // preview remains the single source of shell content.
      return '';
    }
  }
}

export function extractCommandDescription(
  command: Command | null | undefined,
  execution: CommandExecution | null | undefined,
): string {
  const candidates: Array<string | null | undefined> = [
    command?.description,
    execution?.command?.description,
    execution?.description,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === 'string') {
      const trimmed = candidate.trim();
      if (trimmed) {
        return trimmed;
      }
    }
  }

  return '';
}

function appendStdErr(summaryLines: SummaryLine[], stderrPreview: string | null | undefined): void {
  const stderrLines = normalizePreviewLines(stderrPreview);
  if (stderrLines.length === 0) {
    return;
  }

  summaryLines.push({ kind: 'error-arrow', text: `STDERR: ${stderrLines[0]}` });
  for (const line of stderrLines.slice(1)) {
    summaryLines.push({ kind: 'error-indent', text: line });
  }
}

function summarizeEditOrReplace({ preview, summaryLines }: SummaryContext): void {
  const stdoutLines = normalizePreviewLines(preview.stdoutPreview ?? undefined);
  if (stdoutLines.length === 0) {
    return;
  }
  summaryLines.push({ kind: 'arrow', text: stdoutLines[0] });
  for (const line of stdoutLines.slice(1)) {
    summaryLines.push({ kind: 'indent', text: line });
  }
}

function summarizeExecute({ preview, summaryLines }: SummaryContext): void {
  const stdoutLines = normalizePreviewLines(preview.stdoutPreview ?? undefined);
  if (stdoutLines.length === 0) {
    return;
  }
  summaryLines.push({ kind: 'arrow', text: stdoutLines[0] });
  if (stdoutLines.length > 2) {
    const middleCount = stdoutLines.length - 2;
    summaryLines.push({
      kind: 'indent',
      text: `+ ${middleCount} more ${pluralize('line', middleCount)}`,
    });
  }
  if (stdoutLines.length > 1) {
    summaryLines.push({ kind: 'indent', text: stdoutLines[stdoutLines.length - 1] });
  }
}

export function buildCommandRenderData(
  command: Command | null | undefined,
  result: CommandResult | null | undefined,
  preview: CommandPreview = {},
  execution: CommandExecution | null | undefined = {},
): CommandRenderData | null {
  if (!command || typeof command !== 'object') {
    return null;
  }

  const normalizedExecution: CommandExecution =
    execution && typeof execution === 'object'
      ? execution
      : preview.execution && typeof preview.execution === 'object'
        ? preview.execution
        : {};
  const type = inferCommandType(command, normalizedExecution).toUpperCase();
  const detail = buildHeadingDetail(type, normalizedExecution, command);
  const description = extractCommandDescription(command, normalizedExecution);
  const summaryLines: SummaryLine[] = [];

  const summaryContext: SummaryContext = {
    command,
    result,
    preview,
    execution: normalizedExecution,
    summaryLines,
  };

  if (type === 'EDIT' || type === 'REPLACE') {
    summarizeEditOrReplace(summaryContext);
  } else {
    summarizeExecute(summaryContext);
  }

  if (summaryLines.length === 0 && result?.exit_code === 0 && !preview.stderrPreview) {
    summaryLines.push({ kind: 'arrow', text: 'Command completed successfully.' });
  }

  if (preview.stderrPreview) {
    appendStdErr(summaryLines, preview.stderrPreview);
  }

  if (result) {
    if (typeof result.exit_code === 'number') {
      summaryLines.push({
        kind: 'exit-code',
        text: `Exit code: ${result.exit_code}`,
        status: result.exit_code === 0 ? 'success' : 'error',
      });
    }
    if (result.killed) {
      summaryLines.push({ kind: 'indent', text: 'Process terminated (timeout).' });
    }
  }

  if (summaryLines.length === 0) {
    summaryLines.push({ kind: 'arrow', text: 'No output.' });
  }

  return {
    type,
    detail,
    description,
    summaryLines,
  };
}

export default {
  normalizePreviewLines,
  inferCommandType,
  buildHeadingDetail,
  extractCommandDescription,
  buildCommandRenderData,
};
