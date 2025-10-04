require('dotenv').config();
const OpenAI = require('openai');
const readline = require('readline');
const chalk = require('chalk');
const { spawn } = require('child_process');

const apiKey = process.env.OPENAI_API_KEY;

if (!apiKey) {
  console.error('Error: OPENAI_API_KEY not found in environment variables.');
  console.error('Please create a .env file with your OpenAI API key.');
  process.exit(1);
}

const openai = new OpenAI({
  apiKey: apiKey,
});

// System prompt to enforce JSON protocol
const SYSTEM_PROMPT = `You are an AI agent that helps users by executing commands and completing tasks.

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

Rules:
- Always respond with valid JSON
- Include "message" to explain what you're doing
- Include "plan" only when a multi-step approach is helpful; otherwise omit it or return an empty array
- Include "command" only when you need to execute a command
- When a task is complete, respond with "message" and, if helpful, "plan" (no "command")
- Mark completed steps in the plan with "status": "completed"
- Be concise and helpful`;

/**
 * Execute a command with timeout and capture output
 * @param {string} cmd - Command to execute
 * @param {string} cwd - Working directory
 * @param {number} timeoutSec - Timeout in seconds
 * @returns {Promise<{stdout: string, stderr: string, exit_code: number, killed: boolean, runtime_ms: number}>}
 */
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
 * Render a titled section with a colored left border.
 * The helper keeps output compact while still highlighting the speaker.
 *
 * @param {string} title - Section title label
 * @param {Function} colorFn - Chalk color function for the border/title
 * @param {Array<string>} lines - Individual content lines
 */
function renderSection(title, colorFn, lines) {
  if (!lines || lines.length === 0) return;

  const border = colorFn('│');
  console.log('');
  console.log(colorFn.bold(title));
  lines.forEach((line) => {
    if (!line) {
      console.log(border);
    } else {
      console.log(`${border} ${line}`);
    }
  });
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

  renderSection('Plan', chalk.cyan, planLines);
}

/**
 * Create readline interface with a friendlier prompt.
 */
function createInterface() {
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: true,
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

  const lines = message.split('\n');
  renderSection('AI', chalk.magenta, lines);
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
    `${chalk.gray('Timeout')}: ${command.timeout_sec || 30}s`,
  ];

  if (command.run) {
    commandLines.push('');
    commandLines.push(
      ...command.run.split('\n').map((line) => chalk.yellow(line))
    );
  }

  renderSection('Command', chalk.yellow, commandLines);
}

/**
 * Render command execution results.
 * @param {object} result - output from runCommand
 * @param {string} stdout - filtered stdout
 * @param {string} stderr - filtered stderr
 */
function renderCommandResult(result, stdout, stderr) {
  const statusLines = [
    `${chalk.gray('Exit Code')}: ${result.exit_code}`,
    `${chalk.gray('Runtime')}: ${result.runtime_ms}ms`,
    `${chalk.gray('Status')}: ${result.killed ? chalk.red('KILLED (timeout)') : chalk.green('COMPLETED')}`,
  ];

  renderSection('Command Result', chalk.green, statusLines);

  if (stdout) {
    renderSection('STDOUT', chalk.white, stdout.split('\n'));
  }

  if (stderr) {
    renderSection('STDERR', chalk.red, stderr.split('\n'));
  }
}

/**
 * Main agent loop
 */
async function agentLoop() {
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
        // Request the next assistant action
        const completion = await openai.chat.completions.create({
          model: 'gpt-5',
          messages: history,
          response_format: { type: 'json_object' },
        });

        const responseContent = completion.choices[0].message.content;

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

        // Execute the command without extra confirmation
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
      console.error(chalk.red(`Error calling OpenAI API: ${error.message}`));
      if (error.response) {
        console.error('Response:', error.response.data);
      }
    }
  }

  rl.close();
}

// Start the agent
agentLoop();
