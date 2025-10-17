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
export interface PlanObservationPayload {
  plan?: PlanStep[];
  stdout?: string;
  stderr?: string;
  truncated?: boolean;
  exit_code?: number;
  json_parse_error?: boolean;
  schema_validation_error?: boolean;
  response_validation_error?: boolean;
  canceled_by_human?: boolean;
  operation_canceled?: boolean;
  summary?: string;
  details?: string;
}

export interface PlanObservation {
  observation_for_llm?: PlanObservationPayload | null;
  observation_metadata?: PlanObservationMetadata | null;
}

/**
 * Command definition nested inside a plan step.
 */
export interface PlanStepCommand extends CommandDraft {}

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
 */
export interface Plan {
  message: string;
  plan: PlanStep[];
}
