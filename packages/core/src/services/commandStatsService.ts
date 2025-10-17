import * as path from 'node:path';
import * as os from 'node:os';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import * as fsp from 'node:fs/promises';
import type { FileHandle } from 'node:fs/promises';
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

interface CommandStats {
  [commandKey: string]: number;
}

const parseCommandStats = (raw: string): CommandStats => {
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') {
      return {};
    }

    const stats: CommandStats = {};
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof value === 'number' && Number.isFinite(value)) {
        stats[key] = value;
      } else if (typeof value === 'string') {
        const coerced = Number.parseInt(value, 10);
        if (Number.isFinite(coerced)) {
          stats[key] = coerced;
        }
      }
    }
    return stats;
  } catch {
    return {};
  }
};

export async function incrementCommandCount(
  cmdKey: string,
  logPath: string | null = null,
): Promise<boolean> {
  try {
    const targetPath = logPath ? path.resolve(logPath) : DEFAULT_STATS_PATH;
    const dir = path.dirname(targetPath);
    await fsp.mkdir(dir, { recursive: true });

    let data: CommandStats = {};
    try {
      const raw = await fsp.readFile(targetPath, { encoding: 'utf8' });
      data = parseCommandStats(raw);
    } catch {
      data = {};
    }

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
