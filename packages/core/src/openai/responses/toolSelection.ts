import type { FlexibleSchema } from '@ai-sdk/provider-utils';

import { ToolDefinition, type PlanResponse } from '../../contracts/index.js';

/**
 * API FROZEN: DO NOT CHANGE
 * Shape of a structured tool definition compatible with the AI SDK.
 * The canonical instance is exported as ToolDefinition in contracts.
 */
export interface StructuredToolDefinition {
  name?: string;
  description?: string;
  schema: FlexibleSchema<PlanResponse>;
}

/**
 * API FROZEN: DO NOT CHANGE
 * Supported tool inputs for response creation. The canonical tool is ToolDefinition.
 */
export type SupportedTool = typeof ToolDefinition | StructuredToolDefinition;

export function mapToolToSchema(tool: SupportedTool | null | undefined): StructuredToolDefinition | null {
  if (!tool || typeof tool !== 'object') {
    return null;
  }

  if (tool === ToolDefinition) {
    return ToolDefinition;
  }

  if (tool.schema) {
    return tool;
  }

  return null;
}

export function selectStructuredTool(tools: SupportedTool[] | undefined): StructuredToolDefinition | null {
  if (!tools || tools.length === 0) {
    return null;
  }

  return mapToolToSchema(tools[0]);
}
