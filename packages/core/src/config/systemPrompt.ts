/**
 * Builds the system prompt that governs the agent runtime.
 *
 * Responsibilities:
 * - Recursively discover local `AGENTS.md` guidance files.
 * - Aggregate their contents and append them to the base system prompt.
 *
 * Consumers:
 * - `src/agent/loop.ts` reads `SYSTEM_PROMPT` to seed the conversation history.
 * - Root `index.ts` re-exports the discovery helpers for unit tests.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

export interface WorkspaceRootInfo {
  root: string;
  source: 'git' | 'cwd';
}

function detectWorkspaceRoot(startDir: string = process.cwd()): WorkspaceRootInfo {
  try {
    const output = execSync('git rev-parse --show-toplevel', {
      cwd: startDir,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    const candidate = output.toString().trim();
    if (candidate) {
      return { root: path.resolve(candidate), source: 'git' };
    }
  } catch (_error) {
    // ignored
  }

  return { root: path.resolve(startDir), source: 'cwd' };
}

const PACKAGE_ROOT = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));
const PROMPT_FILENAMES: ReadonlyArray<string> = ['system.md', 'developer.md'];

function resolvePromptDirectories(rootDir: string): string[] {
  const seen = new Set<string>();
  const directories: string[] = [];
  const candidates = [path.join(rootDir, 'prompts'), path.join(PACKAGE_ROOT, 'prompts')];

  for (const candidate of candidates) {
    const resolved = path.resolve(candidate);
    if (seen.has(resolved)) {
      continue;
    }

    seen.add(resolved);

    try {
      if (fs.statSync(resolved).isDirectory()) {
        directories.push(resolved);
      }
    } catch (_error) {
      // Ignore missing directories.
    }
  }

  return directories;
}

export function findAgentFiles(rootDir: string): string[] {
  const discovered: string[] = [];

  const walk = (current: string): void => {
    let entries: fs.Dirent[] = [];
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch (_error) {
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
  };

  walk(rootDir);
  return discovered;
}

export function buildAgentsPrompt(rootDir: string): string {
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
      } catch (_error) {
        return '';
      }
    })
    .filter((section): section is string => section.length > 0);

  if (sections.length === 0) {
    return '';
  }

  return sections.join('\n\n---\n\n');
}

function readFileIfExists(filePath: string): string {
  try {
    const content = fs.readFileSync(filePath, 'utf8').trim();
    return content ? content : '';
  } catch (_error) {
    return '';
  }
}

export function buildBaseSystemPrompt(rootDir: string): string {
  const sections: string[] = [];

  const promptDirs = resolvePromptDirectories(rootDir);
  const seenFiles = new Set<string>();

  for (const promptDir of promptDirs) {
    for (const fileName of PROMPT_FILENAMES) {
      const promptFile = path.join(promptDir, fileName);
      const resolved = path.resolve(promptFile);
      if (seenFiles.has(resolved)) {
        continue;
      }

      seenFiles.add(resolved);

      const content = readFileIfExists(promptFile);
      if (content) {
        sections.push(content);
      }
    }
  }

  const brainDir = path.join(rootDir, 'brain');
  let brainFiles: string[] = [];
  try {
    brainFiles = fs
      .readdirSync(brainDir)
      .filter((fileName) => fileName.toLowerCase().endsWith('.md'))
      .sort();
  } catch (_error) {
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
