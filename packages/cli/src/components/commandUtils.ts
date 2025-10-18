/**
 * Aggregates the command rendering helpers so components can import a single
 * module without juggling the smaller focused utilities.
 */

import { normalizePreviewLines } from './command/previewLines.js';
import { inferCommandType } from './command/renderType.js';
import { buildHeadingDetail } from './command/detailText.js';
import { extractCommandDescription } from './command/descriptions.js';
import { buildCommandRenderData } from './command/renderData.js';

export type {
  CommandDefinition as Command,
  CommandEditSpecification,
  CommandReplaceSpecification,
  CommandExecutionSpec,
  CommandExecutionEnvelope as CommandExecution,
  CommandPreviewPayload as CommandPreview,
  CommandResultPayload as CommandResult,
  CommandRenderData,
  CommandRenderType,
  SummaryLine,
} from './command/commandTypes.js';

export { normalizePreviewLines } from './command/previewLines.js';
export { inferCommandType } from './command/renderType.js';
export { buildHeadingDetail } from './command/detailText.js';
export { extractCommandDescription } from './command/descriptions.js';
export { buildCommandRenderData } from './command/renderData.js';
export type { SummaryBuildInput } from './command/summaryLines.js';

export default {
  normalizePreviewLines,
  inferCommandType,
  buildHeadingDetail,
  extractCommandDescription,
  buildCommandRenderData,
};
