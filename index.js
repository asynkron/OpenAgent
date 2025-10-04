require('dotenv').config();
const OpenAI = require('openai');
const readlineSync = require('readline-sync');
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
- Include "plan" to show progress as a checklist
- Include "command" only when you need to execute a command
- When a task is complete, respond with only "message" and "plan" (no "command")
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
 * Render plan as a checklist
 * @param {Array} plan - Plan array from LLM
 */
function renderPlan(plan) {
  if (!plan || !Array.isArray(plan) || plan.length === 0) return;
  
  console.log('\n=== Plan ===');
  plan.forEach((item) => {
    const checkbox = item.status === 'completed' ? '[x]' : '[ ]';
    const marker = item.status === 'running' ? '▶' : ' ';
    console.log(`${marker} ${checkbox} Step ${item.step}: ${item.title}`);
  });
  console.log('============\n');
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

  console.log('OpenAgent - AI Agent with JSON Protocol');
  console.log('Type "exit" or "quit" to end the conversation.\n');

  while (true) {
    const input = readlineSync.question('You: ');
    const userInput = input.trim();

    if (!userInput) {
      continue;
    }

    if (userInput.toLowerCase() === 'exit' || userInput.toLowerCase() === 'quit') {
      console.log('Goodbye!');
      break;
    }

    // Add user message to history
    history.push({
      role: 'user',
      content: userInput,
    });

    try {
      // Call OpenAI API
      const completion = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: history,
        response_format: { type: 'json_object' },
      });

      const responseContent = completion.choices[0].message.content;
      
      // Add assistant response to history
      history.push({
        role: 'assistant',
        content: responseContent,
      });

      // Parse JSON response
      let parsed;
      try {
        parsed = JSON.parse(responseContent);
      } catch (e) {
        console.error('Error: LLM returned invalid JSON');
        console.error('Response:', responseContent);
        continue;
      }

      // Display message
      if (parsed.message) {
        console.log(`\nAgent: ${parsed.message}\n`);
      }

      // Render plan
      if (parsed.plan) {
        renderPlan(parsed.plan);
      }

      // Execute command if present
      if (parsed.command) {
        console.log(`\n=== Proposed Command ===`);
        console.log(`Shell: ${parsed.command.shell || 'bash'}`);
        console.log(`Command: ${parsed.command.run}`);
        console.log(`Working Directory: ${parsed.command.cwd || '.'}`);
        console.log(`Timeout: ${parsed.command.timeout_sec || 30} seconds`);
        console.log('========================\n');

        const proceed = readlineSync.question('Press Enter to run, or type "skip" to skip: ');
        
        if (proceed.trim().toLowerCase() === 'skip') {
          console.log('Command skipped.\n');
          
          // Send observation that command was skipped
          const observation = {
            observation_for_llm: {
              skipped: true,
              message: 'User chose to skip this command',
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

        console.log('Executing command...\n');

        // Execute the command
        const result = await runCommand(
          parsed.command.run,
          parsed.command.cwd || '.',
          parsed.command.timeout_sec || 30
        );

        // Apply filters
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

        // Display result summary
        console.log('=== Command Result ===');
        console.log(`Exit Code: ${result.exit_code}`);
        console.log(`Runtime: ${result.runtime_ms}ms`);
        if (result.killed) {
          console.log('Status: KILLED (timeout)');
        }
        console.log('======================\n');

        // Show output preview
        if (filteredStdout) {
          console.log('--- STDOUT (preview) ---');
          const preview = filteredStdout.split('\n').slice(0, 10).join('\n');
          console.log(preview);
          if (filteredStdout.split('\n').length > 10) {
            console.log('... (truncated for display, full output sent to LLM)');
          }
          console.log('------------------------\n');
        }

        if (filteredStderr) {
          console.log('--- STDERR (preview) ---');
          const preview = filteredStderr.split('\n').slice(0, 10).join('\n');
          console.log(preview);
          if (filteredStderr.split('\n').length > 10) {
            console.log('... (truncated for display, full output sent to LLM)');
          }
          console.log('------------------------\n');
        }

        // Create observation for LLM
        const observation = {
          observation_for_llm: {
            stdout: filteredStdout,
            stderr: filteredStderr,
            exit_code: result.exit_code,
            truncated:
              (parsed.command.filter_regex && (result.stdout !== filteredStdout || result.stderr !== filteredStderr)) ||
              (parsed.command.tail_lines && (result.stdout.split('\n').length > parsed.command.tail_lines || 
                result.stderr.split('\n').length > parsed.command.tail_lines)),
          },
          observation_metadata: {
            runtime_ms: result.runtime_ms,
            killed: result.killed,
            timestamp: new Date().toISOString(),
          },
        };

        // Send observation back to LLM
        history.push({
          role: 'user',
          content: JSON.stringify(observation),
        });
      }
    } catch (error) {
      console.error('Error calling OpenAI API:', error.message);
      if (error.response) {
        console.error('Response:', error.response.data);
      }
    }
  }
}

// Start the agent
agentLoop();
