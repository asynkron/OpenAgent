/**
 * Shared formatting helpers for command summaries across Ink components and
 * compatibility console renderers.
 */

export function normalizePreviewLines(preview) {
  if (!preview) {
    return [];
  }
  const lines = String(preview).split('\n');
  while (lines.length > 0 && lines[lines.length - 1].trim() === '') {
    lines.pop();
  }
  return lines;
}

export function inferCommandType(command, execution) {
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

function pluralize(word, count) {
  return `${word}${count === 1 ? '' : 's'}`;
}

export function buildHeadingDetail(type, execution, command) {
  switch (type) {
    case 'EDIT': {
      const spec = execution?.spec || command?.edit || {};
      const parts = [];
      if (spec.path) {
        parts.push(spec.path);
      }
      if (spec.encoding) {
        parts.push(spec.encoding);
      }
      const editCount = Array.isArray(spec.edits) ? spec.edits.length : 0;
      parts.push(`${editCount} ${pluralize('edit', editCount)}`);
      return `(${parts.join(', ')})`;
    }
    case 'REPLACE': {
      const spec = execution?.spec || command?.replace || {};
      const parts = [];
      if (spec.pattern !== undefined) {
        parts.push(`pattern: ${JSON.stringify(spec.pattern ?? '')}`);
      }
      if (spec.replacement !== undefined) {
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
    default: {
      const runValue =
        (execution?.command && typeof execution.command.run === 'string'
          ? execution.command.run
          : typeof command?.run === 'string'
            ? command.run
            : '') || '';
      const trimmed = runValue.trim();
      return `(${trimmed || 'shell command'})`;
    }
  }
}

export function extractCommandDescription(command, execution) {
  const candidates = [
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

function appendStdErr(summaryLines, stderrPreview) {
  const stderrLines = normalizePreviewLines(stderrPreview);
  if (stderrLines.length === 0) {
    return;
  }

  summaryLines.push({ kind: 'error-arrow', text: `STDERR: ${stderrLines[0]}` });
  for (const line of stderrLines.slice(1)) {
    summaryLines.push({ kind: 'error-indent', text: line });
  }
}

function summarizeEditOrReplace({ preview, summaryLines }) {
  const stdoutLines = normalizePreviewLines(preview.stdoutPreview);
  if (stdoutLines.length === 0) {
    return;
  }
  summaryLines.push({ kind: 'arrow', text: stdoutLines[0] });
  for (const line of stdoutLines.slice(1)) {
    summaryLines.push({ kind: 'indent', text: line });
  }
}

function summarizeExecute({ preview, summaryLines }) {
  const stdoutLines = normalizePreviewLines(preview.stdoutPreview);
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

export function buildCommandRenderData(command, result, preview = {}, execution = {}) {
  if (!command || typeof command !== 'object') {
    return null;
  }

  const normalizedExecution =
    execution && typeof execution === 'object' ? execution : preview.execution || {};
  const type = inferCommandType(command, normalizedExecution).toUpperCase();
  const detail = buildHeadingDetail(type, normalizedExecution, command);
  const description = extractCommandDescription(command, normalizedExecution);
  const summaryLines = [];

  const summaryContext = { command, result, preview, execution: normalizedExecution, summaryLines };

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
