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

marked.setOptions({
  renderer: new TerminalRenderer({
    reflowText: false,
    tab: 2,
  }),
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

function renderMarkdownMessage(message) {
  const prepared = wrapStructuredContent(message);
  return marked.parse(prepared);
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
    commandLines.push('');
    commandLines.push(...command.run.split('\n').map((line) => chalk.yellow(line)));
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
    display('STDOUT', stdout, 'white');
  }

  if (stderr) {
    display('STDERR', stderr, 'red');
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
};
