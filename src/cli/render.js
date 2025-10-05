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

export function display(label, content, color = 'white') {
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

export function inferLanguageFromDetectors(content) {
  for (const detector of CONTENT_TYPE_DETECTORS) {
    if (detector.pattern.test(content)) {
      return detector.language;
    }
  }

  return null;
}

export function wrapStructuredContent(message) {
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

export function detectLanguage(content, fallbackLanguage = 'plaintext') {
  if (!content) {
    return fallbackLanguage;
  }

  const trimmed = content.trim();
  const detected = inferLanguageFromDetectors(trimmed);

  return detected || fallbackLanguage;
}

export function wrapWithLanguageFence(text, language = 'plaintext') {
  if (text === undefined || text === null) {
    return '';
  }

  const content = String(text);
  if (!content.trim() || /```/.test(content)) {
    return content;
  }

  return `\`\`\`${language}\n${content}\n\`\`\``;
}

export function renderMarkdownMessage(message) {
  const prepared = wrapStructuredContent(message);
  return marked.parse(prepared, { renderer: terminalRenderer });
}

export function renderPlan(plan) {
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

export function renderMessage(message) {
  if (!message) return;

  const rendered = renderMarkdownMessage(message);
  display('AI', rendered, 'magenta');
}

export function renderCommand(command) {
  if (!command) return;

  const commandLines = [command.run];
  display('Command', commandLines, 'yellow');
}

export function renderCommandResult(command, result, stdout, stderr) {
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

export default {
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
