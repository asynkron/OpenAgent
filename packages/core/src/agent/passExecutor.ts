import { createExecutionContext } from './passExecutor/executionContext.js';
import { runPrePassSequence } from './passExecutor/prePassSequence.js';
import { resolveAssistantResponse } from './passExecutor/responseResolution.js';
import { executePlan } from './passExecutor/planExecutor.js';
import type { ExecuteAgentPassOptions } from './passExecutor/types.js';

export type { ExecuteAgentPassOptions } from './passExecutor/types.js';

export async function executeAgentPass(options: ExecuteAgentPassOptions): Promise<boolean> {
  const { options: normalized, observationBuilder, debugEmitter, planManagerAdapter, finalizePass } =
    createExecutionContext(options);

  const prePassResult = await runPrePassSequence({ options: normalized, observationBuilder, debugEmitter });
  if (prePassResult.status === 'canceled' || prePassResult.status === 'missing-content') {
    return finalizePass(false);
  }

  const assistantResolution = resolveAssistantResponse({ prePassResult, options: normalized, debugEmitter });
  if (assistantResolution.status === 'canceled') {
    return finalizePass(false);
  }
  if (assistantResolution.status === 'schema-failed') {
    return finalizePass(true);
  }

  const assistantMessage =
    typeof assistantResolution.parsed.message === 'string' ? assistantResolution.parsed.message : '';
  normalized.emitEvent({ type: 'assistant-message', message: assistantMessage });

  const planOutcome = await executePlan({
    parsedResponse: assistantResolution.parsed,
    options: normalized,
    planManagerAdapter,
    observationBuilder,
    debugEmitter,
  });

  return planOutcome === 'stop' ? finalizePass(false) : finalizePass(true);
}

export default {
  executeAgentPass,
};
