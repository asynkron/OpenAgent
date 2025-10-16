export const STRATEGY_DIRECT = 'direct' as const;
export const STRATEGY_CODE_FENCE = 'code_fence' as const;
export const STRATEGY_BALANCED_SLICE = 'balanced_slice' as const;
export const STRATEGY_ESCAPED_NEWLINES = 'escaped_newlines' as const;

export type RecoveryStrategy =
  | typeof STRATEGY_DIRECT
  | typeof STRATEGY_CODE_FENCE
  | typeof STRATEGY_BALANCED_SLICE
  | typeof STRATEGY_ESCAPED_NEWLINES;

export interface ParseAttempt {
  readonly strategy: RecoveryStrategy;
  readonly error: unknown;
}

export interface ParseSuccess<T = AssistantPayload> {
  readonly ok: true;
  readonly value: T;
  readonly normalizedText: string;
  readonly recovery: { strategy: RecoveryStrategy };
}

export interface ParseFailure {
  readonly ok: false;
  readonly error: Error;
  readonly attempts: ParseAttempt[];
}

export type ParseResult<T = AssistantPayload> = ParseSuccess<T> | ParseFailure;

export type JsonLikeObject = Record<string, unknown>;

export interface AssistantCommand extends JsonLikeObject {
  run?: unknown;
  cmd?: unknown;
  command_line?: unknown;
  shell?: unknown;
  filter_regex?: string;
  tail_lines?: number;
  max_bytes?: number;
}

export interface PlanStep extends JsonLikeObject {
  command?: AssistantCommand | string | unknown[];
  substeps?: PlanStep[];
  children?: PlanStep[];
  steps?: PlanStep[];
}

export interface AssistantPayload extends JsonLikeObject {
  command?: AssistantCommand | string | unknown[];
  plan?: PlanStep[];
}

export const isPlainObject = (value: unknown): value is JsonLikeObject => {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
};

export const firstNonEmptyString = (...candidates: unknown[]): string => {
  for (const candidate of candidates) {
    if (typeof candidate !== 'string') {
      continue;
    }

    const trimmed = candidate.trim();
    if (trimmed) {
      return trimmed;
    }
  }

  return '';
};
