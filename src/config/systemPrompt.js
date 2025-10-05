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

import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

function detectWorkspaceRoot(startDir = process.cwd()) {
  try {
    const output = execSync('git rev-parse --show-toplevel', {
      cwd: startDir,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    const candidate = output.toString().trim();
    if (candidate) {
      return { root: path.resolve(candidate), source: 'git' };
    }
  } catch (err) {
    // ignored
  }
  return { root: path.resolve(startDir), source: 'cwd' };
}

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

export const WORKSPACE_ROOT_INFO = detectWorkspaceRoot(process.cwd());
export const BASE_SYSTEM_PROMPT = buildBaseSystemPrompt(WORKSPACE_ROOT_INFO.root);

const agentsGuidance = buildAgentsPrompt(WORKSPACE_ROOT_INFO.root);

const combinedPrompt =
  agentsGuidance.trim().length > 0
    ? `${BASE_SYSTEM_PROMPT}\n\nThe following local operating rules are mandatory. They are sourced from AGENTS.md files present in the workspace:\n\n${agentsGuidance}`
    : BASE_SYSTEM_PROMPT;

const workspaceMetadata = `Workspace metadata:\n- workspace_root: ${WORKSPACE_ROOT_INFO.root}\n- detection_source: ${WORKSPACE_ROOT_INFO.source}`;

export const SYSTEM_PROMPT = [combinedPrompt, workspaceMetadata].filter(Boolean).join('\n\n');
