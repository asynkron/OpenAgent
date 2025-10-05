"use strict";

/**
 * Implements the interactive agent loop that powers the CLI experience.
 *
 * Responsibilities:
 * - Maintain the conversation history with OpenAI responses.
 * - Render assistant output, prompt the human for approvals, and execute commands.
 * - Feed execution results back to the model to continue the workflow.
 *
 * Consumers:
 * - Root `index.js` creates a configured loop via `createAgentLoop()` and exposes it as `agentLoop`.
 * - Integration tests re-export the same function to run mocked scenarios.
 */

const chalk = require('chalk');

const { SYSTEM_PROMPT } = require('../config/systemPrompt');
const { getOpenAIClient, MODEL } = require('../openai/client');
const { startThinking, stopThinking } = require('../cli/thinking');
const { createInterface, askHuman } = require('../cli/io');
const {
  renderPlan,
  renderMessage,
  renderCommand,
  renderCommandResult,
} = require('../cli/render');
const { runCommand, runBrowse, runEdit, runRead, runReplace } = require('../commands/run');
const { applyFilter, tailLines, shellSplit } = require('../utils/text');
const {
  isPreapprovedCommand,
  isSessionApproved,
  approveForSession,
  PREAPPROVED_CFG,
} = require('../commands/preapproval');
const { incrementCommandCount } = require('../commands/commandStats');

const NO_HUMAN_AUTO_MESSAGE = "continue or say 'done'";

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

function parseReadSpecTokens(tokens) {
  const spec = {};
  const positional = [];

  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i];
    if (!token) {
      continue;
    }

    if (token.startsWith('--')) {
      const eqIndex = token.indexOf('=');
      const rawKey = eqIndex !== -1 ? token.slice(2, eqIndex) : token.slice(2);
      let value;
      if (eqIndex !== -1) {
        value = token.slice(eqIndex + 1);
      } else if (i + 1 < tokens.length && !tokens[i + 1].startsWith('--')) {
        value = tokens[i + 1];
        i += 1;
      }

      const key = rawKey.toLowerCase().replace(/-/g, '_');

      if (key === 'encoding' && value) {
        spec.encoding = value;
      } else if (key === 'max_lines' && value) {
        const parsed = parseInt(value, 10);
        if (Number.isFinite(parsed)) {
          spec.max_lines = parsed;
        }
      } else if (key === 'max_bytes' && value) {
        const parsed = parseInt(value, 10);
        if (Number.isFinite(parsed)) {
          spec.max_bytes = parsed;
        }
      }

      continue;
    }

    positional.push(token);
  }

  if (positional.length > 0) {
    spec.path = positional[0];
    if (positional.length > 1) {
      spec.paths = positional.slice(1);
    }
  }

  return spec;
}

function mergeReadSpecs(base, override) {
  const merged = { ...base };

  const orderedPaths = [];
  const addPath = (candidate) => {
    if (typeof candidate !== 'string') {
      return;
    }
    const trimmed = candidate.trim();
    if (!trimmed || orderedPaths.includes(trimmed)) {
      return;
    }
    orderedPaths.push(trimmed);
  };

  const addPathsFromSpec = (spec) => {
    if (!spec || typeof spec !== 'object') {
      return;
    }
    if (typeof spec.path === 'string') {
      addPath(spec.path);
    }
    if (Array.isArray(spec.paths)) {
      for (const candidate of spec.paths) {
        addPath(candidate);
      }
    }
  };

  addPathsFromSpec(base);
  addPathsFromSpec(override);

  if (orderedPaths.length > 0) {
    merged.path = orderedPaths[0];
    if (orderedPaths.length > 1) {
      merged.paths = orderedPaths.slice(1);
    } else {
      delete merged.paths;
    }
  } else {
    delete merged.path;
    delete merged.paths;
  }

  if (override.encoding && merged.encoding === undefined) {
    merged.encoding = override.encoding;
  }

  if (typeof override.max_lines === 'number' && merged.max_lines === undefined) {
    merged.max_lines = override.max_lines;
  }

  if (typeof override.max_bytes === 'number' && merged.max_bytes === undefined) {
    merged.max_bytes = override.max_bytes;
  }

  return merged;
}

function createAgentLoop({
  systemPrompt = SYSTEM_PROMPT,
  getClient = getOpenAIClient,
  model = MODEL,
  createInterfaceFn = createInterface,
  askHumanFn = askHuman,
  startThinkingFn = startThinking,
  stopThinkingFn = stopThinking,
  renderPlanFn = renderPlan,
  renderMessageFn = renderMessage,
  renderCommandFn = renderCommand,
  renderCommandResultFn = renderCommandResult,
  runCommandFn = runCommand,
  runBrowseFn = runBrowse,
  runEditFn = runEdit,
  runReadFn = runRead,
  runReplaceFn = runReplace,
  applyFilterFn = applyFilter,
  tailLinesFn = tailLines,
  isPreapprovedCommandFn = isPreapprovedCommand,
  isSessionApprovedFn = isSessionApproved,
  approveForSessionFn = approveForSession,
  preapprovedCfg = PREAPPROVED_CFG,
  getAutoApproveFlag = () => false,
  getNoHumanFlag = () => false,
  setNoHumanFlag = () => { },
} = {}) {
  return async function agentLoop() {
    const history = [
      {
        role: 'system',
        content: systemPrompt,
      },
    ];

    const rl = createInterfaceFn();

    let openai;
    try {
      openai = getClient();
    } catch (err) {
      console.error('Error:', err.message);
      console.error('Please create a .env file with your OpenAI API key.');
      rl.close();
      throw err;
    }

    console.log(chalk.bold.blue('\nOpenAgent - AI Agent with JSON Protocol'));
    console.log(chalk.dim('Type "exit" or "quit" to end the conversation.'));
    if (getAutoApproveFlag()) {
      console.log(
        chalk.yellow(
          'Full auto-approval mode enabled via CLI flag. All commands will run without prompting.'
        )
      );
    }
    if (getNoHumanFlag()) {
      console.log(
        chalk.yellow(
          'No-human mode enabled (--nohuman). Agent will auto-respond with "continue or say \'done\'" until the AI replies "done".'
        )
      );
    }

    try {
      while (true) {
        const noHumanActive = getNoHumanFlag();
        const userInput = noHumanActive
          ? NO_HUMAN_AUTO_MESSAGE
          : await askHumanFn(rl, '\n ▷ ');

        if (!userInput) {
          if (noHumanActive) {
            continue;
          }
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
            startThinkingFn();
            console.log('Sending request to AI');
            const completion = await openai.responses.create({
              model,
              input: history,
              text: {
                format: { type: 'json_object' },
              },
            });
            stopThinkingFn();
            console.log('Received response from AI');

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
            } catch (err) {
              console.error(chalk.red('Error: LLM returned invalid JSON'));
              console.error('Response:', responseContent);
              break;
            }

            //This is correct. AI message is just vanilla markdown.
            renderMessageFn(parsed.message);
            renderPlanFn(parsed.plan);

            if (!parsed.command) {
              if (
                typeof getNoHumanFlag === 'function' &&
                typeof setNoHumanFlag === 'function' &&
                getNoHumanFlag()
              ) {
                const maybeMessage =
                  typeof parsed.message === 'string' ? parsed.message.trim().toLowerCase() : '';
                const normalizedMessage = maybeMessage.replace(/[.!]+$/, '');
                if (normalizedMessage === 'done') {
                  setNoHumanFlag(false);
                }
              }
              continueLoop = false;
              continue;
            }


            renderCommandFn(parsed.command);

            const autoApprovedAllowlist = isPreapprovedCommandFn(parsed.command, preapprovedCfg);
            const autoApprovedSession = isSessionApprovedFn(parsed.command);
            const autoApprovedCli = getAutoApproveFlag();
            const autoApproved = autoApprovedAllowlist || autoApprovedSession || autoApprovedCli;

            if (autoApproved) {
              if (autoApprovedAllowlist) {
                console.log(chalk.green('Auto-approved by allowlist (approved_commands.json)'));
              } else if (autoApprovedSession) {
                console.log(chalk.green('Auto-approved by session approvals'));
              } else {
                console.log(chalk.green('Auto-approved by CLI flag (--auto-approve)'));
              }
            } else {
              let selection;
              while (true) {
                const input = (await askHumanFn(rl, `
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
                    message: 'Human declined to execute the proposed command and asked the AI to propose an alternative approach without executing a command.',
                  },
                  observation_metadata: {
                    timestamp: new Date().toISOString(),
                  },
                };
                history.push({ role: 'user', content: JSON.stringify(observation) });
                continue;
              } else if (selection === 2) {
                approveForSessionFn(parsed.command);
                console.log(chalk.green('Approved and added to session approvals.'));
              } else {
                console.log(chalk.green('Approved (run once).'));
              }
            }

            let result;
            if (parsed.command && parsed.command.edit) {
              result = await runEditFn(parsed.command.edit, parsed.command.cwd || '.');
            }

            if (typeof result === 'undefined' && parsed.command && parsed.command.read) {
              result = await runReadFn(parsed.command.read, parsed.command.cwd || '.');
            }

            if (typeof result === 'undefined' && parsed.command && parsed.command.replace) {
              result = await runReplaceFn(parsed.command.replace, parsed.command.cwd || '.');
            }

            if (typeof result === 'undefined') {
              const runStrRaw = typeof parsed.command.run === 'string' ? parsed.command.run : '';
              const runStr = runStrRaw.trim();

              if (runStr) {
                const tokens = shellSplit(runStr);
                const commandKeyword = tokens[0] ? tokens[0].toLowerCase() : '';

                if (commandKeyword === 'browse') {
                  const target = tokens.slice(1).join(' ').trim();
                  if (target) {
                    result = await runBrowseFn(target, parsed.command.timeout_sec ?? 60);
                  }
                } else if (commandKeyword === 'read') {
                  const readTokens = tokens.slice(1);
                  const specFromTokens = parseReadSpecTokens(readTokens);
                  const mergedSpec = mergeReadSpecs(parsed.command.read || {}, specFromTokens);

                  if (mergedSpec.path) {
                    result = await runReadFn(mergedSpec, parsed.command.cwd || '.');
                  } else {
                    result = {
                      stdout: '',
                      stderr: 'read command requires a path argument',
                      exit_code: 1,
                      killed: false,
                      runtime_ms: 0,
                    };
                  }
                }
              }

              if (typeof result === 'undefined') {
                result = await runCommandFn(
                  parsed.command.run,
                  parsed.command.cwd || '.',
                  parsed.command.timeout_sec ?? 60,
                  parsed.command.shell
                );
              }
            }

            let key = parsed?.command?.key;
            if (!key) {
              if (typeof parsed?.command?.run === 'string') {
                key = parsed.command.run.trim().split(/\s+/)[0] || 'unknown';
              } else {
                key = 'unknown';
              }
            }
            try {
              await incrementCommandCount(key);
            } catch (error) {
              // Ignore stats failures intentionally.
            }

            let filteredStdout = result.stdout;
            let filteredStderr = result.stderr;

            const outputUtils = require('../utils/output');
            const combined = outputUtils.combineStdStreams(
              filteredStdout,
              filteredStderr,
              result.exit_code ?? 0
            );
            filteredStdout = combined.stdout;
            filteredStderr = combined.stderr;

            if (parsed.command.filter_regex) {
              filteredStdout = applyFilterFn(filteredStdout, parsed.command.filter_regex);
              filteredStderr = applyFilterFn(filteredStderr, parsed.command.filter_regex);
            }

            if (parsed.command.tail_lines) {
              filteredStdout = tailLinesFn(filteredStdout, parsed.command.tail_lines);
              filteredStderr = tailLinesFn(filteredStderr, parsed.command.tail_lines);
            }

            const stdoutPreview = filteredStdout
              ? filteredStdout.split('\n').slice(0, 20).join('\n') + (filteredStdout.split('\n').length > 20 ? '\n…' : '')
              : '';
            const stderrPreview = filteredStderr
              ? filteredStderr.split('\n').slice(0, 20).join('\n') + (filteredStderr.split('\n').length > 20 ? '\n…' : '')
              : '';

            renderCommandResultFn(parsed.command, result, stdoutPreview, stderrPreview);

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
          stopThinkingFn();
          console.error(error);
          if (error.response) {
            console.error('Response:', error.response.data);
          }
        }
      }
    } finally {
      rl.close();
    }
  };
}

module.exports = {
  createAgentLoop,
  extractResponseText,
};
