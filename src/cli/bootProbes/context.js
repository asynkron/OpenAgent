import { access, readFile, readdir } from 'node:fs/promises';
import { join, delimiter } from 'node:path';

export function createBootProbeContext(cwd) {
  let rootEntriesPromise;

  const readRootEntries = async () => {
    if (!rootEntriesPromise) {
      rootEntriesPromise = readdir(cwd, { withFileTypes: true }).catch((error) => {
        rootEntriesPromise = Promise.reject(error);
        throw error;
      });
    }
    return rootEntriesPromise;
  };

  const normalizeEntries = (entries) => entries ?? [];

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

  const commandExists = async (command) => {
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
      const candidates = new Set();
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

  const fileExists = async (relativePath) => {
    try {
      await access(join(cwd, relativePath));
      return true;
    } catch {
      return false;
    }
  };

  const readTextFile = async (relativePath) => {
    try {
      return await readFile(join(cwd, relativePath), 'utf8');
    } catch {
      return null;
    }
  };

  const readJsonFile = async (relativePath) => {
    const raw = await readTextFile(relativePath);
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  };

  const getRootEntries = async () => normalizeEntries(await readRootEntries());

  const hasRootEntry = async (matcher) => {
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

  const findRootEntries = async (predicate) => {
    const entries = await getRootEntries();
    return entries.filter((entry) => predicate(entry));
  };

  const readDirEntries = async (relativePath) => {
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
} = {}) {
  const toolingSummary = typeof tooling === 'string' ? tooling.trim() : String(tooling || '').trim();

  return {
    detected: Boolean(detected),
    details: Array.isArray(details) ? details.filter(Boolean) : [],
    error: error || null,
    tooling: toolingSummary,
  };
}
