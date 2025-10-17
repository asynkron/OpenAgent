// Zod schemas and JSON Schema now live in the canonical contracts module.
import { PlanResponseSchema, PlanResponseJsonSchema, ToolDefinition } from '../contracts/index.js';

export const RESPONSE_PARAMETERS_SCHEMA = PlanResponseJsonSchema;

export const OPENAGENT_RESPONSE_TOOL = ToolDefinition;

export default OPENAGENT_RESPONSE_TOOL;

// Convenience named export for the Zod schema
export const OPENAGENT_RESPONSE_SCHEMA = PlanResponseSchema;
