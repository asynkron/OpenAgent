# Directory Context: bin

## Purpose & Scope

- Node.js executable entry points published with the package. Wrap CLI startup so `npx openagent` or global installs launch correctly.

## Key Files

- `openagent.js` — shebang script that imports `runCli` from `src/cli/runner.js`, executes it with process arguments, and logs fatal errors.

## Positive Signals

- Keeps the published binary thin; errors are centralized in the CLI runner.
- Uses native ES module imports, aligning with the rest of the codebase.

## Risks / Gaps

- No tests target the bin shim directly; regressions rely on integration tests covering `runCli`.

## Related Context

- CLI runtime wiring: [`../src/cli/context.md`](../src/cli/context.md).
- Package entry exports: [`../src/lib/context.md`](../src/lib/context.md).
