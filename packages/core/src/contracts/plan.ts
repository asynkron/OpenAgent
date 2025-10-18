import type { CommandDraft } from './command.js';
import { PlanStatus } from './planStatus.js';

/**
 * Scalar value that can appear inside plan metadata.
 */
export type PlanMetadataScalar = string | number | boolean | null;

/**
 * Observation metadata published alongside plan updates.
 *
 * Using a plain object keeps compatibility with existing persistence formats
 * while the scalar value restriction prevents nested Records of arbitrary depth.
 */
export interface PlanObservationMetadata {
  [key: string]: PlanMetadataScalar;
}

/**
 * Normalized observation payload that the runtime sends back to the model.
 * All properties are optional so that callers can populate only the relevant
 * fields without type assertions.
 */
/**
 * API FROZEN: DO NOT CHANGE
 * Observation payload forwarded to the model via history messages.
 */
export interface PlanObservationPayload {
  plan?: PlanStep[] | null;
  stdout?: string | null;
  stderr?: string | null;
  truncated?: boolean | null;
  exit_code?: number | null;
  json_parse_error?: boolean | null;
  schema_validation_error?: boolean | null;
  response_validation_error?: boolean | null;
  canceled_by_human?: boolean | null;
  operation_canceled?: boolean | null;
  summary?: string | null;
  details?: string | null;
}

export interface PlanObservation {
  observation_for_llm?: PlanObservationPayload | null;
  observation_metadata?: PlanObservationMetadata | null;
}

/**
 * Command definition nested inside a plan step.
 */
export interface PlanStepCommand extends CommandDraft {}

/**
 * API FROZEN: DO NOT CHANGE
 * Shape of each step in the assistant plan as returned by the model.
 */
export interface PlanStep {
  id: string;
  title: string;
  status: PlanStatus;
  waitingForId: string[];
  command: PlanStepCommand;
  observation?: PlanObservation | null;
  priority?: number | null;
}

/**
 * High-level plan returned by the assistant.
 *
 * API FROZEN: DO NOT CHANGE
 * This interface is part of the stable tool contract (see PlanResponseJsonSchema
 * and ToolDefinition). Any changes must be coordinated and versioned.
 */
export interface PlanResponse {
  message: string;
  plan: PlanStep[];
}
