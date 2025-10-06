# Directory Context: src/ui

## Purpose

- Houses UI bindings that connect the agent runtime to transport layers other than the CLI.
- Provides adapters that translate socket or web events into agent input queues and forward agent output events back to clients.

## Notes

- Modules here should remain framework-agnostic and accept dependency injection hooks for testing.
- Keep bindings resilient to differing event emitter APIs (`on`/`off` vs `addEventListener`/`removeEventListener`).
- Avoid bundling transport-specific dependencies; expect callers to supply compatible socket instances.

## Related Context

- Core runtime emitting events: [`../agent/context.md`](../agent/context.md)
- CLI-oriented binding for comparison: [`../cli/context.md`](../cli/context.md)
