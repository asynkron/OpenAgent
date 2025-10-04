import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import readline from 'readline';
import { spawn } from 'child_process';
import OpenAI from 'openai';

import React from 'react';
import { render, Box, Text, useApp, useStdin, useStdout, useInput } from 'ink';
import Spinner from 'ink-spinner';
import chalk from 'chalk';

import { marked } from 'marked';
import markedTerminal from 'marked-terminal';

const TerminalRenderer = markedTerminal.default || markedTerminal;

dotenv.config();

function checkRawModeSupport() {
  const stdin = process.stdin;
  if (!stdin || typeof stdin.isTTY === 'undefined' || !stdin.isTTY) {
    return false;
  }

  if (typeof stdin.setRawMode !== 'function') {
    return false;
  }

  try {
    stdin.setRawMode(true);
    stdin.setRawMode(false);
    return true;
  } catch (error) {
    return false;
  }
}

const rawModeSupported = checkRawModeSupport();

function useTerminalDimensions() {
  const { stdout } = useStdout();
  const initialColumns = stdout?.columns || process.stdout?.columns || 80;
  const initialRows = stdout?.rows || process.stdout?.rows || 24;
  const [dimensions, setDimensions] = React.useState([initialColumns, initialRows]);

  React.useEffect(() => {
    if (!stdout || typeof stdout.on !== 'function' || typeof stdout.off !== 'function') {
      return undefined;
    }

    const handler = () => {
      const nextColumns = stdout.columns || initialColumns;
      const nextRows = stdout.rows || initialRows;
      setDimensions([nextColumns, nextRows]);
    };

    stdout.on('resize', handler);

    return () => {
      stdout.off('resize', handler);
    };
  }, [stdout, initialColumns, initialRows]);

  return dimensions;
}

const apiKey = process.env.OPENAI_API_KEY;

if (!apiKey) {
  console.error('Error: OPENAI_API_KEY not found in environment variables.');
  console.error('Please create a .env file with your OpenAI API key.');
  process.exit(1);
}

const openai = new OpenAI({
  apiKey,
});

marked.setOptions({
  renderer: new TerminalRenderer({
    reflowText: false,
    tab: 2,
  }),
});

function findAgentFiles(rootDir) {
  const discovered = [];

  function walk(current) {
    let entries = [];
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch (err) {
      return;
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

const BASE_SYSTEM_PROMPT = `You are an AI agent that helps users by executing commands and completing tasks.\n\nYou must respond ONLY with valid JSON in this format:\n{\n  "message": "Optional message to display to the user",\n  "plan": [\n    {"step": 1, "title": "Description of step", "status": "pending|running|completed"}\n  ],\n  "command": {\n    "shell": "bash",\n    "run": "command to execute",\n    "cwd": ".",\n    "timeout_sec": 60,\n    "filter_regex": "optional regex pattern to filter output",\n    "tail_lines": 200\n  }\n}\n\nRules:\n- Always respond with valid JSON\n- Include "message" to explain what you're doing\n- Include "plan" only when a multi-step approach is helpful; otherwise omit it or return an empty array\n- Include "command" only when you need to execute a command\n- When a task is complete, respond with "message" and, if helpful, "plan" (no "command")\n- Mark completed steps in the plan with "status": "completed"\n- Be concise and helpful`;

const SYSTEM_PROMPT =
  agentsGuidance.trim().length > 0
    ? `${BASE_SYSTEM_PROMPT}\n\nThe following local operating rules are mandatory. They are sourced from AGENTS.md files present in the workspace:\n\n${agentsGuidance}`
    : BASE_SYSTEM_PROMPT;

async function runCommand(cmd, cwd, timeoutSec) {
  return new Promise((resolve) => {
    const startTime = Date.now();
    const proc = spawn(cmd, { cwd, shell: true });
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

function applyFilter(text, regex) {
  if (!regex) return text;
  try {
    const pattern = new RegExp(regex, 'i');
    return text
      .split('\n')
      .filter((line) => pattern.test(line))
      .join('\n');
  } catch (e) {
    return text;
  }
}

function tailLines(text, lines) {
  if (!lines) return text;
  const allLines = text.split('\n');
  return allLines.slice(-lines).join('\n');
}

function wrapStructuredContent(message) {
  if (!message) {
    return '';
  }

  const trimmed = message.trim();

  if (/```/.test(trimmed)) {
    return trimmed;
  }

  const detectors = [
    { pattern: /(^|\n)diff --git /, language: 'diff' },
    { pattern: /python3\s*-+\s*<<\s*['"]?PY['"]?/i, language: 'python' },
  ];

  for (const detector of detectors) {
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

function formatPlan(plan) {
  if (!Array.isArray(plan) || plan.length === 0) {
    return '';
  }

  return plan
    .map((item) => {
      const status = item.status || 'pending';
      const symbol = status === 'completed' ? '[✔]' : status === 'running' ? '[▶]' : '[•]';
      return `${symbol} Step ${item.step}: ${item.title}`;
    })
    .join('\n');
}

function formatCommandBlock(command) {
  if (!command) {
    return '';
  }

  const lines = [
    `Shell: ${command.shell || 'bash'}`,
    `Directory: ${command.cwd || '.'}`,
    `Timeout: ${(command.timeout_sec || 30).toString()}s`,
  ];

  if (command.run) {
    lines.push('', command.run);
  }

  return lines.join('\n');
}

function formatCommandResult(result) {
  const lines = [
    `Exit Code: ${result.exit_code}`,
    `Runtime: ${result.runtime_ms}ms`,
    `Status: ${result.killed ? 'KILLED (timeout)' : 'COMPLETED'}`,
  ];
  return lines.join('\n');
}

function formatErrorLines(error) {
  const lines = [`${error}`];

  if (error.response?.status) {
    lines.push(`Status: ${error.response.status}`);
  }

  if (error.response?.data) {
    const responseData =
      typeof error.response.data === 'string'
        ? error.response.data
        : JSON.stringify(error.response.data, null, 2);
    lines.push(`Response Data: ${responseData}`);
  }

  return lines.join('\n');
}

function displayFallback(label, content, color = 'white') {
  if (!content) {
    return;
  }

  const text = Array.isArray(content) ? content.join('\n') : String(content);
  const chalkColorFn = chalk[color] || chalk.white;
  const header = `${label} -------------`;

  console.log('');
  console.log(chalkColorFn.bold(header));
  console.log(text);
}

function renderMessageFallback(message) {
  if (!message) return;
  const rendered = renderMarkdownMessage(message);
  displayFallback('AI', rendered, 'magenta');
}

function renderPlanFallback(plan) {
  if (!Array.isArray(plan) || plan.length === 0) {
    return;
  }
  displayFallback('Plan', formatPlan(plan), 'cyan');
}

function renderCommandFallback(command) {
  if (!command) return;
  displayFallback('Command', formatCommandBlock(command), 'yellow');
}

function renderCommandResultFallback(result, stdout, stderr) {
  displayFallback('Command Result', formatCommandResult(result), 'green');
  if (stdout) {
    displayFallback('STDOUT', stdout, 'white');
  }
  if (stderr) {
    displayFallback('STDERR', stderr, 'red');
  }
}

function createInterface() {
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: true,
  });
}

function askHuman(rl, prompt) {
  return new Promise((resolve) => {
    rl.question(chalk.bold.blue(prompt), (answer) => {
      resolve((answer ?? '').trim());
    });
  });
}

async function fallbackAgentLoop() {
  const history = [
    {
      role: 'system',
      content: SYSTEM_PROMPT,
    },
  ];

  const rl = createInterface();

  console.log(chalk.bold.blue('\nOpenAgent - AI Agent with JSON Protocol'));
  console.log(chalk.dim('Type "exit" or "quit" to end the conversation.'));

  while (true) {
    const userInput = await askHuman(rl, '\nHuman ▷ ');

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
        const completion = await openai.chat.completions.create({
          model: 'gpt-5',
          messages: history,
          response_format: { type: 'json_object' },
        });

        const responseContent = completion.choices[0]?.message?.content || '';

        history.push({
          role: 'assistant',
          content: responseContent,
        });

        let parsed;
        try {
          parsed = JSON.parse(responseContent);
        } catch (error) {
          displayFallback(
            'Error',
            [
              'LLM returned invalid JSON.',
              `Response: ${responseContent}`,
              `Parse Error: ${error.message}`,
            ],
            'red'
          );
          continueLoop = false;
          break;
        }

        const hasMessage = typeof parsed.message === 'string' && parsed.message.trim().length > 0;
        const hasPlan = Array.isArray(parsed.plan) && parsed.plan.length > 0;
        const hasCommand = parsed.command && Object.keys(parsed.command).length > 0;

        if (!hasMessage && !hasPlan && !hasCommand) {
          displayFallback(
            'Error',
            [
              'Assistant response missing message, plan, and command.',
              `Response: ${responseContent}`,
            ],
            'red'
          );
          continueLoop = false;
          break;
        }

        if (hasMessage) {
          renderMessageFallback(parsed.message);
        }

        if (hasPlan) {
          renderPlanFallback(parsed.plan);
        }

        if (!hasCommand) {
          continueLoop = false;
          continue;
        }

        renderCommandFallback(parsed.command);

        const approve = (await askHuman(rl, '\nApprove running this command? (y/n) ')).toLowerCase();
        if (!(approve === 'y' || approve === 'yes')) {
          console.log(chalk.yellow('Command execution canceled by human.'));
          const observation = {
            observation_for_llm: {
              canceled_by_human: true,
              message: 'Human declined to execute the proposed command.',
            },
            observation_metadata: {
              timestamp: new Date().toISOString(),
            },
          };
          history.push({
            role: 'user',
            content: JSON.stringify(observation),
          });
          continue;
        }

        const result = await runCommand(
          parsed.command.run,
          parsed.command.cwd || '.',
          parsed.command.timeout_sec || 30
        );

        let filteredStdout = result.stdout;
        let filteredStderr = result.stderr;

        if (parsed.command.filter_regex) {
          filteredStdout = applyFilter(filteredStdout, parsed.command.filter_regex);
          filteredStderr = applyFilter(filteredStderr, parsed.command.filter_regex);
        }

        if (parsed.command.tail_lines) {
          filteredStdout = tailLines(filteredStdout, parsed.command.tail_lines);
          filteredStderr = tailLines(filteredStderr, parsed.command.tail_lines);
        }

        renderCommandResultFallback(result, filteredStdout, filteredStderr);

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
      displayFallback('Error', formatErrorLines(error), 'red');
    }
  }

  rl.close();
}

function Block({ heading, color = 'white', body }) {
  const textContent = Array.isArray(body) ? body.join('\n') : String(body || '');
  const lines = textContent.split('\n');

  const bgColorPalette = {
    magenta: '#1d1124',
    cyan: '#112024',
    yellow: '#241f11',
    green: '#122414',
    red: '#241112',
    blue: '#111824',
    white: '#181818',
    default: '#181818',
  };

  const textColorPalette = {
    magenta: '#f2e8ff',
    cyan: '#d7f2ff',
    yellow: '#fff5d7',
    green: '#d7ffe1',
    red: '#ffd7d7',
    blue: '#d7e4ff',
    white: '#e0e0e0',
    default: '#e0e0e0',
  };

  const backgroundColor = bgColorPalette[color] || bgColorPalette.default;
  const foregroundColor = textColorPalette[color] || textColorPalette.default;

  const [columns] = useTerminalDimensions();
  const width = Math.max((columns || 80) - 2, 20);

  const padLine = (value = '') => {
    if (width <= 2) {
      return value.slice(0, width).padEnd(width, ' ');
    }

    const innerWidth = width - 2;
    const base = value ?? '';
    const truncated = base.length > innerWidth ? base.slice(0, innerWidth) : base;
    const padded = truncated.padEnd(innerWidth, ' ');
    return ` ${padded} `;
  };

  const headingLines = heading ? [heading] : [];
  const bodyLines = lines.length > 0 ? lines : [];

  const sections = [];

  if (headingLines.length > 0) {
    sections.push({ key: 'heading', lines: headingLines });
  }

  if (bodyLines.length > 0) {
    sections.push({ key: 'body', lines: bodyLines });
  }

  if (sections.length === 0) {
    sections.push({ key: 'empty', lines: [''] });
  }

  const renderSection = (section) => {
    const content = section.lines.length > 0 ? section.lines : [''];
    const padded = [padLine(''), ...content.map((line) => padLine(line)), padLine('')];
    return padded.map((value, index) =>
      React.createElement(Text, {
        key: `${section.key}-${index}`,
        color: foregroundColor,
        backgroundColor,
      }, value)
    );
  };

  const children = sections.flatMap((section) => renderSection(section));

  return React.createElement(
    Box,
    {
      flexDirection: 'column',
      width: '100%',
      backgroundColor,
      paddingX: 1,
    },
    ...children
  );
}

function SpinnerBlock({ message }) {
  const backgroundColor = '#241f11';
  const foregroundColor = '#fff5d7';
  const [columns] = useTerminalDimensions();
  const width = Math.max((columns || 80) - 2, 20);

  const innerWidth = Math.max(width - 2, 0);
  const maxMessageWidth = Math.max(innerWidth - 2, 0);
  const truncatedMessage = message.length > maxMessageWidth ? message.slice(0, maxMessageWidth) : message;
  const remaining = Math.max(innerWidth - (truncatedMessage.length + 2), 0);

  const padLine = (value = '') => {
    if (width <= 2) {
      return value.slice(0, width).padEnd(width, ' ');
    }
    const base = value ?? '';
    const truncated = base.length > innerWidth ? base.slice(0, innerWidth) : base;
    const padded = truncated.padEnd(innerWidth, ' ');
    return ` ${padded} `;
  };

  const blank = padLine('');

  return React.createElement(
    Box,
    { flexDirection: 'column', width: '100%', backgroundColor, paddingX: 1 },
    React.createElement(Text, { key: 'top', color: foregroundColor, backgroundColor }, blank),
    React.createElement(
      Text,
      { key: 'middle', color: foregroundColor, backgroundColor },
      ' ',
      React.createElement(Spinner, { type: 'dots' }),
      ' ',
      truncatedMessage,
      ' '.repeat(remaining),
      ' '
    ),
    React.createElement(Text, { key: 'bottom', color: foregroundColor, backgroundColor }, blank)
  );
}

function InputPanel({ label, value, onChange, onSubmit, disabled }) {
  const promptLabel = label;
  const { isRawModeSupported } = useStdin();
  const inputDisabled = disabled || !isRawModeSupported;
  const panelBackground = '#151515';
  const textColor = '#d0d0d0';
  const placeholderText = 'Type here and press Enter';
  const [columns] = useTerminalDimensions();
  const width = Math.max((columns || 80) - 2, 20);

  return React.createElement(
    Box,
    { flexDirection: 'column', width: '100%', backgroundColor: panelBackground, paddingX: 1 },
    promptLabel && promptLabel !== 'Human'
      ? React.createElement(Text, { key: 'label', color: textColor, backgroundColor: panelBackground }, pad(promptLabel))
      : null,
    inputDisabled
      ? React.createElement(Text, { key: 'disabled', color: textColor, backgroundColor: panelBackground },
        pad('Input unavailable (raw mode unsupported or locked).'))
      : React.createElement(InputField, {
        key: 'input',
        value,
        onChange,
        onSubmit,
        placeholder: placeholderText,
        textColor,
        backgroundColor: panelBackground,
        width,
      })
  );

  function pad(text = '') {
    if (width <= 2) {
      return text.slice(0, width).padEnd(width, ' ');
    }
    const innerWidth = width - 2;
    const base = text ?? '';
    const truncated = base.length > innerWidth ? base.slice(0, innerWidth) : base;
    const padded = truncated.padEnd(innerWidth, ' ');
    return ` ${padded} `;
  }
}

function InputField({ value, onChange, onSubmit, placeholder, textColor, backgroundColor, width }) {
  const { setRawMode } = useStdin();
  const [cursor, setCursor] = React.useState(value.length);

  React.useEffect(() => {
    setCursor((prev) => Math.min(prev, value.length));
  }, [value]);

  React.useEffect(() => {
    if (!setRawMode) {
      return undefined;
    }
    setRawMode(true);
    return () => {
      setRawMode(false);
    };
  }, [setRawMode]);

  useInput(
    (input, key) => {
      if (key.return) {
        onSubmit?.(value);
        return;
      }

      if (key.leftArrow) {
        setCursor((prev) => Math.max(prev - 1, 0));
        return;
      }

      if (key.rightArrow) {
        setCursor((prev) => Math.min(prev + 1, value.length));
        return;
      }

      if (key.home) {
        setCursor(0);
        return;
      }

      if (key.end) {
        setCursor(value.length);
        return;
      }

      if (key.backspace) {
        if (cursor === 0) {
          return;
        }
        const nextValue = value.slice(0, cursor - 1) + value.slice(cursor);
        setCursor((prev) => Math.max(prev - 1, 0));
        onChange(nextValue);
        return;
      }

      if (key.delete) {
        if (cursor === value.length) {
          return;
        }
        const nextValue = value.slice(0, cursor) + value.slice(cursor + 1);
        onChange(nextValue);
        return;
      }

      if (key.tab || key.escape) {
        return;
      }

      if (key.ctrl || key.meta) {
        return;
      }

      if (!input) {
        return;
      }

      const nextValue = value.slice(0, cursor) + input + value.slice(cursor);
      setCursor((prev) => prev + input.length);
      onChange(nextValue);
    },
    { isActive: true }
  );

  const isEmpty = value.length === 0;
  const displayText = isEmpty ? placeholder : value;
  const displayColor = isEmpty ? '#6f6f6f' : textColor;
  const padded = pad(displayText, width);
  const cursorIndex = Math.min(cursor, padded.length);

  const beforeCursor = padded.slice(0, cursorIndex);
  const afterCursor = padded.slice(cursorIndex);

  return React.createElement(
    Box,
    { flexDirection: 'row', width: '100%', backgroundColor },
    React.createElement(Text, { color: displayColor, backgroundColor }, beforeCursor),
    React.createElement(Text, { color: '#f0f0f0', backgroundColor }, '▏'),
    React.createElement(Text, { color: displayColor, backgroundColor }, afterCursor)
  );

  function pad(text = '', targetWidth = width) {
    if (text.length >= targetWidth) {
      return text.slice(0, targetWidth);
    }
    return text.padEnd(targetWidth, ' ');
  }
}

function AgentApp() {
  const { exit } = useApp();

  const entryIdRef = React.useRef(0);
  const [entries, setEntries] = React.useState([]);
  const [history, setHistory] = React.useState([
    {
      role: 'system',
      content: SYSTEM_PROMPT,
    },
  ]);
  const historyRef = React.useRef(history);
  React.useEffect(() => {
    historyRef.current = history;
  }, [history]);

  const [inputValue, setInputValue] = React.useState('');
  const [mode, setMode] = React.useState('user');
  const [promptLabel, setPromptLabel] = React.useState('Human');
  const [spinnerMessage, setSpinnerMessage] = React.useState(null);
  const [pendingCommand, setPendingCommand] = React.useState(null);

  const pushEntry = React.useCallback((entry) => {
    setEntries((prev) => [...prev, { id: entryIdRef.current++, ...entry }]);
  }, []);

  React.useEffect(() => {
    pushEntry({ heading: 'AI', color: 'magenta', body: 'Hello!' });
    pushEntry({
      heading: 'Info',
      color: 'cyan',
      body: 'OpenAgent - AI Agent with JSON Protocol\nType "exit" or "quit" to end the conversation.',
    });
  }, [pushEntry]);

  const handleAssistantResponse = React.useCallback(
    (completion, historySnapshot) => {
      const choice = completion?.choices?.[0];
      const responseContent = choice?.message?.content || '';

      const updatedHistory = [...historySnapshot, { role: 'assistant', content: responseContent }];
      setHistory(updatedHistory);

      if (!responseContent) {
        pushEntry({
          heading: 'Error',
          color: 'red',
          body: 'Assistant response was empty.',
        });
        setMode('user');
        setPromptLabel('Human');
        return;
      }

      let parsed;
      try {
        parsed = JSON.parse(responseContent);
      } catch (error) {
        pushEntry({
          heading: 'Error',
          color: 'red',
          body: `LLM returned invalid JSON.\nResponse: ${responseContent}\nParse Error: ${error.message}`,
        });
        setMode('user');
        setPromptLabel('Human');
        return;
      }

      const hasMessage = typeof parsed.message === 'string' && parsed.message.trim().length > 0;
      const hasPlan = Array.isArray(parsed.plan) && parsed.plan.length > 0;
      const hasCommand = parsed.command && Object.keys(parsed.command).length > 0;

      if (!hasMessage && !hasPlan && !hasCommand) {
        pushEntry({
          heading: 'Error',
          color: 'red',
          body: `Assistant response missing message, plan, and command.\nResponse: ${responseContent}`,
        });
        setMode('user');
        setPromptLabel('Human');
        return;
      }

      if (hasMessage) {
        pushEntry({ heading: 'AI', color: 'magenta', body: renderMarkdownMessage(parsed.message) });
      }

      if (hasPlan) {
        pushEntry({ heading: 'Plan', color: 'cyan', body: formatPlan(parsed.plan) });
      }

      if (!hasCommand) {
        setMode('user');
        setPromptLabel('Human');
        return;
      }

      setPendingCommand(parsed.command);
      pushEntry({ heading: 'Command', color: 'yellow', body: formatCommandBlock(parsed.command) });

      setMode('approval');
      setPromptLabel('Approve (y/n)');
    },
    [pushEntry]
  );

  const callAssistant = React.useCallback(
    async (historySnapshot) => {
      setSpinnerMessage('Working with OpenAI…');
      try {
        const completion = await openai.chat.completions.create({
          model: 'gpt-5',
          messages: historySnapshot,
          response_format: { type: 'json_object' },
        });

        setSpinnerMessage(null);
        handleAssistantResponse(completion, historySnapshot);
      } catch (error) {
        setSpinnerMessage(null);
        pushEntry({ heading: 'Error', color: 'red', body: formatErrorLines(error) });
        setPendingCommand(null);
        setMode('user');
        setPromptLabel('Human');
      }
    },
    [handleAssistantResponse, pushEntry]
  );

  const runAssistantTurn = React.useCallback(
    (nextHistory) => {
      setMode('locked');
      callAssistant(nextHistory);
    },
    [callAssistant]
  );

  const executeCommand = React.useCallback(
    async (command) => {
      setMode('locked');
      setSpinnerMessage('Executing command…');
      try {
        const result = await runCommand(command.run, command.cwd || '.', command.timeout_sec || 30);

        setSpinnerMessage(null);
        pushEntry({ heading: 'Command Result', color: 'green', body: formatCommandResult(result) });

        let filteredStdout = result.stdout;
        let filteredStderr = result.stderr;

        if (command.filter_regex) {
          filteredStdout = applyFilter(filteredStdout, command.filter_regex);
          filteredStderr = applyFilter(filteredStderr, command.filter_regex);
        }

        if (command.tail_lines) {
          filteredStdout = tailLines(filteredStdout, command.tail_lines);
          filteredStderr = tailLines(filteredStderr, command.tail_lines);
        }

        if (filteredStdout) {
          pushEntry({ heading: 'STDOUT', color: 'white', body: filteredStdout });
        }

        if (filteredStderr) {
          pushEntry({ heading: 'STDERR', color: 'red', body: filteredStderr });
        }

        const observation = {
          observation_for_llm: {
            stdout: filteredStdout,
            stderr: filteredStderr,
            exit_code: result.exit_code,
            truncated:
              (command.filter_regex && (result.stdout !== filteredStdout || result.stderr !== filteredStderr)) ||
              (command.tail_lines &&
                (result.stdout.split('\n').length > command.tail_lines ||
                  result.stderr.split('\n').length > command.tail_lines)),
          },
          observation_metadata: {
            runtime_ms: result.runtime_ms,
            killed: result.killed,
            timestamp: new Date().toISOString(),
          },
        };

        const updatedHistory = [
          ...historyRef.current,
          {
            role: 'user',
            content: JSON.stringify(observation),
          },
        ];

        setHistory(updatedHistory);
        setPendingCommand(null);
        runAssistantTurn(updatedHistory);
      } catch (error) {
        setSpinnerMessage(null);
        pushEntry({ heading: 'Error', color: 'red', body: `Failed to execute command.\n${error.message}` });
        setMode('user');
        setPromptLabel('Human');
      }
    },
    [pushEntry, runAssistantTurn]
  );

  const handleSubmit = React.useCallback(
    (value) => {
      const trimmed = value.trim();
      setInputValue('');

      if (!trimmed) {
        return;
      }

      if (mode === 'locked') {
        return;
      }

      if (mode === 'user') {
        if (trimmed.toLowerCase() === 'exit' || trimmed.toLowerCase() === 'quit') {
          exit();
          return;
        }

        pushEntry({ heading: 'Human', color: 'blue', body: trimmed });

        const updatedHistory = [
          ...historyRef.current,
          {
            role: 'user',
            content: trimmed,
          },
        ];

        setHistory(updatedHistory);
        setMode('locked');
        runAssistantTurn(updatedHistory);
        return;
      }

      if (mode === 'approval') {
        pushEntry({ heading: 'Human', color: 'blue', body: trimmed });

        if (!pendingCommand) {
          setMode('user');
          setPromptLabel('Human');
          return;
        }

        if (trimmed.toLowerCase() === 'y' || trimmed.toLowerCase() === 'yes') {
          executeCommand(pendingCommand);
          return;
        }

        if (trimmed.toLowerCase() === 'n' || trimmed.toLowerCase() === 'no') {
          const observation = {
            observation_for_llm: {
              canceled_by_human: true,
              message: 'Human declined to execute the proposed command.',
            },
            observation_metadata: {
              timestamp: new Date().toISOString(),
            },
          };

          const updatedHistory = [
            ...historyRef.current,
            {
              role: 'user',
              content: JSON.stringify(observation),
            },
          ];

          setHistory(updatedHistory);
          setPendingCommand(null);
          runAssistantTurn(updatedHistory);
          return;
        }

        pushEntry({
          heading: 'Error',
          color: 'red',
          body: 'Please respond with "y"/"yes" or "n"/"no".',
        });
        return;
      }
    },
    [exit, executeCommand, mode, pendingCommand, pushEntry, runAssistantTurn]
  );

  React.useEffect(() => {
    if (mode === 'user') {
      setPromptLabel('Human');
    } else if (mode === 'approval') {
      setPromptLabel('Approve (y/n)');
    } else {
      setPromptLabel('Working');
    }
  }, [mode]);

  const children = entries.map((entry) =>
    React.createElement(Block, {
      key: entry.id,
      heading: entry.heading,
      color: entry.color,
      body: entry.body,
    })
  );

  if (spinnerMessage) {
    children.push(React.createElement(SpinnerBlock, { key: 'spinner', message: spinnerMessage }));
  }

  children.push(
    React.createElement(InputPanel, {
      key: 'input-panel',
      label: promptLabel || 'Input',
      value: inputValue,
      onChange: setInputValue,
      onSubmit: handleSubmit,
      disabled: mode === 'locked',
    })
  );

  return React.createElement(
    Box,
    { flexDirection: 'column', width: '100%' },
    ...children
  );
}

if (rawModeSupported || process.env.OPENAGENT_FORCE_INK === '1') {
  render(React.createElement(AgentApp), {
    stdin: process.stdin,
    stdout: process.stdout,
    stderr: process.stderr,
  });
} else {
  console.log(chalk.yellow('Raw mode not supported; falling back to basic interface.'));
  fallbackAgentLoop();
}
