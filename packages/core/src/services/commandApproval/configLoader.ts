import * as fs from 'node:fs';
import * as path from 'node:path';
import chalk from 'chalk';

import type { CommandConfig } from './types.js';

const EMPTY_CONFIG: CommandConfig = { allowlist: [] };

function readConfigFile(filePath: string): CommandConfig {
  try {
    if (!fs.existsSync(filePath)) {
      return EMPTY_CONFIG;
    }

    const rawContents = fs.readFileSync(filePath, 'utf8');
    const parsed = JSON.parse(rawContents);
    if (parsed && Array.isArray(parsed.allowlist)) {
      return { allowlist: parsed.allowlist };
    }
  } catch (err) {
    console.error(
      chalk.yellow('Warning: Failed to load approved_commands.json:'),
      (err as Error).message,
    );
  }

  return EMPTY_CONFIG;
}

export function loadPreapprovedConfig(): CommandConfig {
  const configPath = path.join(process.cwd(), 'approved_commands.json');
  return readConfigFile(configPath);
}
