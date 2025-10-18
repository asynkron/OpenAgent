import type { FlexibleSchema } from '@ai-sdk/provider-utils';

import { ToolDefinition, type PlanResponse } from '../../contracts/index.js';

export interface StructuredToolDefinition {
  name?: string;
  description?: string;
  schema: FlexibleSchema<PlanResponse>;
}

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
