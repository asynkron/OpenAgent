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

import * as fs from 'node:fs';
import * as path from 'node:path';

export function findAgentFiles(rootDir) {
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

export function buildAgentsPrompt(rootDir) {
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

function readFileIfExists(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8').trim();
    return content ? content : '';
  } catch (err) {
    return '';
  }
}

export function buildBaseSystemPrompt(rootDir) {
  const sections = [];

  const promptFiles = [
    path.join(rootDir, 'prompts', 'system.md'),
    path.join(rootDir, 'prompts', 'developer.md'),
  ];

  for (const promptFile of promptFiles) {
    const content = readFileIfExists(promptFile);
    if (content) {
      sections.push(content);
    }
  }

  const brainDir = path.join(rootDir, 'brain');
  let brainFiles = [];
  try {
    brainFiles = fs
      .readdirSync(brainDir)
      .filter((fileName) => fileName.toLowerCase().endsWith('.md'))
      .sort();
  } catch (err) {
    brainFiles = [];
  }

  for (const fileName of brainFiles) {
    const filePath = path.join(brainDir, fileName);
    const content = readFileIfExists(filePath);
    if (content) {
      sections.push(content);
    }
  }

  if (sections.length === 0) {
    return 'You are an AI agent that helps users by executing commands and completing tasks.';
  }

  return sections.join('\n\n');
}

export const BASE_SYSTEM_PROMPT = buildBaseSystemPrompt(process.cwd());

const agentsGuidance = buildAgentsPrompt(process.cwd());

export const SYSTEM_PROMPT =
  agentsGuidance.trim().length > 0
    ? `${BASE_SYSTEM_PROMPT}\n\nThe following local operating rules are mandatory. They are sourced from AGENTS.md files present in the workspace:\n\n${agentsGuidance}`
    : BASE_SYSTEM_PROMPT;

export default {
  findAgentFiles,
  buildAgentsPrompt,
  buildBaseSystemPrompt,
  BASE_SYSTEM_PROMPT,
  SYSTEM_PROMPT,
};
