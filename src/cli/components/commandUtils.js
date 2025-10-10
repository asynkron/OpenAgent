import { extractReadSpecFromCommand, normalizeReadCommand } from '../../commands/read.js';

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

export function collectReadPaths(spec) {
  const paths = [];
  if (!spec || typeof spec !== 'object') {
    return paths;
  }

  const addPath = (candidate) => {
    if (typeof candidate !== 'string') {
      return;
    }
    const trimmed = candidate.trim();
    if (!trimmed || paths.includes(trimmed)) {
      return;
    }
    paths.push(trimmed);
  };

  addPath(spec.path);
  if (Array.isArray(spec.paths)) {
    for (const candidate of spec.paths) {
      addPath(candidate);
    }
  }

  return paths;
}

export function parseReadSegments(stdout) {
  if (!stdout) {
    return [];
  }

  const lines = String(stdout).split('\n');
  const segments = [];
  let current = null;

  for (const line of lines) {
    if (line.endsWith(':::')) {
      if (current) {
        const { path, content } = current;
        while (content.length > 0 && content[content.length - 1] === '') {
          content.pop();
        }
        segments.push({ path, lineCount: content.length });
      }
      current = { path: line.slice(0, -3), content: [] };
    } else if (current) {
      current.content.push(line);
    }
  }

  if (current) {
    const { path, content } = current;
    while (content.length > 0 && content[content.length - 1] === '') {
      content.pop();
    }
    segments.push({ path, lineCount: content.length });
  }

  return segments;
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

  const runValue = typeof command.run === 'string' ? command.run.trim() : '';
  if (runValue) {
    const specFromRun = extractReadSpecFromCommand(runValue);
    if (specFromRun) {
      return 'READ';
    }
    const keyword = runValue.split(/\s+/)[0]?.toLowerCase();
    if (keyword === 'read') {
      return 'READ';
    }
  }

  return 'EXECUTE';
}

function pluralize(word, count) {
  return `${word}${count === 1 ? '' : 's'}`;
}

export function buildHeadingDetail(type, execution, command) {
  switch (type) {
    case 'READ': {
      const spec =
        execution?.spec ||
        extractReadSpecFromCommand(command?.run) ||
        (typeof command?.run === 'string' ? normalizeReadCommand(command.run).spec : null) ||
        {};
      const paths = collectReadPaths(spec);
      return `([${paths.join(', ')}])`;
    }
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

function summarizeReadCommand({ command, result, preview, execution, summaryLines }) {
  const filtersApplied = Boolean(command?.filter_regex || command?.tail_lines);
  const spec =
    execution?.spec ||
    extractReadSpecFromCommand(command?.run) ||
    (typeof command?.run === 'string' ? normalizeReadCommand(command.run).spec : null) ||
    {};
  const paths = collectReadPaths(spec);

  let segments = parseReadSegments(preview.stdout);
  if (segments.length === 0 && !filtersApplied && result?.stdout) {
    const fallbackSegments = parseReadSegments(result.stdout);
    if (fallbackSegments.length > 0) {
      segments = fallbackSegments;
    }
  }

  if (segments.length > 0) {
    const totalLines = segments.reduce((acc, item) => acc + item.lineCount, 0);
    summaryLines.push({
      kind: 'arrow',
      text: `Read ${totalLines} ${pluralize('line', totalLines)} from ${segments.length} ${pluralize('file', segments.length)}.`,
    });
    for (const segment of segments) {
      const label = segment.path || '(unknown path)';
      summaryLines.push({
        kind: 'indent',
        text: `${label}: ${segment.lineCount} ${pluralize('line', segment.lineCount)}`,
      });
    }
  } else if (paths.length > 0) {
    const fileCount = paths.length;
    const baseMessage = filtersApplied
      ? `No lines matched the applied filters across ${fileCount} ${pluralize('file', fileCount)}.`
      : `Read 0 lines from ${fileCount} ${pluralize('file', fileCount)}.`;
    summaryLines.push({ kind: 'arrow', text: baseMessage });
    for (const label of paths) {
      summaryLines.push({ kind: 'indent', text: `${label}: 0 lines` });
    }
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

  if (type === 'READ') {
    summarizeReadCommand(summaryContext);
  } else if (type === 'EDIT' || type === 'REPLACE') {
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
  collectReadPaths,
  parseReadSegments,
  inferCommandType,
  buildHeadingDetail,
  extractCommandDescription,
  buildCommandRenderData,
};
