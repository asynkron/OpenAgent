/**
 * Terminal rendering helpers preserved for backwards compatibility with tests
 * and programmatic consumers. The CLI itself now uses Ink components, but these
 * functions reuse the same formatting logic so existing suites continue to work.
 */

import chalk from 'chalk';
import { marked, type Renderer } from 'marked';
import markedTerminal from 'marked-terminal';

import {
  createPlanNodes,
  type PlanNode,
  type PlanNodeColor,
  type PlanStep,
} from './components/planUtils.js';
import {
  computeProgressState,
  type PlanProgress,
  type ProgressState,
} from './components/progressUtils.js';
import {
  buildCommandRenderData,
  type Command,
  type CommandResult,
  type CommandPreview,
  type CommandExecution,
  type CommandRenderData,
  type SummaryLine,
} from './components/commandUtils.js';

type CommandRenderOutput = CommandPreview & {
  execution?: CommandExecution | null;
  [key: string]: unknown;
};

type TerminalRendererCtor = new (options: unknown) => Renderer;

const TerminalRendererModule = markedTerminal as unknown as {
  default?: TerminalRendererCtor;
} & TerminalRendererCtor;

const TerminalRenderer: TerminalRendererCtor =
  TerminalRendererModule.default ?? (TerminalRendererModule as TerminalRendererCtor);

const terminalRenderer = new TerminalRenderer({
  reflowText: false,
  tab: 2,
});

const PLAN_SYMBOL_COLORS: Record<PlanNodeColor, (value: string) => string> = {
  yellow: chalk.yellow,
  green: chalk.green,
  red: chalk.red,
  gray: chalk.gray,
};

export function display(
  _label: string,
  content: string | string[],
  _color: string = 'white',
): void {
  if (!content || (Array.isArray(content) && content.length === 0)) {
    return;
  }

  const text = Array.isArray(content) ? content.join('\n') : String(content);
  console.log(text);
}

export function wrapStructuredContent(message: unknown): string {
  if (!message) {
    return '';
  }

  return String(message).trim();
}

export function renderMarkdownMessage(message: unknown): string {
  const prepared = wrapStructuredContent(message);
  const rendered = marked.parse(prepared, { renderer: terminalRenderer });
  return typeof rendered === 'string' ? rendered.trimEnd() : String(rendered).trimEnd();
}

function colorizeSymbol(symbol: string, color: PlanNodeColor): string {
  const colorize = PLAN_SYMBOL_COLORS[color];
  return colorize ? colorize(symbol) : symbol;
}

export function renderPlan(plan: PlanStep[] | null | undefined): void {
  const nodes: PlanNode[] = createPlanNodes(plan);
  if (nodes.length === 0) {
    return;
  }

  const lines = nodes.map((node) => {
    const indent = '  '.repeat(node.depth);
    const symbol = colorizeSymbol(node.symbol, node.color);
    const label = chalk.cyan(node.label);
    const dot = chalk.dim('.');
    const title = node.title ? ` ${chalk.white(node.title)}` : '';
    const statusPart = node.status ? ` ${chalk.dim(`[${node.status}]`)}` : '';
    const metaDetails = [];
    if (Number.isFinite(node.priority)) {
      metaDetails.push(`priority ${node.priority}`);
    }
    if (node.blocked && Array.isArray(node.waitingFor) && node.waitingFor.length > 0) {
      metaDetails.push(`waiting for ${node.waitingFor.join(', ')}`);
    }
    const metaPart = metaDetails.length > 0 ? ` ${chalk.dim(`(${metaDetails.join(', ')})`)}` : '';
    const commandPart = node.commandPreview
      ? ` ${chalk.gray('—')} ${chalk.white(node.commandPreview)}`
      : '';
    return `${indent}${symbol} ${label}${dot}${title}${statusPart}${metaPart}${commandPart}`.trimEnd();
  });

  display('Plan', lines, 'cyan');
}

export function renderPlanProgress(progress: PlanProgress | null | undefined): void {
  const state: ProgressState = computeProgressState(progress);

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

export function renderMessage(message: unknown): void {
  if (!message) return;

  const rendered = renderMarkdownMessage(message);
  display('AI', rendered, 'magenta');
}

function formatHeading(label: string, detail: string): string {
  const padded = label.padEnd(1);
  const suffix = detail ? ` ${detail}` : '';
  return ` ${chalk.blueBright(chalk.bold(padded))}${suffix}`;
}

function arrowLine(text: string): string {
  return chalk.dim(` └ ${text}`);
}

function errorArrowLine(text: string): string {
  return chalk.red(` └ ${text}`);
}

function errorIndentLine(text: string): string {
  return chalk.red(`   ${text}`);
}

function indentLine(text: string): string {
  return chalk.dim(`   ${text}`);
}

function exitCodeLine(line: Extract<SummaryLine, { kind: 'exit-code' }>): string {
  const prefix = chalk.dim('   ');
  const colorize = line.status === 'success' ? chalk.green : chalk.red;
  return `${prefix}${colorize(line.text)}`;
}

function formatSummaryLines(summaryLines: SummaryLine[]): string[] {
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

export function renderCommand(
  command: Command | null | undefined,
  result: CommandResult | null | undefined,
  output: CommandRenderOutput = {},
): void {
  if (!command || typeof command !== 'object') {
    return;
  }

  const execution: CommandExecution =
    output?.execution && typeof output.execution === 'object' ? output.execution : {};
  const data: CommandRenderData | null = buildCommandRenderData(command, result, output, execution);
  if (!data) {
    return;
  }

  const { type, detail, description, summaryLines } = data;
  const lines: string[] = [];

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
