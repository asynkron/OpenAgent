import type { CommandDefinition, CommandExecutionEnvelope } from './commandTypes.js';

export function extractCommandDescription(
  command: CommandDefinition | null | undefined,
  execution: CommandExecutionEnvelope | null | undefined,
): string {
  const candidates: Array<string | null | undefined> = [
    command?.description,
    execution?.command?.description,
    execution?.description,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === 'string') {
      const trimmed = candidate.trim();
      if (trimmed) {
        return trimmed;
      }
    }
  }

  return '';
}
