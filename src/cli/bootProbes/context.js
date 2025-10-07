import { access, readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';

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
  };
}

export function createBootProbeResult({ detected = false, details = [], error = null } = {}) {
  return {
    detected: Boolean(detected),
    details: Array.isArray(details) ? details.filter(Boolean) : [],
    error: error || null,
  };
}
