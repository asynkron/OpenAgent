import { createExecutionContext } from './passExecutor/executionContext.js';
import { runPrePassSequence } from './passExecutor/prePassSequence.js';
import { resolveAssistantResponse } from './passExecutor/responseResolution.js';
import { executePlan } from './passExecutor/planExecutor.js';
import type {
  AssistantResponseSuccess,
  EmitEvent,
  ExecuteAgentPassOptions,
} from './passExecutor/types.js';
import type { AssistantResolution } from './passExecutor/responseResolution.js';
import type { PlanExecutorOutcome } from './passExecutor/planExecutor.js';
import type { PrePassSequenceResult } from './passExecutor/prePassSequence.js';

export type { ExecuteAgentPassOptions } from './passExecutor/types.js';

export async function executeAgentPass(options: ExecuteAgentPassOptions): Promise<boolean> {
  const {
    options: normalized,
    observationBuilder,
    debugEmitter,
    planManagerAdapter,
    finalizePass,
  } = createExecutionContext(options);

  const prePassResult = await runPrePassSequence({
    options: normalized,
    observationBuilder,
    debugEmitter,
  });
  const prePassDecision = evaluatePrePassResult(prePassResult);
  if (prePassDecision.kind === 'finalize') {
    return finalizePass(prePassDecision.success);
  }

  const assistantResolution = resolveAssistantResponse({
    prePassResult,
    options: normalized,
    debugEmitter,
  });

  const assistantDecision = handleAssistantResolution(assistantResolution, normalized.emitEvent);
  if (assistantDecision.kind === 'finalize') {
    return finalizePass(assistantDecision.success);
  }

  const planOutcome = await executePlan({
    parsedResponse: assistantDecision.parsed,
    options: normalized,
    planManagerAdapter,
    observationBuilder,
    debugEmitter,
  });

  return finalizePass(isSuccessfulPlanOutcome(planOutcome));
}

export default {
  executeAgentPass,
};

type FlowDecision =
  | { kind: 'continue' }
  | {
      kind: 'finalize';
      success: boolean;
    };

type AssistantFlowDecision =
  | {
      kind: 'continue';
      parsed: AssistantResponseSuccess['parsed'];
    }
  | {
      kind: 'finalize';
      success: boolean;
    };

function evaluatePrePassResult(result: PrePassSequenceResult): FlowDecision {
  switch (result.status) {
    case 'canceled':
      return { kind: 'finalize', success: false };
    case 'missing-content':
      return { kind: 'finalize', success: false };
    default:
      return { kind: 'continue' };
  }
}

function handleAssistantResolution(
  resolution: AssistantResolution,
  emitEvent: EmitEvent,
): AssistantFlowDecision {
  switch (resolution.status) {
    case 'canceled':
      return { kind: 'finalize', success: false };
    case 'schema-failed':
      return { kind: 'finalize', success: true };
    case 'success': {
      emitAssistantMessage(emitEvent, resolution.parsed.message);
      return { kind: 'continue', parsed: resolution.parsed };
    }
  }
  const exhaustiveCheck: never = resolution;
  return assertUnreachable(exhaustiveCheck);
}

function emitAssistantMessage(emitEvent: EmitEvent, value: unknown): void {
  const message = extractAssistantMessage(value);
  if (message) {
    emitEvent({ type: 'assistant-message', message });
  }
}

function extractAssistantMessage(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function isSuccessfulPlanOutcome(outcome: PlanExecutorOutcome): boolean {
  return outcome !== 'stop';
}

function assertUnreachable(value: never): never {
  throw new Error(`Unhandled assistant resolution status: ${JSON.stringify(value)}`);
}
