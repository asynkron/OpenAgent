/**
 * Terminal rendering helpers preserved for backwards compatibility with tests
 * and programmatic consumers. The CLI itself now uses Ink components, but these
 * functions reuse the same formatting logic so existing suites continue to work.
 */

import chalk from 'chalk';
import { marked } from 'marked';
import markedTerminal from 'marked-terminal';

import { createPlanNodes } from './components/planUtils.js';
import { computeProgressState } from './components/progressUtils.js';
import { buildCommandRenderData } from './components/commandUtils.js';

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
  const rendered = marked.parse(prepared, { renderer: terminalRenderer });
  return typeof rendered === 'string' ? rendered.trimEnd() : rendered;
}

function colorizeSymbol(symbol, color) {
  if (!color || typeof chalk[color] !== 'function') {
    return symbol;
  }
  return chalk[color](symbol);
}

export function renderPlan(plan) {
  const nodes = createPlanNodes(plan);
  if (nodes.length === 0) {
    return;
  }

  const lines = nodes.map((node) => {
    const symbol = colorizeSymbol(node.symbol, node.color);
    const title = node.title ? chalk.white(node.title) : chalk.dim('(untitled task)');
    const statusPart = chalk.dim(`[${node.status || 'pending'}]`);
    const priorityPart = Number.isFinite(node.priority)
      ? chalk.dim(`priority ${node.priority}`)
      : chalk.dim('priority ∞');
    const agePart = chalk.dim(`age ${node.age ?? 0}`);
    const idPart = node.id ? chalk.cyan(`id ${node.id}`) : '';
    let readinessPart = '';
    if (node.waitingForId.length > 0) {
      readinessPart = node.hasMissingDependencies
        ? chalk.red(
            `waiting on ${node.waitingLabel ? `${node.waitingLabel} (missing)` : 'missing tasks'}`,
          )
        : chalk.dim(`waiting on ${node.waitingLabel}`);
    } else if (node.canExecute) {
      readinessPart = chalk.green('ready to run');
    } else {
      readinessPart = chalk.dim('waiting');
    }

    const metaParts = [statusPart, priorityPart, agePart];
    if (idPart) {
      metaParts.push(idPart);
    }
    if (readinessPart) {
      metaParts.push(readinessPart);
    }

    const commandPart = node.commandPreview
      ? ` ${chalk.gray('—')} ${chalk.white(node.commandPreview)}`
      : '';

    return `${symbol} ${title} (${metaParts.filter(Boolean).join(', ')})${commandPart}`.trimEnd();
  });

  display('Plan', lines, 'cyan');
}

export function renderPlanProgress(progress) {
  const state = computeProgressState(progress);

  if (state.total <= 0) {
    console.log(chalk.blueBright('Plan progress: ') + chalk.dim('no active steps yet.'));
    return;
  }

  const filledBar = state.filled > 0 ? chalk.green('█'.repeat(state.filled)) : '';
  const emptyBar = state.empty > 0 ? chalk.gray('░'.repeat(state.empty)) : '';
  const percentLabel = `${Math.round(state.normalized * 100)}%`;
  const summary = `${state.completed}/${state.total}`;

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

function errorArrowLine(text) {
  return chalk.red(` └ ${text}`);
}

function errorIndentLine(text) {
  return chalk.red(`   ${text}`);
}

function indentLine(text) {
  return chalk.dim(`   ${text}`);
}

function exitCodeLine(line) {
  const prefix = chalk.dim('   ');
  const colorize = line.status === 'success' ? chalk.green : chalk.red;
  return `${prefix}${colorize(line.text)}`;
}

function formatSummaryLines(summaryLines) {
  return summaryLines.map((line) => {
    switch (line.kind) {
      case 'error-arrow':
        return errorArrowLine(line.text);
      case 'error-indent':
        return errorIndentLine(line.text);
      case 'exit-code':
        return exitCodeLine(line);
      case 'indent':
        return indentLine(line.text);
      case 'arrow':
      default:
        return arrowLine(line.text);
    }
  });
}

export function renderCommand(command, result, output = {}) {
  if (!command || typeof command !== 'object') {
    return;
  }

  const execution = output?.execution || {};
  const data = buildCommandRenderData(command, result, output, execution);
  if (!data) {
    return;
  }

  const { type, detail, description, summaryLines } = data;
  const lines = [];

  if (description) {
    lines.push(` ${chalk.blueBright(chalk.bold('DESCRIPTION'))} ${chalk.white(description)}`);
  }

  lines.push(formatHeading(type, detail));
  lines.push(...formatSummaryLines(summaryLines));

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
  renderPlanProgress,
};
