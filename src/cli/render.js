/**
 * Terminal rendering helpers responsible for formatting assistant output.
 *
 * Responsibilities:
 * - Provide a consistent boxed layout for messages, plans, and command details.
 * - Wrap LLM output in Markdown and syntax-highlight structured content.
 *
 * Consumers:
 * - `src/agent/loop.js` renders plans, messages, commands, and results using these helpers.
 * - Root `index.js` re-exports the helpers for unit testing.
 */

import chalk from 'chalk';
import { marked } from 'marked';
import markedTerminal from 'marked-terminal';

const TerminalRenderer = markedTerminal.default || markedTerminal;

const terminalRenderer = new TerminalRenderer({
  reflowText: false,
  tab: 2,
});

export function display(_label, content, _color = 'white') {
  if (!content || (Array.isArray(content) && content.length === 0)) {
    return;
  }

  const text = Array.isArray(content) ? content.join('\n') : String(content);
  console.log(text);
}

export function wrapStructuredContent(message) {
  if (!message) {
    return '';
  }

  return String(message).trim();
}

export function renderMarkdownMessage(message) {
  const prepared = wrapStructuredContent(message);
  return marked.parse(prepared, { renderer: terminalRenderer });
}

export function renderPlan(plan) {
  if (!Array.isArray(plan) || plan.length === 0) return;

  const planLines = [];

  const resolveStatusSymbol = (status) => {
    const normalized = typeof status === 'string' ? status.toLowerCase() : '';

    if (normalized === 'completed' || normalized === 'done') {
      return chalk.green('✔');
    }

    if (normalized === 'running' || normalized === 'in_progress' || normalized === 'in-progress') {
      return chalk.yellow('▶');
    }

    if (normalized === 'blocked' || normalized === 'failed' || normalized === 'error') {
      return chalk.red('✖');
    }

    return chalk.gray('•');
  };

  const childKeys = ['substeps', 'children', 'steps'];

  const traverse = (items, ancestors = [], depth = 0) => {
    if (!Array.isArray(items) || items.length === 0) {
      return;
    }

    items.forEach((item, index) => {
      if (!item || typeof item !== 'object') {
        return;
      }

      const rawStep = item.step !== undefined && item.step !== null ? String(item.step).trim() : '';
      const sanitizedStep = rawStep.replace(/\.+$/, '');
      const hasExplicitStep = sanitizedStep.length > 0;

      const baseStep = hasExplicitStep ? sanitizedStep : String(index + 1);
      const usesAbsolutePath = hasExplicitStep && sanitizedStep.includes('.');

      const labelParts = usesAbsolutePath
        ? sanitizedStep.split('.').filter((part) => part.length > 0)
        : [...ancestors, baseStep];

      const stepLabel = labelParts.join('.');

      const indent = '  '.repeat(depth);
      const statusSymbol = resolveStatusSymbol(item.status);
      const title = chalk.white(item.title ?? '');

      planLines.push(
        `${indent}${statusSymbol} ${chalk.cyan(`${stepLabel}`)}${chalk.dim('.')} ${title}`,
      );

      const childKey = childKeys.find((key) => Array.isArray(item[key]));
      if (childKey) {
        traverse(item[childKey], labelParts, depth + 1);
      }
    });
  };

  traverse(plan);

  if (planLines.length === 0) {
    return;
  }

  display('Plan', planLines, 'cyan');
}

// Render a compact progress indicator so humans can track plan completion at a glance.
export function renderPlanProgress(progress) {
  if (!progress || typeof progress !== 'object') {
    return;
  }

  const total = Number.isFinite(progress.totalSteps) ? progress.totalSteps : 0;
  const completed = Number.isFinite(progress.completedSteps) ? progress.completedSteps : 0;
  const ratio = Number.isFinite(progress.ratio)
    ? progress.ratio
    : total > 0
      ? completed / total
      : 0;

  if (total <= 0) {
    console.log(chalk.blueBright('Plan progress: ') + chalk.dim('no active steps yet.'));
    return;
  }

  const normalized = Math.min(1, Math.max(0, ratio));
  const barWidth = 20;
  let filled = Math.round(normalized * barWidth);
  if (normalized > 0 && filled === 0) {
    filled = 1;
  }
  if (normalized >= 1) {
    filled = barWidth;
  }
  const empty = Math.max(0, barWidth - filled);

  const filledBar = filled > 0 ? chalk.green('█'.repeat(filled)) : '';
  const emptyBar = empty > 0 ? chalk.gray('░'.repeat(empty)) : '';
  const percentLabel = `${Math.round(normalized * 100)}%`;
  const summary = `${completed}/${total}`;

  console.log(
    `${chalk.blueBright('Plan progress: ')}${filledBar}${emptyBar} ${chalk.bold(percentLabel)} (${summary})`,
  );
}

export function renderMessage(message) {
  if (!message) return;

  const rendered = renderMarkdownMessage(message);
  display('AI', rendered, 'magenta');
}

function formatHeading(label, detail) {
  const padded = label.padEnd(1);
  const suffix = detail ? ` ${detail}` : '';
  return ` ${chalk.blueBright(chalk.bold(padded))}${suffix}`;
}

function arrowLine(text) {
  return chalk.dim(` └ ${text}`);
}

function indentLine(text) {
  return chalk.dim(`   ${text}`);
}

function pluralize(word, count) {
  return `${word}${count === 1 ? '' : 's'}`;
}

function normalizePreviewLines(preview) {
  if (!preview) {
    return [];
  }
  const lines = String(preview).split('\n');
  while (lines.length > 0 && lines[lines.length - 1].trim() === '') {
    lines.pop();
  }
  return lines;
}

function collectReadPaths(spec) {
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

function parseReadSegments(stdout) {
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

function inferCommandType(command) {
  if (!command || typeof command !== 'object') {
    return 'EXECUTE';
  }

  if (command.edit) return 'EDIT';
  if (command.read) return 'READ';
  if (command.replace) return 'REPLACE';

  const runValue = typeof command.run === 'string' ? command.run.trim() : '';
  if (runValue) {
    const keyword = runValue.split(/\s+/)[0]?.toLowerCase();
    if (keyword === 'read') {
      return 'READ';
    }
  }

  return 'EXECUTE';
}

function buildHeadingDetail(type, execution, command) {
  switch (type) {
    case 'READ': {
      const spec = execution?.spec || command?.read || {};
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

function extractCommandDescription(command, execution) {
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
  summaryLines.push(arrowLine(`STDERR: ${stderrLines[0]}`));
  for (const line of stderrLines.slice(1)) {
    summaryLines.push(indentLine(line));
  }
}

export function renderCommand(command, result, output = {}) {
  if (!command || typeof command !== 'object') {
    return;
  }

  const execution = output.execution || {};
  const type = (execution.type || inferCommandType(command)).toUpperCase();
  const detail = buildHeadingDetail(type, execution, command);
  const description = extractCommandDescription(command, execution);
  const summaryLines = [];

  if (type === 'READ') {
    const filtersApplied = Boolean(command?.filter_regex || command?.tail_lines);
    const spec = execution?.spec || command?.read || {};
    const paths = collectReadPaths(spec);

    let segments = parseReadSegments(output.stdout);
    if (segments.length === 0 && !filtersApplied && result?.stdout) {
      const fallbackSegments = parseReadSegments(result.stdout);
      if (fallbackSegments.length > 0) {
        segments = fallbackSegments;
      }
    }

    if (segments.length > 0) {
      const totalLines = segments.reduce((acc, item) => acc + item.lineCount, 0);
      summaryLines.push(
        arrowLine(
          `Read ${totalLines} ${pluralize('line', totalLines)} from ${segments.length} ${pluralize(
            'file',
            segments.length,
          )}.`,
        ),
      );
      for (const segment of segments) {
        const label = segment.path || '(unknown path)';
        summaryLines.push(
          indentLine(`${label}: ${segment.lineCount} ${pluralize('line', segment.lineCount)}`),
        );
      }
    } else if (paths.length > 0) {
      const fileCount = paths.length;
      const baseMessage = filtersApplied
        ? `No lines matched the applied filters across ${fileCount} ${pluralize('file', fileCount)}.`
        : `Read 0 lines from ${fileCount} ${pluralize('file', fileCount)}.`;
      summaryLines.push(arrowLine(baseMessage));
      for (const label of paths) {
        summaryLines.push(indentLine(`${label}: 0 lines`));
      }
    }
  } else if (type === 'EDIT' || type === 'REPLACE') {
    const stdoutLines = normalizePreviewLines(output.stdoutPreview);
    if (stdoutLines.length > 0) {
      summaryLines.push(arrowLine(stdoutLines[0]));
      for (const line of stdoutLines.slice(1)) {
        summaryLines.push(indentLine(line));
      }
    }
  } else {
    const stdoutLines = normalizePreviewLines(output.stdoutPreview);
    if (stdoutLines.length > 0) {
      summaryLines.push(arrowLine(stdoutLines[0]));
      if (stdoutLines.length > 2) {
        const middleCount = stdoutLines.length - 2;
        summaryLines.push(indentLine(`+ ${middleCount} more ${pluralize('line', middleCount)}`));
      }
      if (stdoutLines.length > 1) {
        summaryLines.push(indentLine(stdoutLines[stdoutLines.length - 1]));
      }
    }
  }

  if (summaryLines.length === 0 && result?.exit_code === 0 && !output.stderrPreview) {
    summaryLines.push(arrowLine('Command completed successfully.'));
  }

  if (output.stderrPreview) {
    appendStdErr(summaryLines, output.stderrPreview);
  }

  if (result) {
    if (typeof result.exit_code === 'number' && result.exit_code !== 0) {
      summaryLines.push(indentLine(`Exit code: ${result.exit_code}`));
    }
    if (result.killed) {
      summaryLines.push(indentLine('Process terminated (timeout).'));
    }
  }

  if (summaryLines.length === 0) {
    summaryLines.push(arrowLine('No output.'));
  }

  const lines = [];
  if (description) {
    lines.push(` ${chalk.blueBright(chalk.bold('DESCRIPTION'))} ${chalk.white(description)}`);
  }
  lines.push(formatHeading(type, detail));
  lines.push(...summaryLines);

  console.log('');
  console.log(lines.join('\n'));
}

export default {
  display,
  wrapStructuredContent,
  renderMarkdownMessage,
  renderPlan,
  renderMessage,
  renderCommand,
};
