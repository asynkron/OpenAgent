// Zod schemas and JSON Schema now live in the canonical contracts module.
import { ToolResponseSchema, ToolResponseJsonSchema, ToolDefinition } from '../contracts/index.js';

export const RESPONSE_PARAMETERS_SCHEMA = ToolResponseJsonSchema as any;

export const OPENAGENT_RESPONSE_TOOL = ToolDefinition;

export default OPENAGENT_RESPONSE_TOOL;

// Backward-compatible type aliases
export type OpenAgentCommand = import('../contracts/index.js').ToolCommand;
export type OpenAgentPlanStep = import('../contracts/index.js').ToolPlanStep;
export type OpenAgentResponse = import('../contracts/index.js').ToolResponse;

// Backward-compatible named export for the Zod schema
export const OPENAGENT_RESPONSE_SCHEMA = ToolResponseSchema;
