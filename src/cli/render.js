"use strict";

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

const chalk = require('chalk');
const { marked } = require('marked');
const markedTerminal = require('marked-terminal');
const TerminalRenderer = markedTerminal.default || markedTerminal;
const { shellSplit } = require('../utils/text');

const terminalRenderer = new TerminalRenderer({
  reflowText: false,
  tab: 2,
});

function display(label, content, color = 'white') {
  if (!content || (Array.isArray(content) && content.length === 0)) {
    return;
  }

  const text = Array.isArray(content) ? content.join('\n') : String(content);
  const borderColor = typeof color === 'string' ? color : 'white';
  const chalkColorFn = chalk[borderColor] || chalk.white;
  const header = `${label} ______________`;

  console.log('');
  console.log(chalkColorFn.bold(header));
  console.log(text);
}

const CONTENT_TYPE_DETECTORS = [
  { pattern: /(^|\n)diff --git /, language: 'diff' },
  { pattern: /python3\s*-+\s*<<\s*['"]?PY['"]?/i, language: 'python' },
];

function wrapStructuredContent(message) {
  if (!message) {
    return '';
  }

  const trimmed = message.trim();

  if (/```/.test(trimmed)) {
    return trimmed;
  }

  for (const detector of CONTENT_TYPE_DETECTORS) {
    if (detector.pattern.test(trimmed)) {
      return `\`\`\`${detector.language}\n${trimmed}\n\`\`\``;
    }
  }

  return trimmed;
}

function wrapWithLanguageFence(text, fallbackLanguage = 'plaintext') {
  if (text === undefined || text === null) {
    return '';
  }

  const content = String(text);
  if (!content.trim() || /```/.test(content)) {
    return content;
  }

  const { language } = highlightAuto(content) || {};
  const detectedLanguage = language || fallbackLanguage;

  return `\`\`\`${detectedLanguage}\n${content}\n\`\`\``;
}

function renderMarkdownMessage(message) {
  const prepared = wrapStructuredContent(message);
  return marked.parse(prepared, { renderer: terminalRenderer });
}

function renderPlan(plan) {
  if (!plan || !Array.isArray(plan) || plan.length === 0) return;

  const planLines = plan.map((item) => {
    const statusSymbol =
      item.status === 'completed'
        ? chalk.green('✔')
        : item.status === 'running'
          ? chalk.yellow('▶')
          : chalk.gray('•');
    const stepLabel = chalk.cyan(`Step ${item.step}`);
    const title = chalk.white(item.title);
    return `${statusSymbol} ${stepLabel} ${chalk.dim('-')} ${title}`;
  });

  display('Plan', planLines, 'cyan');
}

function renderMessage(message) {
  if (!message) return;

  const rendered = renderMarkdownMessage(message);
  display('AI', rendered, 'magenta');
}

function renderCommand(command) {
  if (!command) return;

  const commandLines = [
    `${chalk.cyan('Shell')}: ${command.shell || 'bash'}`,
    `${chalk.cyan('Directory')}: ${command.cwd || '.'}`,
    `${chalk.cyan('Timeout')}: ${command.timeout_sec ?? 60}s`,
  ];

  if (command.run) {
    //this is correct
    const fencedCommand = wrapWithLanguageFence(command.run, 'bash');
    const renderedCommand = renderMarkdownMessage(fencedCommand);
    commandLines.push('');
    commandLines.push(renderedCommand);
  }

  display('Command', commandLines, 'yellow');
}

function renderCommandResult(result, stdout, stderr) {
  const statusLines = [
    `${chalk.cyan('Exit Code')}: ${result.exit_code}`,
    `${chalk.cyan('Runtime')}: ${result.runtime_ms}ms`,
    `${chalk.cyan('Status')}: ${result.killed ? chalk.red('KILLED (timeout)') : chalk.green('COMPLETED')}`,
  ];

  display('Command Result', statusLines, 'green');

  if (stdout) {
    const fencedStdout = wrapWithLanguageFence(stdout, 'plaintext');
    const renderedStdout = renderMarkdownMessage(fencedStdout);
    display('STDOUT', renderedStdout, 'white');
  }

  if (stderr) {
    const fencedStderr = wrapWithLanguageFence(stderr, 'plaintext');
    const renderedStderr = renderMarkdownMessage(fencedStderr);
    display('STDERR', renderedStderr, 'red');
  }
}

module.exports = {
  display,
  wrapStructuredContent,
  renderMarkdownMessage,
  renderPlan,
  renderMessage,
  renderCommand,
  renderCommandResult,
  wrapWithLanguageFence,
};
