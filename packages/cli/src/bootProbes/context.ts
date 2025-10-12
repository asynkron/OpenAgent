// @ts-nocheck
import type { Dirent } from 'node:fs';
import { access, readFile, readdir } from 'node:fs/promises';
import { join, delimiter } from 'node:path';

export type BootProbeContext = {
  cwd: string;
  fileExists(relativePath: string): Promise<boolean>;
  readTextFile(relativePath: string): Promise<string | null>;
  readJsonFile<T = unknown>(relativePath: string): Promise<T | null>;
  hasRootEntry(
    matcher: string | RegExp | ((entry: Dirent) => boolean),
  ): Promise<boolean>;
  findRootEntries(predicate: (entry: Dirent) => boolean): Promise<Dirent[]>;
  readDirEntries(relativePath: string): Promise<Dirent[]>;
  getRootEntries(): Promise<Dirent[]>;
  commandExists(command: string): Promise<boolean>;
};

export type BootProbeResult = {
  detected: boolean;
  details: string[];
  error: unknown | null;
  tooling: string;
};

export function createBootProbeContext(cwd: string): BootProbeContext {
  let rootEntriesPromise: Promise<Dirent[]> | undefined;

  const readRootEntries = async (): Promise<Dirent[]> => {
    if (!rootEntriesPromise) {
      rootEntriesPromise = readdir(cwd, { withFileTypes: true }).catch((error) => {
        rootEntriesPromise = Promise.reject(error);
        throw error;
      });
    }
    return rootEntriesPromise;
  };

  const normalizeEntries = (entries: Dirent[] | undefined | null): Dirent[] => entries ?? [];

  const isWindows = process.platform === 'win32';
  const pathExtensions = isWindows
    ? (() => {
        const raw = process.env.PATHEXT;
        const candidates = raw ? raw.split(';') : ['.COM', '.EXE', '.BAT', '.CMD'];
        const normalized = candidates
          .map((value) => value.trim())
          .filter(Boolean)
          .map((value) => (value.startsWith('.') ? value : `.${value}`));
        return [''].concat([...new Set(normalized.map((value) => value.toLowerCase()))]);
      })()
    : [''];

  const commandExists = async (command: string): Promise<boolean> => {
    if (!command || typeof command !== 'string') {
      return false;
    }

    const pathVariable = process.env.PATH;
    if (!pathVariable) {
      return false;
    }

    const directories = pathVariable.split(delimiter).filter(Boolean);
    if (directories.length === 0) {
      return false;
    }

    const commandLower = command.toLowerCase();

    for (const directory of directories) {
      const candidates = new Set<string>();
      candidates.add(join(directory, command));

      if (isWindows) {
        for (const extension of pathExtensions) {
          if (!extension) {
            continue;
          }
          if (commandLower.endsWith(extension)) {
            candidates.add(join(directory, command));
          } else {
            candidates.add(join(directory, `${command}${extension}`));
          }
        }
      }

      for (const candidate of candidates) {
        try {
          await access(candidate);
          return true;
        } catch {
          // Ignore missing files and keep checking other candidates.
        }
      }
    }

    return false;
  };

  const fileExists = async (relativePath: string): Promise<boolean> => {
    try {
      await access(join(cwd, relativePath));
      return true;
    } catch {
      return false;
    }
  };

  const readTextFile = async (relativePath: string): Promise<string | null> => {
    try {
      return await readFile(join(cwd, relativePath), 'utf8');
    } catch {
      return null;
    }
  };

  const readJsonFile = async <T = unknown>(relativePath: string): Promise<T | null> => {
    const raw = await readTextFile(relativePath);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  };

  const getRootEntries = async (): Promise<Dirent[]> => normalizeEntries(await readRootEntries());

  const hasRootEntry = async (
    matcher: string | RegExp | ((entry: Dirent) => boolean),
  ): Promise<boolean> => {
    const entries = await getRootEntries();
    if (typeof matcher === 'string') {
      return entries.some((entry) => entry.name === matcher);
    }
    if (matcher instanceof RegExp) {
      return entries.some((entry) => matcher.test(entry.name));
    }
    if (typeof matcher === 'function') {
      return entries.some((entry) => matcher(entry));
    }
    return false;
  };

  const findRootEntries = async (predicate: (entry: Dirent) => boolean): Promise<Dirent[]> => {
    const entries = await getRootEntries();
    return entries.filter((entry) => predicate(entry));
  };

  const readDirEntries = async (relativePath: string): Promise<Dirent[]> => {
    try {
      return await readdir(join(cwd, relativePath), { withFileTypes: true });
    } catch {
      return [];
    }
  };

  return {
    cwd,
    fileExists,
    readTextFile,
    readJsonFile,
    hasRootEntry,
    findRootEntries,
    readDirEntries,
    getRootEntries,
    commandExists,
  };
}

export function createBootProbeResult({
  detected = false,
  details = [],
  error = null,
  tooling = '',
}: Partial<BootProbeResult> = {}): BootProbeResult {
  const toolingSummary =
    typeof tooling === 'string' ? tooling.trim() : String(tooling || '').trim();

  return {
    detected: Boolean(detected),
    details: Array.isArray(details) ? details.filter(Boolean) : [],
    error: error ?? null,
    tooling: toolingSummary,
  };
}
