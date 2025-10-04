require('dotenv').config();
const fs = require('fs');
const path = require('path');
const OpenAI = require('openai');
const readline = require('readline');
const chalk = require('chalk');

const { marked } = require('marked');
const markedTerminal = require('marked-terminal');
const TerminalRenderer = markedTerminal.default || markedTerminal;

const { spawn } = require('child_process');

const STARTUP_FORCE_AUTO_APPROVE = process.argv
  .slice(2)
  .some((arg) => {
    if (!arg) return false;
    const normalized = String(arg).trim().toLowerCase();
    return (
      normalized === 'auto' ||
      normalized === '--auto' ||
      normalized === '--auto-approve' ||
      normalized === '--auto-approval'
    );
  });

let __openaiClient = null;

function getOpenAIClient() {
  if (!__openaiClient) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY not found in environment variables.');
    }
    __openaiClient = new OpenAI({
      apiKey,
      baseURL: process.env.OPENAI_BASE_URL || undefined,
    });
  }
  return __openaiClient;
}
const MODEL = process.env.OPENAI_MODEL || process.env.OPENAI_CHAT_MODEL || 'gpt-5-mini';

marked.setOptions({
  renderer: new TerminalRenderer({
    reflowText: false, // Preserve line breaks so code blocks stay readable
    tab: 2,
  }),
});

// Simple CLI animation to indicate the AI is thinking during API calls
let __thinkingInterval = null;
let __thinkingStartTime = null;

function formatElapsedTime(startTime, now = Date.now()) {
  if (!startTime || startTime > now) {
    return '00:00';
  }
  const elapsedMs = Math.max(0, now - startTime);
  const totalSeconds = Math.floor(elapsedMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return String(minutes).padStart(2, '0') + ':' + String(seconds).padStart(2, '0');
}

function startThinking() {
  if (__thinkingInterval) return; // already running
  __thinkingStartTime = Date.now();
  const frames = ['Thinking.  ', 'Thinking.. ', 'Thinking...'];
  let i = 0;
  process.stdout.write('\n');
  __thinkingInterval = setInterval(() => {
    try {
      const elapsed = formatElapsedTime(__thinkingStartTime);
      readline.clearLine(process.stdout, 0);
      readline.cursorTo(process.stdout, 0);
      process.stdout.write(chalk.dim(frames[i] + ' (' + elapsed + ')'));
      i = (i + 1) % frames.length;
    } catch (_) {
      // ignore if stdout is not a TTY
    }
  }, 400);
}

function stopThinking() {
  if (__thinkingInterval) {
    clearInterval(__thinkingInterval);
    __thinkingInterval = null;
    __thinkingStartTime = null;
    try {
      readline.clearLine(process.stdout, 0);
      readline.cursorTo(process.stdout, 0);
    } catch (_) {
      // ignore
    }
  }
}

/**
 * Recursively discover AGENTS.md files (excluding heavy vendor folders).
 * @param {string} rootDir - starting directory for the search
 * @returns {string[]} list of absolute file paths
 */
function findAgentFiles(rootDir) {
  const discovered = [];

  /** @param {string} current */
  function walk(current) {
    let entries = [];
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch (err) {
      return; // Ignore unreadable directories
    }

    for (const entry of entries) {
      if (entry.name === 'node_modules' || entry.name === '.git') {
        continue;
      }

      const fullPath = path.join(current, entry.name);

      if (entry.isDirectory()) {
        walk(fullPath);
        continue;
      }

      if (entry.isFile() && entry.name.toLowerCase() === 'agents.md') {
        discovered.push(fullPath);
      }
    }
  }

  walk(rootDir);
  return discovered;
}

/**
 * Build an additional prompt section that mirrors local AGENTS.md guidance.
 * @param {string} rootDir - workspace root
 * @returns {string} formatted rules text
 */
function buildAgentsPrompt(rootDir) {
  const agentFiles = findAgentFiles(rootDir);
  if (agentFiles.length === 0) {
    return '';
  }

  const sections = agentFiles
    .map((filePath) => {
      try {
        const content = fs.readFileSync(filePath, 'utf8').trim();
        if (!content) {
          return '';
        }

        return `File: ${path.relative(rootDir, filePath)}\n${content}`;
      } catch (err) {
        return '';
      }
    })
    .filter(Boolean);

  if (sections.length === 0) {
    return '';
  }

  return sections.join('\n\n---\n\n');
}

const agentsGuidance = buildAgentsPrompt(process.cwd());

const BASE_SYSTEM_PROMPT = `You are an AI agent that helps users by executing commands and completing tasks.

MUST DO: 
1. read and understand /brain/* files at arart up
2. never create temp files in repo directory
3. always clean up temp files.

You must respond ONLY with valid JSON in this format:
{
  "message": "Optional message to display to the user",
  "plan": [
    {"step": 1, "title": "Description of step", "status": "pending|running|completed"}
  ],
  "command": {
    "shell": "bash",
    "run": "command to execute",
    "cwd": ".",
    "timeout_sec": 60,
    "filter_regex": "optional regex pattern to filter output",
    "tail_lines": 200
  }
}

Special commands:
browse "some url"
- allows you to search the web using http get.

Rules:
- Always respond with valid JSON
- Include "message" to explain what you're doing
- Include "plan" only when a multi-step approach is helpful; otherwise omit it or return an empty array
- Include "command" only when you need to execute a command
- When a task is complete, respond with "message" and, if helpful, "plan" (no "command")
- Mark completed steps in the plan with "status": "completed"
- Be concise and helpful
- Whenever working on a topic, check files in /brain/ if there are any topics that seem to match. e.g. javascript.md if you are about to work with a js file.
- Self learning, if you try an approach to solve a task, and it fails many times, and you later find another way to solve the same, add that as a how-to in the /brain/ directory on the topic.
Special command:
- To perform an HTTP GET without using the shell, set command.run to "browse <url>". The agent will fetch the URL and return the response body as stdout, HTTP errors in stderr with a non-zero exit_code. filter_regex and tail_lines still apply to the output.`;

const SYSTEM_PROMPT =
  agentsGuidance.trim().length > 0
    ? `${BASE_SYSTEM_PROMPT}\n\nThe following local operating rules are mandatory. They are sourced from AGENTS.md files present in the workspace:\n\n${agentsGuidance}`
    : BASE_SYSTEM_PROMPT;

/**
 * Execute a command with timeout and capture output
 * @param {string} cmd - Command to execute
 * @param {string} cwd - Working directory
 * @param {number} timeoutSec - Timeout in seconds
 * @returns {Promise<{stdout: string, stderr: string, exit_code: number, killed: boolean, runtime_ms: number}>}
 */

// --- Template support inserted ---
const TEMPLATES_PATH = path.join(process.cwd(), 'templates', 'command-templates.json');
function loadTemplates() {
  try {
    const raw = fs.readFileSync(TEMPLATES_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed;
  } catch (err) {
    return [];
  }
}

function renderTemplateCommand(template, vars) {
  let cmd = template.command || '';
  const varsMap = Object.assign({}, vars || {});
  // Ensure defaults applied
  (template.variables || []).forEach((v) => {
    if (!Object.prototype.hasOwnProperty.call(varsMap, v.name)) {
      varsMap[v.name] = v.default || '';
    }
  });
  // Simple placeholder replacement for {{name}}
  Object.keys(varsMap).forEach((k) => {
    const re = new RegExp('{{\s*' + k + '\s*}}', 'g');
    cmd = cmd.replace(re, String(varsMap[k]));
  });
  return cmd;
}

// Small CLI helper for templates: node index.js templates [list|show <id>|render <id> <json-vars>]
if (require.main === module) {
  try {
    const argv = process.argv || [];
    if ((argv[2] || '') === 'templates') {
      const sub = argv[3] || 'list';
      const templates = loadTemplates();
      if (sub === 'list') {
        templates.forEach(t => console.log(`${t.id} - ${t.name}: ${t.description || ''}`));
        process.exit(0);
      }
      if (sub === 'show') {
        const id = argv[4];
        const t = templates.find(x => x.id === id);
        if (!t) { console.error('Template not found:', id); process.exit(2); }
        console.log(JSON.stringify(t, null, 2));
        process.exit(0);
      }
      if (sub === 'render') {
        const id = argv[4];
        const varsJson = argv[5] || '{}';
        let vars = {};
        try { vars = JSON.parse(varsJson); } catch (e) { console.error('Invalid JSON variables'); process.exit(3); }
        const t = templates.find(x => x.id === id);
        if (!t) { console.error('Template not found:', id); process.exit(2); }
        console.log(renderTemplateCommand(t, vars));
        process.exit(0);
      }
      console.log('Usage: node index.js templates [list|show <id>|render <id> <json-vars>]');
      process.exit(0);
    }
  } catch (err) {
    // noop; fall through to normal agent behavior
  }
}
// --- end template support ---
async function runCommand(cmd, cwd, timeoutSec, shellOpt) {
  return new Promise((resolve) => {
    const startTime = Date.now();
    const proc = spawn(cmd, { cwd, shell: (shellOpt ?? true) });
    let stdout = '';
    let stderr = '';
    let killed = false;

    const timeout = setTimeout(() => {
      proc.kill('SIGTERM');
      killed = true;
    }, timeoutSec * 1000);

    proc.stdout.on('data', (d) => {
      stdout += d.toString();
    });

    proc.stderr.on('data', (d) => {
      stderr += d.toString();
    });

    proc.on('close', (code) => {
      clearTimeout(timeout);
      const runtime_ms = Date.now() - startTime;
      resolve({
        stdout,
        stderr,
        exit_code: code,
        killed,
        runtime_ms,
      });
    });
  });
}

/**
 * Perform an HTTP GET request (special non-shell command).
 * @param {string} url - URL to fetch
 * @param {number} timeoutSec - Timeout in seconds
 * @returns {Promise<{stdout: string, stderr: string, exit_code: number, killed: boolean, runtime_ms: number}>}
 */
async function runBrowse(url, timeoutSec) {
  const startTime = Date.now();
  let stdout = '';
  let stderr = '';
  let exit_code = 0;
  let killed = false;

  const finalize = () => ({
    stdout,
    stderr,
    exit_code,
    killed,
    runtime_ms: Date.now() - startTime,
  });

  try {
    // Prefer global fetch if available (Node 18+) with AbortController timeout
    if (typeof fetch === 'function') {
      const controller = new AbortController();
      const id = setTimeout(() => { controller.abort(); killed = true; }, (timeoutSec ?? 60) * 1000);
      try {
        const res = await fetch(url, { method: 'GET', signal: controller.signal, redirect: 'follow' });
        clearTimeout(id);
        stdout = await res.text();
        if (!res.ok) {
          stderr = 'HTTP ' + res.status + ' ' + res.statusText;
          exit_code = res.status || 1;
        }
      } catch (err) {
        clearTimeout(id);
        stderr = err && err.message ? err.message : String(err);
        exit_code = 1;
      }
      return finalize();
    }

    // Fallback to http/https modules
    const urlMod = require('url');
    const http = require('http');
    const https = require('https');
    const parsed = urlMod.parse(url);
    const lib = parsed.protocol === 'https:' ? https : http;

    await new Promise((resolve) => {
      const req = lib.request({
        method: 'GET',
        hostname: parsed.hostname,
        port: parsed.port,
        path: parsed.path,
        headers: {},
        timeout: (timeoutSec ?? 60) * 1000,
      }, (res) => {
        const chunks = [];
        res.on('data', (d) => chunks.push(d));
        res.on('end', () => {
          stdout = Buffer.concat(chunks).toString('utf8');
          if (res.statusCode < 200 || res.statusCode >= 300) {
            stderr = 'HTTP ' + res.statusCode;
            exit_code = res.statusCode || 1;
          }
          resolve();
        });
      });
      req.on('timeout', () => {
        killed = true;
        stderr = 'Request timed out';
        exit_code = 1;
        req.destroy(new Error('timeout'));
        resolve();
      });
      req.on('error', (err) => {
        stderr = err && err.message ? err.message : String(err);
        exit_code = 1;
        resolve();
      });
      req.end();
    });

    return finalize();
  } catch (err) {
    stderr = err && err.message ? err.message : String(err);
    exit_code = 1;
    return finalize();
  }
}

/**
 * Apply regex filter to output lines
 * @param {string} text - Text to filter
 * @param {string} regex - Regex pattern
 * @returns {string} Filtered text
 */
function applyFilter(text, regex) {
  if (!regex) return text;
  try {
    const pattern = new RegExp(regex, 'i');
    return text
      .split('\n')
      .filter((line) => pattern.test(line))
      .join('\n');
  } catch (e) {
    console.error('Invalid regex pattern:', e.message);
    return text;
  }
}

/**
 * Get last N lines from text
 * @param {string} text - Text to tail
 * @param {number} lines - Number of lines to keep
 * @returns {string} Tailed text
 */
function tailLines(text, lines) {
  if (!lines) return text;
  const allLines = text.split('\n');
  return allLines.slice(-lines).join('\n');
}

/**
 * Unified renderer for box-styled sections so every speaker uses the same layout.
 * @param {string} label - Title to display in the infobox header
 * @param {string | string[]} content - Message content or line array
 * @param {string} color - Chalk color keyword used for border/title accents
 */
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

/**
 * Wrap detected structured content in fenced code blocks so the Markdown renderer
 * can highlight it correctly.
 * @param {string} message - raw assistant text
 * @returns {string} message prepared for markdown rendering
 */
function wrapStructuredContent(message) {
  if (!message) {
    return '';
  }

  const trimmed = message.trim();

  if (/```/.test(trimmed)) {
    return trimmed;
  }

  //TODO: add generic detector that can pick up if most of the string are mostly markup, or of any specific programming language.


  for (const detector of CONTENT_TYPE_DETECTORS) {
    if (detector.pattern.test(trimmed)) {
      return `\`\`\`${detector.language}\n${trimmed}\n\`\`\``;
    }
  }


  return trimmed;
}

/**
 * Render rich markdown content (with syntax hints) in the terminal.
 * @param {string} message - assistant message
 * @returns {string} ANSI-ready string
 */
function renderMarkdownMessage(message) {
  const prepared = wrapStructuredContent(message);
  return marked.parse(prepared);
}

/**
 * Render plan as a compact checklist with a colored guide line.
 * @param {Array} plan - Plan array from LLM
 */
function renderPlan(plan) {
  if (!plan || !Array.isArray(plan) || plan.length === 0) return;

  const planLines = plan.map((item) => {
    const statusSymbol =
      item.status === 'completed' ? chalk.green('✔') : item.status === 'running' ? chalk.yellow('▶') : chalk.gray('•');
    const stepLabel = chalk.cyan(`Step ${item.step}`);
    const title = chalk.white(item.title);
    return `${statusSymbol} ${stepLabel} ${chalk.dim('-')} ${title}`;
  });

  display('Plan', planLines, 'cyan');
}

/**
 * Create readline interface with a friendlier prompt.
 */
function createInterface() {
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: !!process.stdin.isTTY,
  });
}

/**
 * Ask the human user for input with highlighted prompt text.
 * @param {readline.Interface} rl - readline interface
 * @param {string} prompt - prompt label
 * @returns {Promise<string>} input from user
 */
function askHuman(rl, prompt) {
  return new Promise((resolve) => {
    rl.question(chalk.bold.blue(prompt), (answer) => {
      resolve(answer.trim());
    });
  });
}

/**
 * Render the assistant message with a subtle colored guide.
 * @param {string} message - assistant message
 */
function renderMessage(message) {
  if (!message) return;

  const rendered = renderMarkdownMessage(message);
  display('AI', rendered, 'magenta');
}

/**
 * Render command information before execution.
 * @param {object} command - command block from the LLM response
 */
function renderCommand(command) {
  if (!command) return;

  const commandLines = [
    `${chalk.gray('Shell')}: ${command.shell || 'bash'}`,
    `${chalk.gray('Directory')}: ${command.cwd || '.'}`,
    `${chalk.gray('Timeout')}: ${command.timeout_sec ?? 60}s`,
  ];

  if (command.run) {
    commandLines.push('');
    commandLines.push(...command.run.split('\n').map((line) => chalk.yellow(line)));
  }

  display('Command', commandLines, 'yellow');
}

/**
 * Render command execution results.
 * @param {object} result - output from runCommand
 * @param {string} stdout - filtered stdout
 * @param {string} stderr - filtered stderr
 */
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

/**
 * Main agent loop
 */
// Load and evaluate pre-approved command allowlist
function loadPreapprovedConfig() {
  const cfgPath = path.join(process.cwd(), 'approved_commands.json');
  try {
    if (fs.existsSync(cfgPath)) {
      const raw = fs.readFileSync(cfgPath, 'utf8');
      const parsed = JSON.parse(raw);
      return parsed && parsed.allowlist ? parsed : { allowlist: [] };
    }
  } catch (e) {
    console.error(chalk.yellow('Warning: Failed to load approved_commands.json:'), e.message);
  }
  return { allowlist: [] };
}

// Minimal shell-like splitter supporting quoted args
function shellSplit(str) {
  const re = /"([^"\\]*(?:\\.[^"\\]*)*)"|'([^'\\]*(?:\\.[^'\\]*)*)'|\S+/g;
  const out = [];
  let m;
  while ((m = re.exec(str))) {
    out.push(m[1] ?? m[2] ?? m[0]);
  }
  return out;
}

function isPreapprovedCommand(command, cfg) {
  try {
    const runRaw = (command && command.run ? String(command.run) : '').trim();
    if (!runRaw) return false;

    // Reject any multi-line or carriage-return content
    if (/\r|\n/.test(runRaw)) return false;

    // Special: browse <url> (GET-only via runBrowse), validate URL and protocol
    if (runRaw.toLowerCase().startsWith('browse ')) {
      const url = runRaw.slice(7).trim();
      if (!url || /\s/.test(url)) return false; // no spaces in URL
      try {
        const u = new URL(url);
        if (u.protocol === 'http:' || u.protocol === 'https:') return true;
      } catch (_) { }
      return false;
    }

    // Disallow common shell chaining/metacharacters
    const forbidden = [
      /;|&&|\|\|/, // chaining
      /\|/,         // pipes
      /`/,          // backticks
      /\$\(/,      // command substitution
      /<\(/        // process substitution
    ];
    if (forbidden.some((re) => re.test(runRaw))) return false;

    // Disallow sudo explicitly
    if (/^\s*sudo\b/.test(runRaw)) return false;

    // Disallow redirection writes (>, >>, 2>&1 etc.)
    if (/(^|\s)[0-9]*>>?\s/.test(runRaw)) return false;
    if (/\d?>&\d?/.test(runRaw)) return false;

    // For auto-approval, do not allow custom string shells (e.g., 'bash')
    const shellOpt = command && 'shell' in command ? command.shell : undefined;
    if (typeof shellOpt === 'string') {
      const s = String(shellOpt).trim().toLowerCase();
      if (!['bash', 'sh'].includes(s)) return false;
    }

    const tokens = shellSplit(runRaw);
    if (!tokens.length) return false;
    const base = path.basename(tokens[0]);

    const list = (cfg && Array.isArray(cfg.allowlist)) ? cfg.allowlist : [];
    const entry = list.find((e) => e && e.name === base);
    if (!entry) return false;

    // Determine subcommand as first non-option token after base
    let sub = '';
    for (let k = 1; k < tokens.length; k++) {
      const t = tokens[k];
      if (!t.startsWith('-')) { sub = t; break; }
    }

    if (Array.isArray(entry.subcommands) && entry.subcommands.length > 0) {
      if (!entry.subcommands.includes(sub)) return false;
      // For version-like commands, prevent extra args
      if (['python', 'python3', 'pip', 'node', 'npm'].includes(base)) {
        const afterSubIdx = tokens.indexOf(sub);
        if (afterSubIdx !== -1 && tokens.length > afterSubIdx + 1) return false;
      }
    }

    const joined = ' ' + tokens.slice(1).join(' ') + ' ';
    switch (base) {
      case 'sed':
        if (/(^|\s)-i(\b|\s)/.test(joined)) return false;
        break;
      case 'find':
        if (/\s-exec\b/.test(joined) || /\s-delete\b/.test(joined)) return false;
        break;
      case 'curl': {
        if (/(^|\s)-X\s*(POST|PUT|PATCH|DELETE)\b/i.test(joined)) return false;
        if (/(^|\s)(--data(-binary|-raw|-urlencode)?|-d|--form|-F|--upload-file|-T)\b/i.test(joined)) return false;
        // Disallow writing to files: -O/--remote-name or -o FILE or -oFILE
        if (/(^|\s)(-O|--remote-name|--remote-header-name)\b/.test(joined)) return false;
        const toks = tokens.slice(1);
        for (let i = 0; i < toks.length; i++) {
          const t = toks[i];
          if (t === '-o' || t === '--output') {
            const n = toks[i + 1] || '';
            if (n !== '-') return false;
          }
          if (t.startsWith('-o') && t.length > 2) return false; // -oFILE
        }
        break;
      }
      case 'wget': {
        if (/\s--spider\b/.test(joined)) {
          // ok
        } else {
          const toks = tokens.slice(1);
          for (let i = 0; i < toks.length; i++) {
            const t = toks[i];
            if (t === '-O' || t === '--output-document') {
              const n = toks[i + 1] || '';
              if (n !== '-') return false;
            }
            if (t.startsWith('-O') && t !== '-O') return false; // -Ofile
          }
        }
        break;
      }
      case 'ping': {
        const idx = tokens.indexOf('-c');
        if (idx === -1) return false;
        const count = parseInt(tokens[idx + 1], 10);
        if (!Number.isFinite(count) || count > 3 || count < 1) return false;
        break;
      }
      default:
        break;
    }

    return true;
  } catch {
    return false;
  }
}

const PREAPPROVED_CFG = loadPreapprovedConfig();

// In-memory session approvals
const __SESSION_APPROVED = new Set();
function __commandSignature(cmd) {
  // Canonical signature for session approval
  return JSON.stringify({
    shell: cmd.shell || 'bash',
    run: typeof cmd.run === 'string' ? cmd.run : '',
    cwd: cmd.cwd || '.',
    // Only key fields used to identify what actually runs; ignore timeouts/filters
  });
}
function isSessionApproved(cmd) {
  try { return __SESSION_APPROVED.has(__commandSignature(cmd)); } catch { return false; }
}
function approveForSession(cmd) {
  try { __SESSION_APPROVED.add(__commandSignature(cmd)); } catch { }
}

function extractResponseText(response) {
  if (!response || typeof response !== 'object') {
    return '';
  }

  if (typeof response.output_text === 'string') {
    const normalized = response.output_text.trim();
    if (normalized) {
      return normalized;
    }
  }

  const outputs = Array.isArray(response.output) ? response.output : [];
  for (const item of outputs) {
    if (!item || item.type !== 'message' || !Array.isArray(item.content)) {
      continue;
    }

    for (const part of item.content) {
      if (part && part.type === 'output_text' && typeof part.text === 'string') {
        const normalized = part.text.trim();
        if (normalized) {
          return normalized;
        }
      }
    }
  }

  return '';
}

async function agentLoop() {
  //TODO: we also need to check if any of the commands match any command that is about to be exacuted, and skip human interaction.
  const history = [
    {
      role: 'system',
      content: SYSTEM_PROMPT,
    },
  ];

  const rl = createInterface();

  let openai;
  try {
    openai = getOpenAIClient();
  } catch (err) {
    console.error('Error:', err.message);
    console.error('Please create a .env file with your OpenAI API key.');
    rl.close();
    throw err;
  }

  console.log(chalk.bold.blue('\nOpenAgent - AI Agent with JSON Protocol'));
  console.log(chalk.dim('Type "exit" or "quit" to end the conversation.'));
  if (STARTUP_FORCE_AUTO_APPROVE) {
    console.log(
      chalk.yellow(
        'Full auto-approval mode enabled via CLI flag. All commands will run without prompting.'
      )
    );
  }

  while (true) {
    const userInput = await askHuman(rl, '\n ▷ ');

    if (!userInput) {
      continue;
    }

    if (userInput.toLowerCase() === 'exit' || userInput.toLowerCase() === 'quit') {
      console.log(chalk.green('Goodbye!'));
      break;
    }

    history.push({
      role: 'user',
      content: userInput,
    });

    try {
      let continueLoop = true;

      while (continueLoop) {
        // Request the next assistant action
        startThinking();
        console.log("Sending request to AI");
        const completion = await openai.responses.create({
          model: MODEL,
          input: history,
          text: {
            format: { type: 'json_object' },
          }
        });
        stopThinking();
        console.log("Received response from AI");

        const responseContent = extractResponseText(completion);

        if (!responseContent) {
          console.error(chalk.red('Error: OpenAI response did not include text output.'));
          break;
        }

        history.push({
          role: 'assistant',
          content: responseContent,
        });

        let parsed;
        try {
          parsed = JSON.parse(responseContent);
        } catch (e) {
          console.error(chalk.red('Error: LLM returned invalid JSON'));
          console.error('Response:', responseContent);
          break;
        }

        renderMessage(parsed.message);
        renderPlan(parsed.plan);

        if (!parsed.command) {

          continueLoop = false;
          continue;
        }

        renderCommand(parsed.command);

        // Auto-approve via allowlist or ask human

        // Auto-approve via allowlist or ask human (with session approvals)
        const __autoApprovedAllowlist = isPreapprovedCommand(parsed.command, PREAPPROVED_CFG);
        const __autoApprovedSession = isSessionApproved(parsed.command);
        const __autoApprovedCli = STARTUP_FORCE_AUTO_APPROVE;
        const __autoApproved =
          __autoApprovedAllowlist || __autoApprovedSession || __autoApprovedCli;
        if (__autoApproved) {
          if (__autoApprovedAllowlist) {
            console.log(chalk.green("Auto-approved by allowlist (approved_commands.json)"));
          } else if (__autoApprovedSession) {
            console.log(chalk.green("Auto-approved by session approvals"));
          } else {
            console.log(chalk.green("Auto-approved by CLI flag (--auto-approve)"));
          }
        } else {
          // 3-option approval menu
          let selection;
          while (true) {
            const input = (await askHuman(rl, `
Approve running this command?
  1) Yes (run once)
  2) Yes, for entire session (add to in-memory approvals)
  3) No, tell the AI to do something else
Select 1, 2, or 3: `)).trim().toLowerCase();
            if (input === '1' || input === 'y' || input === 'yes') { selection = 1; break; }
            if (input === '2') { selection = 2; break; }
            if (input === '3' || input === 'n' || input === 'no') { selection = 3; break; }
            console.log(chalk.yellow('Please enter 1, 2, or 3.'));
          }

          if (selection === 3) {
            console.log(chalk.yellow('Command execution canceled by human (requested alternative).'));
            const observation = {
              observation_for_llm: {
                canceled_by_human: true,
                message: 'Human declined to execute the proposed command and asked the AI to propose an alternative approach without executing a command.'
              },
              observation_metadata: {
                timestamp: new Date().toISOString()
              }
            };
            history.push({ role: 'user', content: JSON.stringify(observation) });
            continue;
          } else if (selection === 2) {
            approveForSession(parsed.command);
            console.log(chalk.green('Approved and added to session approvals.'));
          } else {
            console.log(chalk.green('Approved (run once).'));
          }
        }

        let result;
        // If the assistant provided an edit specification, apply file edits directly
        if (parsed.command && parsed.command.edit) {
          // Lazily require the edit handler to avoid startup overhead
          const cmdEdit = require('./command_edit');
          result = await cmdEdit.applyFileEdits(parsed.command.edit, parsed.command.cwd || '.');
        }
        if (typeof result === 'undefined') {
          const __runStr = parsed.command.run || '';
          if (typeof __runStr === 'string' && __runStr.trim().toLowerCase().startsWith('browse ')) {
            const url = __runStr.trim().slice(7).trim();
            result = await runBrowse(url, (parsed.command.timeout_sec ?? 60));
          } else {
            result = await runCommand(
              parsed.command.run,
              parsed.command.cwd || '.',
              (parsed.command.timeout_sec ?? 60)
            );
          }

        }

        let filteredStdout = result.stdout;
        let filteredStderr = result.stderr;

        const outputUtils = require('./outputUtils');
        const _combined = outputUtils.combineStdStreams(filteredStdout, filteredStderr, result.exit_code ?? 0);
        filteredStdout = _combined.stdout;
        filteredStderr = _combined.stderr;

        if (parsed.command.filter_regex) {
          filteredStdout = applyFilter(filteredStdout, parsed.command.filter_regex);
          filteredStderr = applyFilter(filteredStderr, parsed.command.filter_regex);
        }

        if (parsed.command.tail_lines) {
          filteredStdout = tailLines(filteredStdout, parsed.command.tail_lines);
          filteredStderr = tailLines(filteredStderr, parsed.command.tail_lines);
        }

        const stdoutPreview = filteredStdout
          ? filteredStdout.split('\n').slice(0, 20).join('\n') + (filteredStdout.split('\n').length > 20 ? '\n…' : '')
          : '';
        const stderrPreview = filteredStderr
          ? filteredStderr.split('\n').slice(0, 20).join('\n') + (filteredStderr.split('\n').length > 20 ? '\n…' : '')
          : '';

        renderCommandResult(result, stdoutPreview, stderrPreview);

        const observation = {
          observation_for_llm: {
            stdout: filteredStdout,
            stderr: filteredStderr,
            exit_code: result.exit_code,
            truncated:
              (parsed.command.filter_regex &&
                (result.stdout !== filteredStdout || result.stderr !== filteredStderr)) ||
              (parsed.command.tail_lines &&
                (result.stdout.split('\n').length > parsed.command.tail_lines ||
                  result.stderr.split('\n').length > parsed.command.tail_lines)),
          },
          observation_metadata: {
            runtime_ms: result.runtime_ms,
            killed: result.killed,
            timestamp: new Date().toISOString(),
          },
        };

        history.push({
          role: 'user',
          content: JSON.stringify(observation),
        });
      }
    } catch (error) {
      stopThinking();
      console.error(chalk.red(`Error calling OpenAI API: ${error.message}`));
      if (error.response) {
        console.error('Response:', error.response.data);
      }
    }
  }

  rl.close();
}

if (require.main === module) {
  agentLoop().catch((err) => {
    if (err && err.message) {
      process.exitCode = 1;
    }
  });
}

module.exports = {
  STARTUP_FORCE_AUTO_APPROVE,
  getOpenAIClient,
  startThinking,
  stopThinking,
  findAgentFiles,
  buildAgentsPrompt,
  runCommand,
  runBrowse,
  applyFilter,
  tailLines,
  display,
  wrapStructuredContent,
  renderMarkdownMessage,
  renderPlan,
  createInterface,
  askHuman,
  renderMessage,
  renderCommand,
  renderCommandResult,
  loadPreapprovedConfig,
  shellSplit,
  isPreapprovedCommand,
  __commandSignature,
  isSessionApproved,
  approveForSession,
  extractResponseText,
  agentLoop,
  PREAPPROVED_CFG,
};

// --- Shortcuts support inserted ---
const SHORTCUTS_PATH = path.join(process.cwd(), 'shortcuts', 'shortcuts.json');
function loadShortcutsFile() {
  try {
    const raw = fs.readFileSync(SHORTCUTS_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed;
  } catch (err) {
    return [];
  }
}

function findShortcut(id) {
  const list = loadShortcutsFile();
  return list.find(s => s.id === id);
}

// CLI helper: node index.js shortcuts [list|show <id>|run <id>]
if (require.main === module) {
  try {
    const argv = process.argv || [];
    if ((argv[2] || '') === 'shortcuts') {
      const sub = argv[3] || 'list';
      const shortcuts = loadShortcutsFile();
      if (sub === 'list') {
        shortcuts.forEach(s => console.log(`${s.id} - ${s.name}: ${s.description || ''}`));
        process.exit(0);
      }
      if (sub === 'show') {
        const id = argv[4];
        const s = shortcuts.find(x => x.id === id);
        if (!s) { console.error('Shortcut not found:', id); process.exit(2); }
        console.log(JSON.stringify(s, null, 2));
        process.exit(0);
      }
      if (sub === 'run') {
        const id = argv[4];
        const s = shortcuts.find(x => x.id === id);
        if (!s) { console.error('Shortcut not found:', id); process.exit(2); }
        // For safety, just render and print the command. The agent's approval/validation should handle execution.
        console.log(s.command);
        process.exit(0);
      }
      console.log('Usage: node index.js shortcuts [list|show <id>|run <id>]');
      process.exit(0);
    }
  } catch (err) {
    // noop; fall through to normal agent behavior
  }
}
// --- end Shortcuts support ---
