import { useCallback, useMemo } from 'react';

import type {
  AssistantMessageRuntimeEvent,
  BannerRuntimeEvent,
  CommandResultRuntimeEvent,
  ContextUsageRuntimeEvent,
  DebugRuntimeEvent,
  ErrorRuntimeEvent,
  PassRuntimeEvent,
  PlanProgressRuntimeEvent,
  PlanRuntimeEvent,
  RequestInputRuntimeEvent,
  RuntimeEvent,
  StatusRuntimeEvent,
  ThinkingRuntimeEvent,
} from './types.js';

type RuntimeEventHandler = (event: RuntimeEvent) => void;

type RuntimeEventRouterConfig = {
  onBanner: (event: BannerRuntimeEvent) => void;
  onStatus: (event: StatusRuntimeEvent) => void;
  onPass: (event: PassRuntimeEvent) => void;
  onThinking: (event: ThinkingRuntimeEvent) => void;
  onAssistantMessage: (event: AssistantMessageRuntimeEvent) => void;
  onPlan: (event: PlanRuntimeEvent) => void;
  onPlanProgress: (event: PlanProgressRuntimeEvent) => void;
  onContextUsage: (event: ContextUsageRuntimeEvent) => void;
  onCommandResult: (event: CommandResultRuntimeEvent) => void;
  onError: (event: ErrorRuntimeEvent) => void;
  onRequestInput: (event: RequestInputRuntimeEvent) => void;
  onDebug: (event: DebugRuntimeEvent) => void;
};

function buildRuntimeEventMap(config: RuntimeEventRouterConfig): Map<string, RuntimeEventHandler> {
  // Centralise runtime event routing so the Ink container stays focused on state updates.
  const map = new Map<string, RuntimeEventHandler>();
  map.set('banner', (event) => {
    config.onBanner(event as BannerRuntimeEvent);
  });
  map.set('status', (event) => {
    config.onStatus(event as StatusRuntimeEvent);
  });
  map.set('pass', (event) => {
    config.onPass(event as PassRuntimeEvent);
  });
  map.set('thinking', (event) => {
    config.onThinking(event as ThinkingRuntimeEvent);
  });
  map.set('assistant-message', (event) => {
    config.onAssistantMessage(event as AssistantMessageRuntimeEvent);
  });
  map.set('plan', (event) => {
    config.onPlan(event as PlanRuntimeEvent);
  });
  map.set('plan-progress', (event) => {
    config.onPlanProgress(event as PlanProgressRuntimeEvent);
  });
  map.set('context-usage', (event) => {
    config.onContextUsage(event as ContextUsageRuntimeEvent);
  });
  map.set('command-result', (event) => {
    config.onCommandResult(event as CommandResultRuntimeEvent);
  });
  map.set('error', (event) => {
    config.onError(event as ErrorRuntimeEvent);
  });
  map.set('request-input', (event) => {
    config.onRequestInput(event as RequestInputRuntimeEvent);
  });
  map.set('debug', (event) => {
    config.onDebug(event as DebugRuntimeEvent);
  });
  return map;
}

export function useRuntimeEventRouter(config: RuntimeEventRouterConfig): (event: RuntimeEvent) => void {
  const handlerMap = useMemo(
    () => buildRuntimeEventMap(config),
    [
      config.onAssistantMessage,
      config.onBanner,
      config.onCommandResult,
      config.onContextUsage,
      config.onDebug,
      config.onError,
      config.onPass,
      config.onPlan,
      config.onPlanProgress,
      config.onRequestInput,
      config.onStatus,
      config.onThinking,
    ],
  );

  return useCallback(
    (event: RuntimeEvent): void => {
      if (!event || typeof event !== 'object') {
        return;
      }
      const type = typeof event.type === 'string' ? event.type : null;
      if (!type) {
        return;
      }
      const handler = handlerMap.get(type);
      if (!handler) {
        return;
      }
      handler(event);
    },
    [handlerMap],
  );
}
