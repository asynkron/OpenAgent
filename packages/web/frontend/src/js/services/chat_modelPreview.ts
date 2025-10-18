/**
 * Command preview helpers extracted from the chat model so tests can target them
 * independently from the text utilities.
 */
import type { CommandPreview } from './chat_model.js';

export interface NormalisedPreview {
  code: string;
  language: string;
  classNames: string[];
}

export function normaliseClassList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((entry): entry is string => typeof entry === 'string' && entry.length > 0);
  }
  if (typeof value === 'string') {
    return value
      .split(/\s+/)
      .map((part) => part.trim())
      .filter((part) => part.length > 0);
  }
  return [];
}

export function normalisePreview(preview: CommandPreview | null | undefined): NormalisedPreview {
  if (!preview || typeof preview !== 'object') {
    return { code: '', language: '', classNames: [] };
  }

  const code = typeof preview.code === 'string' ? preview.code : '';
  const language = typeof preview.language === 'string' ? preview.language : '';
  const classNames = normaliseClassList(preview.classNames ?? []);
  return { code, language, classNames };
}
