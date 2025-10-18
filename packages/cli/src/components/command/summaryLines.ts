import type {
  CommandPreviewPayload,
  CommandRenderType,
  CommandResultPayload,
  SummaryLine,
} from './commandTypes.js';
import { extractStdoutLines, extractStderrLines } from './previewLines.js';

function pluralize(word: string, count: number): string {
  return `${word}${count === 1 ? '' : 's'}`;
}

function buildStdoutSummary(type: CommandRenderType, preview: CommandPreviewPayload): SummaryLine[] {
  const stdoutLines = extractStdoutLines(preview);
  if (stdoutLines.length === 0) {
    return [];
  }

  if (type === 'EDIT' || type === 'REPLACE') {
    const lines: SummaryLine[] = [{ kind: 'arrow', text: stdoutLines[0] }];
    stdoutLines.slice(1).forEach((line) => {
      lines.push({ kind: 'indent', text: line });
    });
    return lines;
  }

  const lines: SummaryLine[] = [{ kind: 'arrow', text: stdoutLines[0] }];
  if (stdoutLines.length > 2) {
    const middleCount = stdoutLines.length - 2;
    lines.push({ kind: 'indent', text: `+ ${middleCount} more ${pluralize('line', middleCount)}` });
  }
  if (stdoutLines.length > 1) {
    lines.push({ kind: 'indent', text: stdoutLines[stdoutLines.length - 1] });
  }
  return lines;
}

function buildStderrSummary(preview: CommandPreviewPayload): SummaryLine[] {
  const stderrLines = extractStderrLines(preview);
  if (stderrLines.length === 0) {
    return [];
  }

  const [first, ...rest] = stderrLines;
  const lines: SummaryLine[] = [{ kind: 'error-arrow', text: `STDERR: ${first}` }];
  rest.forEach((line) => {
    lines.push({ kind: 'error-indent', text: line });
  });
  return lines;
}

function buildResultSummary(result: CommandResultPayload | null | undefined): SummaryLine[] {
  if (!result) {
    return [];
  }

  const lines: SummaryLine[] = [];
  if (typeof result.exit_code === 'number') {
    lines.push({
      kind: 'exit-code',
      text: `Exit code: ${result.exit_code}`,
      status: result.exit_code === 0 ? 'success' : 'error',
    });
  }
  if (result.killed) {
    lines.push({ kind: 'indent', text: 'Process terminated (timeout).' });
  }
  return lines;
}

function ensureNonEmptySummary(lines: SummaryLine[]): SummaryLine[] {
  if (lines.length === 0) {
    return [{ kind: 'arrow', text: 'No output.' }];
  }
  return lines;
}

export interface SummaryBuildInput {
  type: CommandRenderType;
  preview: CommandPreviewPayload;
  result: CommandResultPayload | null | undefined;
}

export function buildSummaryLines({ type, preview, result }: SummaryBuildInput): SummaryLine[] {
  const summaryLines: SummaryLine[] = [];
  summaryLines.push(...buildStdoutSummary(type, preview));

  if (summaryLines.length === 0 && result?.exit_code === 0 && !preview.stderrPreview) {
    summaryLines.push({ kind: 'arrow', text: 'Command completed successfully.' });
  }

  summaryLines.push(...buildStderrSummary(preview));
  summaryLines.push(...buildResultSummary(result));

  return ensureNonEmptySummary(summaryLines);
}
