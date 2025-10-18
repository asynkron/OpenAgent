import type {
  CommandDefinition,
  CommandExecutionEnvelope,
  CommandPreviewPayload,
  CommandRenderData,
  CommandResultPayload,
} from './commandTypes.js';
import { buildHeadingDetail } from './detailText.js';
import { extractCommandDescription } from './descriptions.js';
import { buildSummaryLines } from './summaryLines.js';
import { inferCommandType, normalizeExecution } from './renderType.js';

export function buildCommandRenderData(
  command: CommandDefinition | null | undefined,
  result: CommandResultPayload | null | undefined,
  preview: CommandPreviewPayload = {},
  execution: CommandExecutionEnvelope | null | undefined = {},
): CommandRenderData | null {
  if (!command || typeof command !== 'object') {
    return null;
  }

  const normalizedExecution = normalizeExecution(execution, preview.execution ?? undefined);
  const type = inferCommandType(command, normalizedExecution);
  const detail = buildHeadingDetail(type, normalizedExecution, command);
  const description = extractCommandDescription(command, normalizedExecution);
  const summaryLines = buildSummaryLines({ type, preview, result });

  return {
    type,
    detail,
    description,
    summaryLines,
  };
}
