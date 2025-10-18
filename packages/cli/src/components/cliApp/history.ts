import { promises as fs } from 'node:fs';
import path from 'node:path';

import type { ChatMessageEntry } from '@asynkron/openagent-core';

export interface HistorySnapshotOptions {
  history: readonly ChatMessageEntry[];
  filePath?: string | null;
}

export function formatTimestampForFilename(date = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  const hours = pad(date.getHours());
  const minutes = pad(date.getMinutes());
  const seconds = pad(date.getSeconds());
  return `${year}${month}${day}-${hours}${minutes}${seconds}`;
}

export function resolveHistoryFilePath(rawPath?: string | null): string {
  if (typeof rawPath === 'string' && rawPath.trim().length > 0) {
    return path.resolve(process.cwd(), rawPath.trim());
  }
  const timestamp = formatTimestampForFilename();
  const fallbackName = `openagent-history-${timestamp}.json`;
  return path.resolve(process.cwd(), fallbackName);
}

export async function writeHistorySnapshot({
  history,
  filePath,
}: HistorySnapshotOptions): Promise<string> {
  const targetPath = resolveHistoryFilePath(filePath ?? undefined);
  const directory = path.dirname(targetPath);
  await fs.mkdir(directory, { recursive: true });

  let serialized: string;
  try {
    const normalizedHistory = Array.isArray(history) ? [...history] : [];
    serialized = JSON.stringify(normalizedHistory, null, 2);
  } catch (error) {
    const wrapped = error instanceof Error ? error : new Error(String(error));
    wrapped.message = `Failed to serialize history: ${wrapped.message}`;
    throw wrapped;
  }

  await fs.writeFile(targetPath, `${serialized}\n`, 'utf8');
  return targetPath;
}
