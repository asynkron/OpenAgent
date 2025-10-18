import type { CommandPreviewPayload } from './commandTypes.js';

export function normalizePreviewLines(preview: string | null | undefined): string[] {
  if (!preview) {
    return [];
  }

  const lines = String(preview).split('\n');
  while (lines.length > 0 && lines[lines.length - 1].trim() === '') {
    lines.pop();
  }
  return lines;
}

export function extractStdoutLines(preview: CommandPreviewPayload): string[] {
  return normalizePreviewLines(preview.stdoutPreview ?? undefined);
}

export function extractStderrLines(preview: CommandPreviewPayload): string[] {
  return normalizePreviewLines(preview.stderrPreview ?? undefined);
}
