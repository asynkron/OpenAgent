'use strict';

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

const COMMAND_READERS = ['sed', 'cat', 'read', 'edit'];
const COMMAND_EXTENSION_MAPPINGS = [
  { extensions: ['md', 'markdown'], language: 'markdown' },
  { extensions: ['diff', 'patch'], language: 'diff' },
  { extensions: ['py'], language: 'python' },
  { extensions: ['js', 'jsx', 'mjs', 'cjs'], language: 'javascript' },
  { extensions: ['json'], language: 'json' },
  { extensions: ['html', 'htm'], language: 'html' },
  { extensions: ['sh', 'bash'], language: 'bash' },
];

const COMMAND_DETECTORS = COMMAND_EXTENSION_MAPPINGS.map(({ extensions, language }) => {
  const joinedExtensions = extensions.join('|');
  const pattern = new RegExp(
    String.raw`^\s*(?:${COMMAND_READERS.join('|')})\s+.*\.(${joinedExtensions})\b`,
    'i',
  );

  return { pattern, language };
});

const CONTENT_TYPE_DETECTORS = [
  { pattern: /(^|\n)diff --git /, language: 'diff' },
  ...COMMAND_DETECTORS,
  { pattern: /python3\s*-*\s*<<\s*['"]?PY['"]?/i, language: 'python' },
  { pattern: /node\s*-*\s*<<\s*['"]?NODE['"]?/i, language: 'javascript' },
  { pattern: /^\s*(\{[\s\S]*\}|\[[\s\S]*\])\s*$/, language: 'json' },
  { pattern: /^\s*<[^>]+>/, language: 'html' },
  { pattern: /^#!\s*.*python.*/i, language: 'python' },
  { pattern: /^#!\s*.*(?:bash|sh).*/i, language: 'bash' },
];

function inferLanguageFromDetectors(content) {
  for (const detector of CONTENT_TYPE_DETECTORS) {
    if (detector.pattern.test(content)) {
      return detector.language;
    }
  }

  return null;
}
function wrapStructuredContent(message) {
  if (!message) {
    return '';
  }

  const trimmed = message.trim();

  if (/```/.test(trimmed)) {
    return trimmed;
  }

  const detectedLanguage = inferLanguageFromDetectors(trimmed);
  if (detectedLanguage) {
    return '```' + detectedLanguage + '\n' + trimmed + '\n```';
  }

  return trimmed;
}
function detectLanguage(content, fallbackLanguage = 'plaintext') {
  if (!content) {
    return fallbackLanguage;
  }

  const trimmed = content.trim();
  const detected = inferLanguageFromDetectors(trimmed);

  return detected || fallbackLanguage;
}
function wrapWithLanguageFence(text, language = 'plaintext') {
  if (text === undefined || text === null) {
    return '';
  }

  const content = String(text);
  if (!content.trim() || /```/.test(content)) {
    return content;
  }

  return `\`\`\`${language}\n${content}\n\`\`\``;
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
  if (!command || typeof command !== 'object') {
    return;
  }

  const sections = [];

  const runText = typeof command.run === 'string' ? command.run.trim() : '';
  if (runText) {
    const fenced = wrapWithLanguageFence(runText, 'bash');
    sections.push(renderMarkdownMessage(fenced));
  }

  const PARAM_KEYS = ['cwd', 'shell', 'timeout_sec', 'filter_regex', 'tail_lines'];
  const metadata = {};
  for (const key of PARAM_KEYS) {
    const value = command[key];
    if (value !== undefined && value !== null && value !== '') {
      metadata[key] = value;
    }
  }

  if (Object.keys(metadata).length > 0) {
    const fencedMetadata = wrapWithLanguageFence(JSON.stringify(metadata, null, 2), 'json');
    sections.push(renderMarkdownMessage(fencedMetadata));
  }

  const STRUCTURED_KEYS = ['browse', 'read', 'edit', 'replace'];
  const structuredPayload = {};
  for (const key of STRUCTURED_KEYS) {
    if (command[key] !== undefined) {
      structuredPayload[key] = command[key];
    }
  }

  if (Object.keys(structuredPayload).length > 0) {
    const fencedStructured = wrapWithLanguageFence(JSON.stringify(structuredPayload, null, 2), 'json');
    sections.push(renderMarkdownMessage(fencedStructured));
  }

  const knownKeys = new Set(['run', ...PARAM_KEYS, ...STRUCTURED_KEYS]);
  const extraKeys = Object.keys(command).filter((key) => !knownKeys.has(key));
  if (extraKeys.length > 0) {
    const extra = {};
    for (const key of extraKeys) {
      extra[key] = command[key];
    }
    const fencedExtra = wrapWithLanguageFence(JSON.stringify(extra, null, 2), 'json');
    sections.push(renderMarkdownMessage(fencedExtra));
  }

  if (sections.length === 0) {
    const fallback = wrapWithLanguageFence(JSON.stringify(command, null, 2), 'json');
    sections.push(renderMarkdownMessage(fallback));
  }

  const paddedSections = sections.flatMap((section, index) => (index === 0 ? [section] : ['', section]));

  display('Command', paddedSections, 'yellow');
}

function renderCommandResult(command, result, stdout, stderr) {
  // const statusLines = [
  //   `${chalk.cyan('Exit Code')}: ${result.exit_code}`,
  //   `${chalk.cyan('Runtime')}: ${result.runtime_ms}ms`,
  //   `${chalk.cyan('Status')}: ${result.killed ? chalk.red('KILLED (timeout)') : chalk.green('COMPLETED')}`,
  // ];

  // display('Command Result', statusLines, 'green');

  const language = detectLanguage(command.command);

  if (stdout) {
    const fencedStdout = wrapWithLanguageFence(stdout, language);
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
  inferLanguageFromDetectors,
  detectLanguage,
};
