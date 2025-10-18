declare module '@asynkron/openagent-core' {
  export * from '../packages/core/src/lib/index.js';

  const coreDefault: typeof import('../packages/core/src/lib/index.js')['default'];
  export default coreDefault;

  export type {
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
    StatusRuntimeEvent,
    ThinkingRuntimeEvent,
    UnknownRuntimeEvent,
  } from '../packages/core/src/agent/runtimeEvents.js';

  export type {
    RuntimeEvent,
    RuntimeEventBase,
    RuntimeEventObserver,
    RuntimeProperty,
    AgentRuntimeOptions,
  } from '../packages/core/src/agent/runtimeTypes.js';

  export type { ChatMessageEntry } from '../packages/core/src/contracts/index.js';
  export type { ContextUsageSummary } from '../packages/core/src/utils/contextUsage.js';
  export type { CommandResult } from '../packages/core/src/commands/run.js';
}
