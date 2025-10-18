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
      plan: z.array(z.lazy(() => PlanStepSchema)).optional(),
      stdout: z.string().optional(),
      stderr: z.string().optional(),
      truncated: z.boolean().optional(),
      exit_code: z.number().optional(),
      json_parse_error: z.boolean().optional(),
      schema_validation_error: z.boolean().optional(),
      response_validation_error: z.boolean().optional(),
      canceled_by_human: z.boolean().optional(),
      operation_canceled: z.boolean().optional(),
      summary: z.string().optional(),
      details: z.string().optional(),
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
    observation: PlanObservationSchema.optional(),
  })
  .strict();

export const PlanResponseSchema: z.ZodType<PlanResponse> = z
  .object({
    message: z.string(),
    plan: z.array(PlanStepSchema),
  })
  .strict();

export { PlanObservationSchema, PlanObservationPayloadSchema, PlanObservationMetadataSchema };
