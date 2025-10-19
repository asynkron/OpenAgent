import { z } from 'zod';

import { PlanStatus } from './planStatus.js';
import type {
  PlanObservation,
  PlanObservationMetadata,
  PlanObservationPayload,
  PlanResponse,
  PlanStep,
} from './plan.js';
import { CommandSchema } from './commandSchema.js';

const PlanObservationMetadataSchema: z.ZodType<PlanObservationMetadata | null | undefined> = z
  .record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()]))
  .nullable()
  .optional();

const PlanObservationPayloadSchema: z.ZodType<PlanObservationPayload> = z.lazy(() =>
  z
    .object({
      plan: z.array(z.lazy(() => PlanStepSchema)).nullable().optional(),
      stdout: z.string().nullable().optional(),
      stderr: z.string().nullable().optional(),
      truncated: z.boolean().nullable().optional(),
      exit_code: z.number().nullable().optional(),
      json_parse_error: z.boolean().nullable().optional(),
      schema_validation_error: z.boolean().nullable().optional(),
      response_validation_error: z.boolean().nullable().optional(),
      canceled_by_human: z.boolean().nullable().optional(),
      operation_canceled: z.boolean().nullable().optional(),
      summary: z.string().nullable().optional(),
      details: z.string().nullable().optional(),
    })
    .strict(),
);

const PlanObservationSchema: z.ZodType<PlanObservation> = z.lazy(() =>
  z
    .object({
      observation_for_llm: PlanObservationPayloadSchema.nullable().optional(),
      observation_metadata: PlanObservationMetadataSchema,
    })
    .strict(),
);

export const PlanStepSchema: z.ZodType<PlanStep> = z
  .object({
    id: z.string(),
    title: z.string(),
    status: z.nativeEnum(PlanStatus),
    waitingForId: z.array(z.string()).default([]),
    command: CommandSchema,
    observation: PlanObservationSchema.nullable().optional(),
  })
  .strict();

export const PlanResponseSchema: z.ZodType<PlanResponse> = z
  .object({
    message: z.string(),
    plan: z.array(PlanStepSchema),
  })
  .strict();

export { PlanObservationSchema, PlanObservationPayloadSchema, PlanObservationMetadataSchema };

/**
 * Type guard helper to validate unknown values as PlanResponse.
 */
export function isPlanResponse(value: unknown): value is PlanResponse {
  const result = PlanResponseSchema.safeParse(value);
  return result.success;
}
