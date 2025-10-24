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
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

import {
  CANONICAL_PROMPT_SECTIONS,
  CanonicalPromptFile,
} from './generatedSystemPrompts.js';

export interface WorkspaceRootInfo {
  root: string;
  source: 'git' | 'cwd';
}

const detectWorkspaceRoot = (startDir: string = process.cwd()): WorkspaceRootInfo => {
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
};

const PROMPT_FILENAMES: readonly CanonicalPromptFile[] = [
  CanonicalPromptFile.System,
  CanonicalPromptFile.Developer,
];

// Walk upwards from the compiled file until we find the package manifest.
const resolvePackageRoot = (): string => {
  const startDir = path.dirname(fileURLToPath(new URL('.', import.meta.url)));
  let currentDir = startDir;

  while (true) {
    const packageJsonPath = path.join(currentDir, 'package.json');
    try {
      const raw = fs.readFileSync(packageJsonPath, 'utf8');
      const parsed = JSON.parse(raw) as { name?: string };
      if (parsed.name === '@asynkron/openagent-core') {
        return currentDir;
      }
    } catch (_error) {
      // Continue walking up when the manifest is missing or unreadable.
    }

    const parentDir = path.dirname(currentDir);
    if (parentDir === currentDir) {
      return startDir;
    }

    currentDir = parentDir;
  }
};

const PACKAGE_ROOT = resolvePackageRoot();

const PACKAGE_PROMPTS_DIR = path.join(PACKAGE_ROOT, 'prompts');

const resolvePromptOverrideDirectories = (rootDir: string): string[] => {
  const directories: string[] = [];
  const candidate = path.resolve(path.join(rootDir, 'prompts'));

  if (candidate === PACKAGE_PROMPTS_DIR) {
    return directories;
  }

  try {
    const stat = fs.statSync(candidate);
    if (stat.isDirectory()) {
      directories.push(candidate);
    }
  } catch (_error) {
    // Ignore missing directories.
  }

  return directories;
};

export const findAgentFiles = (rootDir: string): string[] => {
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
};

export const buildAgentsPrompt = (rootDir: string): string => {
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
    .filter(Boolean);

  if (sections.length === 0) {
    return '';
  }

  return sections.join('\n\n---\n\n');
};

const readFileIfExists = (filePath: string): string => {
  try {
    const content = fs.readFileSync(filePath, 'utf8').trim();
    return content ? content : '';
  } catch (_error) {
    return '';
  }
};

export const buildBaseSystemPrompt = (rootDir: string): string => {
  const sections: string[] = CANONICAL_PROMPT_SECTIONS.map((section) => section.content);

  const promptDirs = resolvePromptOverrideDirectories(rootDir);

  for (const promptDir of promptDirs) {
    for (const fileName of PROMPT_FILENAMES) {
      const promptFile = path.join(promptDir, fileName);
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
};

export const WORKSPACE_ROOT_INFO = detectWorkspaceRoot(process.cwd());
export const BASE_SYSTEM_PROMPT = buildBaseSystemPrompt(WORKSPACE_ROOT_INFO.root);

const agentsGuidance = buildAgentsPrompt(WORKSPACE_ROOT_INFO.root);

const combinedPrompt =
  agentsGuidance.trim().length > 0
    ? `${BASE_SYSTEM_PROMPT}\n\nThe following local operating rules are mandatory. They are sourced from AGENTS.md files present in the workspace:\n\n${agentsGuidance}`
    : BASE_SYSTEM_PROMPT;

const workspaceMetadata = `Workspace metadata:\n- workspace_root: ${WORKSPACE_ROOT_INFO.root}\n- detection_source: ${WORKSPACE_ROOT_INFO.source}`;

export const SYSTEM_PROMPT = [combinedPrompt, workspaceMetadata].filter(Boolean).join('\n\n');
