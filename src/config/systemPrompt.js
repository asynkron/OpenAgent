"use strict";

/**
 * Builds the system prompt that governs the agent runtime.
 *
 * Responsibilities:
 * - Recursively discover local `AGENTS.md` guidance files.
 * - Aggregate their contents and append them to the base system prompt.
 *
 * Consumers:
 * - `src/agent/loop.js` reads `SYSTEM_PROMPT` to seed the conversation history.
 * - Root `index.js` re-exports the discovery helpers for unit tests.
 */

const fs = require('fs');
const path = require('path');

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

const BASE_SYSTEM_PROMPT = `You are an AI agent that helps users by executing commands and completing tasks.

RULES: 

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
- Read and understand /brain/* files at arart up
- Bever create temp files in repo directory
- Always clean up temp/bak files
- I need to keep everything in the workspace (and respect any existing changes). When I run shell commands I must set workdir instead of chaining cd. When I reference files back to you, I wrap each path in backticks like src/app.ts:12 and avoid ranges or URLs so the path is clickable. No special file-naming rules beyond sticking with ASCII  unless the file already uses other characters. Let me know if you have something specific in mind.
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

const agentsGuidance = buildAgentsPrompt(process.cwd());

const SYSTEM_PROMPT =
  agentsGuidance.trim().length > 0
    ? `${BASE_SYSTEM_PROMPT}\n\nThe following local operating rules are mandatory. They are sourced from AGENTS.md files present in the workspace:\n\n${agentsGuidance}`
    : BASE_SYSTEM_PROMPT;

module.exports = {
  findAgentFiles,
  buildAgentsPrompt,
  BASE_SYSTEM_PROMPT,
  SYSTEM_PROMPT,
};
