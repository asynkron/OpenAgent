import * as path from 'node:path';
import * as os from 'node:os';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import * as fsp from 'node:fs/promises';
import type { FileHandle } from 'node:fs/promises';

import type { CommandRequest } from '../contracts/index.js';
const __dirname = path.dirname(fileURLToPath(import.meta.url));

function resolveDefaultStatsPath(): string {
  const xdgDataHome = process.env.XDG_DATA_HOME && process.env.XDG_DATA_HOME.trim();
  if (xdgDataHome) {
    return path.join(xdgDataHome, 'command-tracker', 'command-stats.json');
  }

  const homeDir = process.env.HOME || os.homedir();
  if (homeDir) {
    return path.join(homeDir, '.local', 'share', 'openagent', 'command-stats.json');
  }

  return path.resolve(__dirname, '../../command-stats.json');
}

const DEFAULT_STATS_PATH = resolveDefaultStatsPath();

type CommandStatsRecord = Record<string, number>;

type CommandStatsInput = string | CommandRequest;

const resolveCommandKey = (input: CommandStatsInput): string => {
  if (typeof input === 'string') {
    const normalized = input.trim();
    return normalized || 'unknown';
  }

  const run = typeof input.run === 'string' ? input.run.trim() : '';
  if (!run) {
    return 'unknown';
  }

  const [firstToken] = run.split(/\s+/);
  return firstToken || 'unknown';
};

const parseStats = (raw: string): CommandStatsRecord => {
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') {
      return {};
    }

    return Object.entries(parsed as Record<string, unknown>).reduce<CommandStatsRecord>(
      (acc, [key, value]) => {
        if (!key) {
          return acc;
        }

        if (typeof value === 'number' && Number.isFinite(value)) {
          acc[key] = value;
          return acc;
        }

        const coerced = typeof value === 'string' ? Number.parseInt(value, 10) : Number(value);
        if (Number.isFinite(coerced)) {
          acc[key] = coerced;
        }
        return acc;
      },
      {},
    );
  } catch {
    return {};
  }
};

export async function incrementCommandCount(
  command: CommandStatsInput,
  logPath: string | null = null,
): Promise<boolean> {
  try {
    const targetPath = logPath ? path.resolve(logPath) : DEFAULT_STATS_PATH;
    const dir = path.dirname(targetPath);
    await fsp.mkdir(dir, { recursive: true });

    let data: CommandStatsRecord = {};
    try {
      const raw = await fsp.readFile(targetPath, { encoding: 'utf8' });
      data = parseStats(raw);
    } catch {
      data = {};
    }

    const cmdKey = resolveCommandKey(command);
    const existing = data[cmdKey];
    let nextValue: number;
    if (typeof existing === 'number' && Number.isFinite(existing)) {
      nextValue = existing + 1;
    } else {
      const coerced =
        typeof existing === 'string' ? Number.parseInt(existing, 10) : Number(existing);
      nextValue = Number.isFinite(coerced) ? coerced + 1 : 1;
    }
    data[cmdKey] = nextValue;

    const randomSuffix = randomBytes(6).toString('hex');
    const tempFile = path.join(dir, `._cmdstats_${Date.now()}_${randomSuffix}`);
    let handle: FileHandle | null = null;
    try {
      handle = await fsp.open(tempFile, 'w');
      await handle.writeFile(JSON.stringify(data), { encoding: 'utf8' });
      await handle.sync();
      await handle.close();
      handle = null;
      await fsp.rename(tempFile, targetPath);
      return true;
    } finally {
      if (handle) {
        await handle.close().catch(() => {});
      }
      await fsp.unlink(tempFile).catch(() => {});
    }
  } catch (_err) {
    return false;
  }
}

export default { incrementCommandCount };
